import { embed } from "@/lib/llm";

export const EMBEDDING_DIM = 1024;

/**
 * Embed texts via the local Ollama embedding model (default mxbai-embed-large,
 * 1024 dims — matches the vector(1024) schema). `inputType` is kept in the
 * signature so a provider that distinguishes document vs query embeddings
 * (e.g. Voyage) can slot in later; Ollama ignores it.
 */
export async function embedTexts(
  texts: string[],
  inputType: "document" | "query",
): Promise<number[][]> {
  void inputType;
  if (texts.length === 0) return [];

  const embeddings: number[][] = [];
  const BATCH = 64;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = await embed(texts.slice(i, i + BATCH));
    embeddings.push(...batch);
  }
  return embeddings;
}
