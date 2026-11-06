"use client";

import { useEffect, useRef, useState } from "react";

/** Example first messages. Tap one to copy it, then paste it into the DM. */
export default function CopyIdeas({ ideas }: { ideas: string[] }) {
  const [copied, setCopied] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Some in-app browsers block the async clipboard API.
      const el = document.createElement("textarea");
      el.value = text;
      el.setAttribute("readonly", "");
      el.style.position = "fixed";
      el.style.opacity = "0";
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      el.remove();
    }
    setCopied(text);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(null), 1600);
  }

  return (
    <section className="try-ideas" aria-labelledby="try-ideas-label">
      <h2 id="try-ideas-label">Not sure what to send? Tap to copy.</h2>
      <ul>
        {ideas.map((idea) => {
          const done = copied === idea;
          return (
            <li key={idea}>
              <button
                type="button"
                className={done ? "try-idea is-copied" : "try-idea"}
                onClick={() => copy(idea)}
              >
                <span className="try-idea-text">{idea}</span>
                <span className="try-idea-state">{done ? "Copied" : "Copy"}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="try-sr" aria-live="polite">
        {copied ? `Copied “${copied}”` : ""}
      </p>
    </section>
  );
}
