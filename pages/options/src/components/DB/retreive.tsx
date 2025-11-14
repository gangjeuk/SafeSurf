import { PGliteVectorStore, pg } from '@packages/db';
import { Search, AlertCircle, CheckCircle } from 'lucide-react';
import { useState } from 'react';
import type { OpenAIEmbeddings } from '@langchain/openai';

interface SearchResultRow {
  file_id: string;
  content: string;
  score: number;
}

function SearchForm({ embeddings }: { embeddings: OpenAIEmbeddings }) {
  const [query, setQuery] = useState('');
  const [k, setK] = useState(5);
  const [rows, setRows] = useState<SearchResultRow[]>([]);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function onSearch(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setRunning(true);

    try {
      const store = new PGliteVectorStore(embeddings, pg);
      await store.init();
      const results = await store.similaritySearchWithScore(query, k);
      setRows(
        results.map(([doc, score]) => ({
          file_id:
            (doc.metadata as Record<string, string>)?.file_id || (doc.metadata as Record<string, string>)?.documentId,
          content: doc.pageContent,
          score,
        })),
      );
      setMsg({
        type: 'success',
        text: `🎯 ${results.length}개의 결과를 찾았습니다`,
      });
    } catch (err) {
      setMsg({
        type: 'error',
        text: `검색 실패: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={onSearch}
        style={{
          background: 'white',
          borderRadius: 16,
          padding: 32,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
          marginBottom: 28,
        }}>
        <div style={{ marginBottom: 20 }}>
          <label
            htmlFor="query"
            style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: '#333',
              marginBottom: 8,
            }}>
            검색어
          </label>
          <input
            id="query"
            placeholder="찾고 싶은 내용을 입력하세요..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '2px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 14,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              transition: 'all 0.3s ease',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = '#667eea')}
            onBlur={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 12,
            marginBottom: 20,
          }}>
          <div>
            <label
              htmlFor="k"
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: '#333',
                marginBottom: 8,
              }}>
              결과 개수
            </label>
            <input
              id="k"
              type="number"
              min={1}
              max={20}
              value={k}
              onChange={e => setK(Number(e.target.value))}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '2px solid #e5e7eb',
                borderRadius: 8,
                fontSize: 14,
                boxSizing: 'border-box',
                transition: 'all 0.3s ease',
              }}
              onFocus={e => (e.currentTarget.style.borderColor = '#667eea')}
              onBlur={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button
              type="submit"
              disabled={running || !query}
              style={{
                width: '100%',
                padding: '12px 32px',
                background: running || !query ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: 'white',
                border: 'none',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 600,
                cursor: running || !query ? 'not-allowed' : 'pointer',
                transition: 'all 0.3s ease',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}>
              <Search size={18} />
              {running ? '검색 중...' : '검색'}
            </button>
          </div>
        </div>

        {msg && (
          <div
            style={{
              padding: 12,
              borderRadius: 8,
              background: msg.type === 'success' ? '#dcfce7' : '#fee2e2',
              color: msg.type === 'success' ? '#166534' : '#991b1b',
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              fontSize: 14,
              fontWeight: 500,
            }}>
            {msg.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            {msg.text}
          </div>
        )}
      </form>

      {/* Results */}
      {rows.length > 0 && (
        <div
          style={{
            background: 'white',
            borderRadius: 16,
            overflow: 'hidden',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
          }}>
          <div
            style={{
              padding: 24,
              borderBottom: '2px solid #f3f4f6',
            }}>
            <h3 style={{ margin: 0, color: '#333', fontSize: 18, fontWeight: 700 }}>검색 결과</h3>
          </div>

          <div
            style={{
              maxHeight: 600,
              overflowY: 'auto',
            }}>
            {rows.map((r, i) => (
              <div
                key={i}
                style={{
                  padding: 20,
                  borderBottom: i < rows.length - 1 ? '1px solid #f3f4f6' : 'none',
                  transition: 'all 0.3s ease',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLElement).style.background = '#f9fafb';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    marginBottom: 12,
                  }}>
                  <div>
                    <div
                      style={{
                        display: 'inline-block',
                        background: '#667eea',
                        color: 'white',
                        padding: '4px 12px',
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 600,
                      }}>
                      {r.file_id}
                    </div>
                  </div>
                  <div
                    style={{
                      background: '#f0f4ff',
                      color: '#667eea',
                      padding: '6px 14px',
                      borderRadius: 6,
                      fontSize: 13,
                      fontWeight: 600,
                    }}>
                    유사도: {(r.score * 100).toFixed(1)}%
                  </div>
                </div>
                <p
                  style={{
                    margin: 0,
                    color: '#4b5563',
                    fontSize: 14,
                    lineHeight: 1.6,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}>
                  {r.content.length > 300 ? `${r.content.substring(0, 300)}...` : r.content}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {msg && rows.length === 0 && msg.type === 'success' && (
        <div
          style={{
            background: 'white',
            borderRadius: 16,
            padding: 60,
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
          }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <p style={{ color: '#999', fontSize: 16 }}>결과가 없습니다. 다른 검색어를 시도해보세요.</p>
        </div>
      )}
    </div>
  );
}

export default SearchForm;
