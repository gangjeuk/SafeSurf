import type { Document, VectorChunk, QueryResult, VectorChunkRow, DocumentRow } from './types.js';
import type { PGlite } from '@electric-sql/pglite';

export class Retrieve {
  db: PGlite;

  constructor(pgliteInstance: PGlite) {
    this.db = pgliteInstance;
  }

  async getDocument(documentId: string): Promise<Document | null> {
    const result = await this.db.query('SELECT * FROM documents WHERE id = $1', [documentId]);

    if (result.rows.length === 0) return null;

    const row = result.rows[0] as Document;
    return {
      id: row.id,
      title: row.title,
      url: row.url,
      author: row.author,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    };
  }

  async getChunksByDocument(documentId: string): Promise<VectorChunk[]> {
    const result: QueryResult<VectorChunkRow> = await this.db.query(
      'SELECT id, document_id, chunk_index, content, embedding, token_count FROM vector_chunks WHERE document_id = $1 ORDER BY chunk_index',
      [documentId],
    );

    return result.rows.map(row => ({
      id: row.id,
      document_id: row.document_id,
      chunk_index: row.chunk_index,
      content: row.content,
      embedding: JSON.parse(row.embedding),
      token_count: row.token_count,
    }));
  }

  async searchSimilarChunks(
    embedding: number[],
    limit: number = 5,
    threshold: number = 0.5,
  ): Promise<(VectorChunk & { similarity: number })[]> {
    const result: QueryResult<VectorChunkRow> = await this.db.query(
      `SELECT 
        id, document_id, chunk_index, content, embedding, token_count,
        1 - (embedding <=> $1) as similarity
       FROM vector_chunks
       WHERE 1 - (embedding <=> $1) > $2
       ORDER BY similarity DESC
       LIMIT $3`,
      [`[${embedding.join(',')}]`, threshold, limit],
    );

    return result.rows.map(row => ({
      id: row.id,
      document_id: row.document_id,
      chunk_index: row.chunk_index,
      content: row.content,
      embedding: JSON.parse(row.embedding),
      token_count: row.token_count,
      similarity: row.similarity,
    }));
  }

  async getDocumentContent(documentId: string): Promise<string> {
    const chunks = await this.getChunksByDocument(documentId);
    return chunks.map(chunk => chunk.content).join('\n\n');
  }

  async listDocuments(limit: number = 100, offset: number = 0): Promise<Document[]> {
    const result: QueryResult<DocumentRow> = await this.db.query(
      'SELECT * FROM documents ORDER BY updated_at DESC LIMIT $1 OFFSET $2',
      [limit, offset],
    );

    return result.rows.map(row => ({
      id: row.id,
      title: row.title,
      url: row.url,
      author: row.author,
      created_at: new Date(row.created_at),
      updated_at: new Date(row.updated_at),
    }));
  }

  async getChunkCount(documentId: string): Promise<number> {
    const result = await this.db.query('SELECT COUNT(*) as count FROM vector_chunks WHERE document_id = $1', [
      documentId,
    ]);
    const row = result.rows[0] as { count: string | number };
    return typeof row.count === 'string' ? parseInt(row.count, 10) : row.count;
  }

  async getChunksByTokenRange(documentId: string, minTokens: number, maxTokens: number): Promise<VectorChunk[]> {
    const result: QueryResult<VectorChunkRow> = await this.db.query(
      `SELECT id, document_id, chunk_index, content, embedding, token_count 
       FROM vector_chunks 
       WHERE document_id = $1 
         AND token_count >= $2 
         AND token_count <= $3
       ORDER BY chunk_index`,
      [documentId, minTokens, maxTokens],
    );

    return result.rows.map(row => ({
      id: row.id,
      document_id: row.document_id,
      chunk_index: row.chunk_index,
      content: row.content,
      embedding: JSON.parse(row.embedding),
      token_count: row.token_count,
    }));
  }
}
