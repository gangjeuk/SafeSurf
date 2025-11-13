// src/App.tsx
import { useMemo, useState } from "react";
import { OpenAIEmbeddings } from "@langchain/openai";
import { SqliteVecStore } from "./vector/SqliteVecStore";

export default function App() {
  const [tab, setTab] = useState<"save" | "search">("save");

  const apiKey =
    (process as any).env?.REACT_APP_OPENAI_API_KEY ||
    "";

  const embeddings = useMemo(
    () =>
      new OpenAIEmbeddings({
        apiKey,
        model: "text-embedding-3-small",
      }),
    [apiKey]
  );

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: 16 }}>
      <h1 style={{ marginBottom: 12 }}>Vector Save & Search (sqlite-vec + LangChain)</h1>

      {!apiKey && (
        <div style={{ padding: 12, border: "1px solid #f00", marginBottom: 12 }}>
          OpenAI API Key가 설정되지 않았습니다. .env에 키를 넣어주세요.
        </div>
      )}

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button
          onClick={() => setTab("save")}
          style={{ padding: "6px 12px", background: tab === "save" ? "black" : "white", color: tab === "save" ? "white" : "black", border: "1px solid #000" }}
        >
          저장
        </button>
        <button
          onClick={() => setTab("search")}
          style={{ padding: "6px 12px", background: tab === "search" ? "black" : "white", color: tab === "search" ? "white" : "black", border: "1px solid #000" }}
        >
          검색
        </button>
      </div>

      {tab === "save" ? <SaveForm embeddings={embeddings} /> : <SearchForm embeddings={embeddings} />}
    </div>
  );
}

function SaveForm({ embeddings }: { embeddings: OpenAIEmbeddings }) {
  const [fileId, setFileId] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setSaving(true);
    try {
      const [vec] = await embeddings.embedDocuments([content]);
      const store = new SqliteVecStore(embeddings, {});
      await store.addVectors([vec], [
        {
          pageContent: content,
          metadata: { file_id: fileId || "no_file" },
        } as any,
      ]);
      setMsg("저장 완료");
    } catch (err: any) {
      setMsg(`저장 실패: ${err?.message ?? String(err)}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <input
        placeholder="file_id"
        value={fileId}
        onChange={(e) => setFileId(e.target.value)}
        style={{ padding: 8, border: "1px solid #ccc" }}
      />
      <textarea
        placeholder="content (임베딩 대상 텍스트)"
        value={content}
        onChange={(e) => setContent(e.target.value)}
        style={{ padding: 8, border: "1px solid #ccc", minHeight: 120 }}
      />
      <button disabled={saving} style={{ padding: "8px 12px", border: "1px solid #000" }}>
        {saving ? "저장 중…" : "저장"}
      </button>
      {msg && <div style={{ marginTop: 8 }}>{msg}</div>}
    </form>
  );
}

function SearchForm({ embeddings }: { embeddings: OpenAIEmbeddings }) {
  const [query, setQuery] = useState("");
  const [k, setK] = useState(5);
  const [rows, setRows] = useState<any[]>([]);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setRunning(true);
    try {
      const q = await embeddings.embedQuery(query);
      const store = new SqliteVecStore(embeddings, {});
      const results = await store.similaritySearchVectorWithScore(q, k);
      setRows(results.map(([doc, score]) => ({
        file_id: (doc.metadata as any)?.file_id,
        content: doc.pageContent,
        score,
      })));
      setMsg(`검색 완료: ${results.length}건`);
    } catch (err: any) {
      setMsg(`검색 실패: ${err?.message ?? String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  return (
    <>
      <form onSubmit={onSearch} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <input
          placeholder="query 텍스트"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ padding: 8, border: "1px solid #ccc" }}
        />
        <input
          type="number"
          min={1}
          value={k}
          onChange={(e) => setK(Number(e.target.value))}
          style={{ width: 120, padding: 8, border: "1px solid #ccc" }}
        />
        <button disabled={running} style={{ padding: "8px 12px", border: "1px solid #000" }}>
          {running ? "검색 중…" : "검색"}
        </button>
      </form>

      {msg && <div style={{ marginTop: 8 }}>{msg}</div>}

      {rows.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <h3>결과</h3>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ borderBottom: "1px solid #ddd", textAlign: "left", padding: 6 }}>file_id</th>
                <th style={{ borderBottom: "1px solid #ddd", textAlign: "left", padding: 6 }}>content</th>
                <th style={{ borderBottom: "1px solid #ddd", textAlign: "left", padding: 6 }}>distance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>{r.file_id}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 6, whiteSpace: "pre-wrap" }}>{r.content}</td>
                  <td style={{ borderBottom: "1px solid #eee", padding: 6 }}>{r.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
