"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DocChunk, DocumentRow } from "@/lib/types";

const STATE_LABEL: Record<DocumentRow["status"], string> = {
  processing: "Processing",
  ready: "Ready",
  failed: "Failed",
};

export default function BrainScreen() {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [chunks, setChunks] = useState<Pick<DocChunk, "id" | "document_id" | "content" | "chunk_index">[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/documents");
      const data = await res.json();
      setConfigured(Boolean(data.configured));
      setDocuments(data.documents ?? []);
      setChunks(data.chunks ?? []);
    } catch {
      setConfigured(false);
    }
  }, []);

  useEffect(() => {
    const kick = window.setTimeout(load, 0);
    const poll = window.setInterval(load, 8000);
    return () => {
      window.clearTimeout(kick);
      window.clearInterval(poll);
    };
  }, [load]);

  const upload = async (file: File) => {
    setUploading(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/documents/upload", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        setNotice(data.error ?? "Upload failed");
      } else {
        setNotice(`${file.name} uploaded — Maya is reading it now`);
      }
      await load();
    } catch {
      setNotice("Upload failed — is the dev server running?");
    } finally {
      setUploading(false);
    }
  };

  const docName = (id: string) =>
    documents.find((d) => d.id === id)?.filename ?? "document";

  const readyDocs = documents.filter((d) => d.status === "ready");
  const totalChunks = readyDocs.reduce((sum, d) => sum + (d.chunk_count ?? 0), 0);

  if (configured === false) {
    return (
      <section className="screen">
        <div className="empty">
          <svg viewBox="0 0 24 24">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
          </svg>
          <div className="big">Knowledge needs Supabase</div>
          <div className="fine">
            Documents are stored in a Supabase bucket and indexed with pgvector.
            Copy <code>.env.example</code> to <code>.env.local</code>, add your keys
            and run the migration — then upload your first brand document here.
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="screen">
      <div className="kn">
        <div className="kn-head">
          <div>
            <h1 className="page-title">Knowledge</h1>
            <div className="h-sub">What Maya knows about your shop, and how she sounds</div>
          </div>
          <div className="meter-wrap">
            <div className="meter-num">{totalChunks}</div>
            <div className="meter-label">
              passages Maya can answer from
              <br />
              across {readyDocs.length} document{readyDocs.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>

        <div className="kn-grid">
          <div>
            <div
              className={`drop ${dragging ? "dragover" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const file = e.dataTransfer.files?.[0];
                if (file) upload(file);
              }}
            >
              <svg viewBox="0 0 24 24">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <path d="m7 10 5-5 5 5" />
                <path d="M12 5v12" />
              </svg>
              <div className="big">Drop your brand document</div>
              <div className="fine">PDF · DOCX · price lists · FAQs · policies</div>
              <button
                className="btn primary"
                disabled={uploading}
                onClick={() => fileInput.current?.click()}
              >
                {uploading ? "Uploading…" : "Choose a file"}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.docx,.doc,.txt,.md"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) upload(file);
                  e.target.value = "";
                }}
              />
              {notice && (
                <div className="fine" style={{ textTransform: "none", marginTop: 12 }}>
                  {notice}
                </div>
              )}
            </div>

            {documents.map((doc) => (
              <div className="doc" key={doc.id}>
                <div className="doc-ico">
                  {doc.filename.toLowerCase().endsWith(".pdf")
                    ? "PDF"
                    : doc.filename.toLowerCase().match(/\.docx?$/)
                      ? "DOC"
                      : "TXT"}
                </div>
                <div>
                  <div className="doc-name">{doc.filename}</div>
                  <div className="doc-meta">
                    uploaded{" "}
                    {new Date(doc.created_at).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
                <div className={`doc-state ${doc.status}`}>
                  {doc.status === "ready" && doc.chunk_count
                    ? `${doc.chunk_count} passages`
                    : STATE_LABEL[doc.status]}
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="panel">
              <div className="panel-title">What Maya learned from your documents</div>
              <div className="panel-sub">
                Indexed automatically. Every reply cites the passages it used.
              </div>
              {chunks.length === 0 ? (
                <div className="know-row">
                  <div className="know-q">Nothing indexed yet</div>
                  <div className="know-a">
                    Upload a price list, FAQ or policy document and Maya will chunk,
                    embed and index it here. She only ever answers from what you give
                    her.
                  </div>
                </div>
              ) : (
                chunks.map((chunk) => (
                  <div className="know-row" key={chunk.id}>
                    <div className="know-a">
                      {chunk.content.length > 220
                        ? `${chunk.content.slice(0, 220)}…`
                        : chunk.content}
                    </div>
                    <div className="know-src">
                      {docName(chunk.document_id)} · ¶{chunk.chunk_index + 1}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="panel">
              <div className="panel-title">Sounds like you</div>
              <div className="panel-sub">
                Maya writes in a warm Nepali-shop register by default — add tone
                notes to your brand to tune her voice.
              </div>
              <div className="tone-sample">
                &ldquo;Namaste! Yes yes, size M is available in navy 🙏 Should I keep
                one aside for you? You can pick up anytime before 7.&rdquo;
              </div>
              <div className="tone-chips">
                <span>Nepali and English mix</span>
                <span>Warm, informal</span>
                <span>Uses 🙏</span>
                <span>Short sentences</span>
                <span>Never pushy</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
