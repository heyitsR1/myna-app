/**
 * LLM provider abstraction. Two providers, hot-switchable at runtime:
 *
 *   ollama      — local models on the Mac (qwen3:8b + mxbai-embed-large),
 *                 reached from the Worker through an ngrok tunnel.
 *   cloudflare  — Workers AI, in the same platform as the app. No tunnel,
 *                 no laptop, ~2-5s per reply. Needs the `AI` binding in
 *                 wrangler.jsonc, nothing else.
 *
 * Selection: `LLM_PROVIDER` env if set; otherwise Workers AI when its
 * binding exists (i.e. running on Cloudflare), otherwise Ollama. So the
 * deployed app uses Workers AI by default, `next dev` uses Ollama, and
 * `npx wrangler secret put LLM_PROVIDER` flips the Worker without a deploy.
 *
 * Both embedding models are 1024-dim, matching `vector(1024)`, but they are
 * different spaces: after switching, re-embed the brand docs
 * (`POST /api/maintenance/reindex`) or retrieval returns noise.
 */

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type JsonSchema = Record<string, unknown>;
export type Provider = "ollama" | "cloudflare";

interface WorkersAi {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
}

async function workersAi(): Promise<WorkersAi | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = getCloudflareContext().env as { AI?: WorkersAi };
    return env.AI ?? null;
  } catch {
    return null; // not on Cloudflare (plain `next dev`)
  }
}

export async function activeProvider(): Promise<Provider> {
  const forced = process.env.LLM_PROVIDER?.trim().toLowerCase();
  if (forced === "ollama" || forced === "cloudflare") return forced;
  return (await workersAi()) ? "cloudflare" : "ollama";
}

export function providerModels(provider: Provider): { chat: string; embed: string } {
  return provider === "cloudflare"
    ? {
        chat: process.env.CF_CHAT_MODEL ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        embed: process.env.CF_EMBED_MODEL ?? "@cf/baai/bge-m3",
      }
    : {
        chat: process.env.OLLAMA_CHAT_MODEL ?? "qwen3:8b",
        embed: process.env.OLLAMA_EMBED_MODEL ?? "mxbai-embed-large",
      };
}

function ollamaBase(): string {
  return (process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
}

/**
 * Send a chat and get the model's raw text back — pass a JSON schema to
 * constrain the output. Throws on connection or HTTP failure; callers
 * degrade to needs_human.
 */
export async function chatJSON(
  system: string,
  messages: ChatMessage[],
  schema?: JsonSchema,
): Promise<string> {
  const provider = await activeProvider();
  const { chat: model } = providerModels(provider);

  if (provider === "cloudflare") {
    const ai = await workersAi();
    if (!ai) throw new Error("LLM_PROVIDER=cloudflare but the AI binding is not available (not running on Cloudflare?)");
    const out = (await ai.run(model, {
      messages: [{ role: "system", content: system }, ...messages],
      temperature: 0.3,
      max_tokens: 400,
      ...(schema ? { response_format: { type: "json_schema", json_schema: schema } } : {}),
    })) as { response?: unknown };
    const r = out?.response;
    return typeof r === "string" ? r : JSON.stringify(r ?? {});
  }

  const res = await fetch(`${ollamaBase()}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      stream: false,
      // qwen3 "thinks" for 20-40s before answering; the Worker's after() budget
      // is ~30s, so thinking must stay off or the draft is lost.
      think: false,
      keep_alive: "60m",
      options: { temperature: 0.3, num_predict: 350 },
      messages: [{ role: "system", content: system }, ...messages],
      ...(schema ? { format: schema } : {}),
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`Ollama chat failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { message?: { content?: string } };
  return data.message?.content ?? "";
}

export async function embed(input: string[]): Promise<number[][]> {
  const provider = await activeProvider();
  const { embed: model } = providerModels(provider);

  if (provider === "cloudflare") {
    const ai = await workersAi();
    if (!ai) throw new Error("LLM_PROVIDER=cloudflare but the AI binding is not available");
    const out = (await ai.run(model, { text: input })) as { data?: number[][] };
    if (!out?.data || out.data.length !== input.length) {
      throw new Error(`Workers AI returned ${out?.data?.length ?? 0} embeddings for ${input.length} inputs`);
    }
    return out.data;
  }

  const res = await fetch(`${ollamaBase()}/api/embed`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "<unreadable>");
    throw new Error(`Ollama embed failed (${res.status}): ${body.slice(0, 300)}`);
  }
  const data = (await res.json()) as { embeddings?: number[][] };
  if (!data.embeddings || data.embeddings.length !== input.length) {
    throw new Error(`Ollama returned ${data.embeddings?.length ?? 0} embeddings for ${input.length} inputs`);
  }
  return data.embeddings;
}
