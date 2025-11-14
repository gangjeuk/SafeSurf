export interface Document {
  id: string;
  title: string;
  url?: string;
  author?: string;
  created_at: Date;
  updated_at: Date;
}

export interface DocumentRow {
  id: string;
  title: string;
  url?: string;
  author?: string;
  created_at: string;
  updated_at: string;
}

export interface VectorChunk {
  id?: number;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding: number[];
  token_count?: number | null;
}

export interface VectorChunkRow {
  id: number;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding: string; // JSON 문자열로 반환됨
  token_count: number | null;
  similarity: number;
}

export interface SearchResult {
  // 벡터 정보
  chunk_id: number;
  content: string;
  chunk_index: number;
  similarity: number;
  token_count?: number;

  // 문서 정보 (JOIN으로 가져옴)
  document_id: string;
  title: string;
  url?: string;
  author?: string;
  created_at: Date;
}

export interface QueryResult<T> {
  rows: T[];
}
