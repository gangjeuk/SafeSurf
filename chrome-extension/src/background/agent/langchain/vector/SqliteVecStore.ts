// src/vector/SqliteVecStore.ts
import { VectorStore } from "@langchain/core/vectorstores";
import { Document } from "@langchain/core/documents";
import type { EmbeddingsInterface } from "@langchain/core/embeddings";
import { addVector, searchSimilar } from "../db/sqliteVecDb";

// 간단 해시 (id 생성용)
function strHash(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}


export class SqliteVecStore extends VectorStore {
  _vectorstoreType(): string {
    return "sqlite-vec";
  }

  async addVectors(vectors: number[][], docs: Document[]): Promise<number> {
    for (let i = 0; i < vectors.length; i++) {
      console.log("@@@: ", vectors)
      const v = new Float32Array(vectors[i]);
      const d = docs[i];
      const id = d.metadata?.id ?? strHash(d.pageContent + (d.metadata?.file_id ?? ""));
      await addVector(
        Number(id),
        v,
        String(d.metadata?.file_id ?? ""),
        d.pageContent,
        d.metadata ?? {}
      );
    }
    return vectors.length;
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    _filter?: Record<string, unknown>
  ): Promise<[Document, number][]> {
    const q = new Float32Array(query);
    const rows = await searchSimilar(q, k);
    return rows.map((r) => [
      new Document({
        pageContent: r.content,
        metadata: { file_id: r.file_id, ...r.metadata },
      }),
      r.distance,
    ]);
  }

  static async fromTexts(
    texts: string[],
    metadatas: Record<string, unknown>[] | Record<string, unknown>,
    embeddings: EmbeddingsInterface,
  ) {
    const store = new SqliteVecStore(embeddings, {});
    const metaArr = Array.isArray(metadatas) ? metadatas : texts.map(() => metadatas);
    const embs = await embeddings.embedDocuments(texts);
    const docs = texts.map((t, i) => new Document({ pageContent: t, metadata: metaArr[i] || {} }));
    await store.addVectors(embs, docs);
    return store;
  }
}

