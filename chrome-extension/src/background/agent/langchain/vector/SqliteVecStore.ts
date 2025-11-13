import { VectorStore } from "@langchain/core/vectorstores";
import { Document, DocumentInterface } from "@langchain/core/documents";
import { addVector, searchSimilar } from "../db/sqliteVecDb";
import { Embeddings } from "@langchain/core/embeddings"; 
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";


// 간단 해시 (id 생성용)
function strHash(s: string) {
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export default class SqliteVecStore extends VectorStore {
  /*
    텍스트 삽입 : 
      fromTexts 함수를 이용해서 텍스트를 DB에 저장할 수 있어요. 동작 구조는 아래와 같습니다.
      fromTexts -> addDocuments -> addVectors -> DB 방식으로 동작됩니다.

    Context 검색 :
      similaritySearchVectorWithScore 함수를 이용해서 질문과 관련된 내용을 검색할 수 있어요.
  */
  embeddings: Embeddings;

  constructor(embeddings: Embeddings, dbConfig: Record<string, any>){
    super(embeddings, dbConfig ?? {});

    if (!embeddings) {
      throw new Error("Embeddings model is required for SqliteVecStore");
    }
    this.embeddings = embeddings;
  }

  _vectorstoreType(): string {
    return "sqlite-vec";
  }

  addVectors = async (
    vectors: number[][],
    documents: DocumentInterface[],
    options?: any
  ): Promise<string[] | void> => {
    
    const ids: string[] = [];

    for (let i = 0; i < vectors.length; i++) {
      const v = new Float32Array(vectors[i]);
      const d = documents[i]; 
      const id = d.metadata?.id ?? strHash(d.pageContent + (d.metadata?.file_id ?? ""));
      
      ids.push(String(id));

      await addVector(
        Number(id),
        v,
        String(d.metadata?.file_id ?? ""),
        d.pageContent,
        d.metadata ?? {}
      );
    }
    return ids;
  }

  addDocuments = async (documents: DocumentInterface[], options?: { [x: string]: any; }): Promise<string[] | void> => {
    const texts = documents.map((doc) => doc.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);

    return this.addVectors(vectors, documents, options);
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
    embeddings: Embeddings,
    splitter: RecursiveCharacterTextSplitter,
    options?: { [x: string]: any; }
  ): Promise<SqliteVecStore> {
    
    const metaArr = Array.isArray(metadatas) ? metadatas : texts.map(() => metadatas);
    const documents = texts.map((pageContent, i) => new Document({
      pageContent,
      metadata: metaArr[i] || {}
    }));

    const chunks = await splitter.splitDocuments(documents);

    const chunkTexts = chunks.map(doc => doc.pageContent);
    const embs = await embeddings.embedDocuments(chunkTexts);

    const store = new SqliteVecStore(embeddings, options || {});
    await store.addVectors(embs, chunks);

    return store;
  }
}

