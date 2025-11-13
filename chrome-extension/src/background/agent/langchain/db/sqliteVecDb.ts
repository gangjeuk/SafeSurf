import { createDatabase } from '@dao-xyz/sqlite3-vec';

let dbPromise: Promise<any> | null = null;

export function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await createDatabase({ mode: 'auto', directory: '/my-app' });
      await db.open();

      // 1536차원 = OpenAI text-embedding-3-small
      await db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS docs_vec
        USING vec0(embedding F32[1536]);

        CREATE TABLE IF NOT EXISTS meta(
          id INTEGER PRIMARY KEY,
          file_id TEXT,
          content TEXT,
          metadata JSON
        );
      `);
      return db;
    })();
  }
  return dbPromise;
}


export async function addVector(
  id: number,
  embedding: Float32Array,
  file_id: string,
  content: string,
  metadata: any
) {
  const db = await getDb();

  if (embedding.length !== 1536) {
    throw new Error(`embedding length must be 1536, got ${embedding.length}`);
  }
  const json = JSON.stringify(Array.from(embedding));

  await db.exec('SAVEPOINT vec_ins;');
  try {
    // --- 벡터 테이블 ---
    const s1 = await db.prepare(
      `INSERT OR REPLACE INTO docs_vec(rowid, embedding) VALUES (?1, ?2);`
    );
    await s1.bind([id, json]);
    await s1.step();
    await s1.finalize();

    // --- 메타 테이블 ---
    const s2 = await db.prepare(
      `INSERT OR REPLACE INTO meta(id, file_id, content, metadata) VALUES (?1, ?2, ?3, ?4);`
    );
    await s2.bind([id, file_id ?? '', content ?? '', JSON.stringify(metadata ?? {})]);
    await s2.step();
    await s2.finalize();

    await db.exec('RELEASE vec_ins;');
  } catch (e) {
    await db.exec('ROLLBACK TO vec_ins;');
    await db.exec('RELEASE vec_ins;');
    throw e;
  }
}

export async function searchSimilar(query: Float32Array, k = 5) {
  const db = await getDb();

  if (!query || query.length !== 1536) {
    throw new Error(`query length must be 1536, got ${query?.length ?? 0}`);
  }
  if (!Number.isFinite(k) || k <= 0) {
    throw new Error(`k must be a positive integer, got ${k}`);
  }

  const qjson = JSON.stringify(Array.from(query));

  const stmt = await db.prepare(`
    SELECT m.file_id, m.content, m.metadata, d.distance
    FROM (
      SELECT rowid, distance
      FROM docs_vec
      WHERE embedding MATCH ?1
        AND k = ?2
      ORDER BY distance ASC
    ) AS d
    JOIN meta m ON m.id = d.rowid
    ORDER BY d.distance ASC;
  `);

  const rows = await stmt.all([qjson, k]);

  return rows.map((r: any) => ({
    file_id: r.file_id,
    content: r.content,
    metadata: JSON.parse(r.metadata ?? "{}"),
    distance: Number(r.distance),
  }));
}
