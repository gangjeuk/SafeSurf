import { Document as LangChainDocument } from '@langchain/core/documents';
import { VectorStore } from '@langchain/core/vectorstores';
import type { VectorChunkRow } from './types.js';
import type { PGlite } from '@electric-sql/pglite';
import type { EmbeddingsInterface } from '@langchain/core/embeddings';

export interface DBSettingsConfig {
  enabled: boolean;
  anonymousUserId: string;
}

interface SearchOptions {
  threshold?: number; // 유사도 임계값 (0-1)
}

// OpenAI ada-002 = 1536, all-MiniLM-L6-v2 = 384
const VECTOR_DIMENSIONS = 1536;

export default class PGliteVectorStore extends VectorStore {
  db: PGlite;
  private initialized: boolean = false;

  declare embeddings: EmbeddingsInterface;

  constructor(embeddings: EmbeddingsInterface, pgliteInstance: PGlite) {
    super(embeddings, {});
    this.db = pgliteInstance;
  }

  _vectorstoreType(): string {
    return 'pglite';
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    await this.db.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS document (
        id         TEXT      PRIMARY KEY,
        title      TEXT      NOT NULL,
        url        TEXT,
        author     TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS vector_chunks (
        id          SERIAL PRIMARY KEY,
        document_id TEXT    NOT NULL,
        chunk_index INTEGER NOT NULL,
        content     TEXT    NOT NULL,
        embedding   VECTOR(${VECTOR_DIMENSIONS}) NOT NULL,
        token_count INTEGER,
        FOREIGN KEY (document_id) REFERENCES document(id) ON DELETE CASCADE
      );
    `);

    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_document_id ON vector_chunks(document_id);`);
    await this.db.query(
      `CREATE INDEX IF NOT EXISTS idx_embedding ON vector_chunks USING hnsw (embedding vector_cosine_ops);`,
    );

    this.initialized = true;
    console.log('PGlite database initialized');
  }

  async addVectors(vectors: number[][], documents: LangChainDocument[]): Promise<void> {
    await this.init();

    await this.db.transaction(async tx => {
      const baseTimestamp = Date.now();
      const documentIds = new Set<string>();

      for (let i = 0; i < vectors.length; i++) {
        const doc = documents[i];
        const vector = vectors[i];

        const documentId = doc.metadata?.documentId || `doc-${baseTimestamp}-${i}`;

        if (!documentIds.has(documentId)) {
          await tx.query(`INSERT INTO document (id, title) VALUES ($1, $2) ON CONFLICT (id) DO NOTHING`, [
            documentId,
            documentId,
          ]);
          documentIds.add(documentId);
        }

        await tx.query(
          `INSERT INTO vector_chunks (document_id, chunk_index, content, embedding)
           VALUES ($1, $2, $3, $4)`,
          [documentId, i, doc.pageContent, `[${vector.join(',')}]`],
        );
      }
    });
  }

  async addDocuments(documents: LangChainDocument[]): Promise<void> {
    const texts = documents.map(doc => doc.pageContent);
    const vectors = await this.embeddings.embedDocuments(texts);
    return this.addVectors(vectors, documents);
  }

  async similaritySearchVectorWithScore(
    query: number[],
    k: number,
    _options?: SearchOptions,
  ): Promise<[LangChainDocument, number][]> {
    await this.init();

    const queryVectorString = `[${query.join(',')}]`;

    const result = await this.db.query(
      `SELECT
         vc.content,
         (vc.embedding <=> $1) AS distance
       FROM vector_chunks vc
       ORDER BY vc.embedding <=> $1
       LIMIT $2`,
      [queryVectorString, k],
    );

    return (result.rows as Array<VectorChunkRow & { distance: number }>).map(row => {
      const doc = new LangChainDocument({
        pageContent: row.content,
        metadata: {},
      });
      const score = 1 - row.distance;
      return [doc, score];
    });
  }

  async similaritySearchWithScore(
    query: string,
    k: number = 4,
    options?: SearchOptions,
  ): Promise<[LangChainDocument, number][]> {
    const queryVector = await this.embeddings.embedQuery(query);
    return this.similaritySearchVectorWithScore(queryVector, k, options);
  }

  async similaritySearch(query: string, k: number = 4, options?: SearchOptions): Promise<LangChainDocument[]> {
    const results = await this.similaritySearchWithScore(query, k, options);
    return results.map(([doc]) => doc);
  }

  static async fromTexts(
    texts: string[],
    _metadatas: object | object[],
    embeddings: EmbeddingsInterface,
    dbConfig: Record<string, PGlite>,
  ): Promise<PGliteVectorStore> {
    const store = new PGliteVectorStore(embeddings, dbConfig.pgliteInstance);
    await store.init();

    const documents = texts.map(
      pageContent =>
        new LangChainDocument({
          pageContent,
        }),
    );

    await store.addDocuments(documents);
    return store;
  }

  static async fromDocuments(
    docs: LangChainDocument[],
    embeddings: EmbeddingsInterface,
    pgliteInstance: PGlite,
  ): Promise<PGliteVectorStore> {
    const store = new PGliteVectorStore(embeddings, pgliteInstance);
    await store.init();
    await store.addDocuments(docs);
    return store;
  }

  async deleteDocumentChunks(documentId: string): Promise<void> {
    await this.db.query('DELETE FROM vector_chunks WHERE document_id = $1', [documentId]);
  }

  async clear(): Promise<void> {
    await this.db.query('TRUNCATE TABLE vector_chunks CASCADE');
    await this.db.query('TRUNCATE TABLE document CASCADE');
  }
}
