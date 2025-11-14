import type { Document, VectorChunk } from './types.js';
import type { PGlite } from '@electric-sql/pglite';

export interface DBSettingsConfig {
  enabled: boolean;
  anonymousUserId: string;
}

// OpenAI ada-002 = 1536, all-MiniLM-L6-v2 = 384
const VECTOR_DIMENSIONS = 1536;

export class Ingest {
  db: PGlite;
  private initialized: boolean = false;

  constructor(pgliteInstance: PGlite) {
    this.db = pgliteInstance;
  }

  async init(): Promise<void> {
    if (this.initialized) return;

    await this.db.query(`
      CREATE EXTENSION IF NOT EXISTS vector;

      -- 문서 테이블
      CREATE TABLE IF NOT EXISTS documents (
        id         TEXT      PRIMARY KEY,
        title      TEXT      NOT NULL,
        url        TEXT      NOT NULL,
        author     TEXT      NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- 벡터 테이블
      CREATE TABLE IF NOT EXISTS vector_chunks (
        id          SERIAL PRIMARY KEY,
        document_id TEXT    NOT NULL,
        chunk_index INTEGER NOT NULL,
        content     TEXT    NOT NULL,
        embedding   VECTOR(${VECTOR_DIMENSIONS}) NOT NULL,
        token_count INTEGER,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
    `);

    this.initialized = true;
    console.log('PGlite database initialized');
  }

  async insertDocument(doc: Document): Promise<void> {
    await this.db.query(
      `INSERT INTO documents (id, title, url, author, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         title = $2,
         url = $3,
         author = $4,
         updated_at = $6`,
      [doc.id, doc.title, doc.url || null, doc.author || null, doc.created_at, doc.updated_at],
    );
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.db.query('DELETE FROM documents WHERE id = $1', [documentId]);
  }

  async insertVectorChunks(chunks: VectorChunk[]): Promise<void> {
    await this.db.transaction(async tx => {
      for (const chunk of chunks) {
        await tx.query(
          `INSERT INTO vector_chunks (document_id, chunk_index, content, embedding, token_count)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            chunk.document_id,
            chunk.chunk_index,
            chunk.content,
            `[${chunk.embedding.join(',')}]`,
            chunk.token_count || null,
          ],
        );
      }
    });
  }
}
