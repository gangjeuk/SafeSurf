import { PoolClient, QueryResult } from 'pg';

export interface ScamData {
  scam_status?: 'SUSPECTED' | 'CONFIRMED' | 'CLEARED';
  ai_response: string;
  company?: string | null;
  phone_number?: string | null;
  content?: string | null;
  coin: string;
  sns_url?: string | null;
  url: string;
  db_status?: boolean;
}

export const scam_db_insert = async (data: ScamData, client: PoolClient) => {
  const {
    scam_status,
    ai_response,
    company,
    phone_number,
    content,
    coin,
    sns_url,
    url,
    db_status
  } = data;

  const query = `
    INSERT INTO scam_comments (
      scam_status, ai_response, company, phone_number, 
      content, coin, sns_url, url, db_status, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
    ) RETURNING *;
  `;

  const queryValues = [
    scam_status || 'SUSPECTED',
    ai_response,
    company,
    phone_number,
    content,
    coin,
    sns_url,
    url,
    db_status ?? true 
  ];

  const result: QueryResult = await client.query(query, queryValues);
  return result.rows[0];
};

export const scam_db_search = async (client: PoolClient, keyword?: string) => {
  let query = `SELECT * FROM scam_comments`;
  let queryValues: any[] = [];

  if (keyword) {
    query += `
      WHERE company ILIKE $1 
      OR coin ILIKE $1 
      OR phone_number ILIKE $1 
      OR content ILIKE $1 
      OR url ILIKE $1
    `;
    queryValues = [`%${keyword}%`];
  }

  query += ` ORDER BY created_at DESC`;

  const result: QueryResult = await client.query(query, queryValues);
  return result.rows;
};