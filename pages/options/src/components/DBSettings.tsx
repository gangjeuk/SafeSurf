import IngestForm from './DB/ingest';
import SearchForm from './DB/retreive';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Database, Upload, Search } from 'lucide-react';
import { useState, useMemo } from 'react';

interface DBSettingsProps {
  isDarkMode: boolean;
}

export const DBSettings: React.FC<DBSettingsProps> = ({ isDarkMode }) => {
  const [apiKey, setApiKey] = useState('');
  const [activeTab, setActiveTab] = useState<'ingest' | 'search'>('ingest');

  const embeddings = useMemo(() => {
    if (!apiKey) return null;
    return new OpenAIEmbeddings({
      openAIApiKey: apiKey,
      modelName: 'text-embedding-3-small',
    });
  }, [apiKey]);

  return (
    <section className="space-y-6">
      <div
        style={{
          background: isDarkMode ? '#1e293b' : '#f9fafb',
          minHeight: '100vh',
          padding: 40,
        }}>
        <div
          style={{
            maxWidth: 1200,
            margin: '0 auto',
          }}>
          {/* 헤더 */}
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 32,
              marginBottom: 28,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
              display: 'flex',
              alignItems: 'center',
              gap: 16,
            }}>
            <Database size={32} style={{ color: '#667eea' }} />
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 28,
                  fontWeight: 700,
                  color: '#333',
                }}>
                Vector Database
              </h1>
              <p
                style={{
                  margin: '4px 0 0 0',
                  fontSize: 14,
                  color: '#666',
                }}>
                PGlite + LangChain 기반 벡터 검색 시스템
              </p>
            </div>
          </div>

          {/* API Key 입력 */}
          <div
            style={{
              background: 'white',
              borderRadius: 16,
              padding: 32,
              marginBottom: 28,
              boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
            }}>
            <label
              htmlFor="apiKey"
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: '#333',
                marginBottom: 8,
              }}>
              OpenAI API Key
            </label>
            <input
              id="apiKey"
              type="password"
              placeholder="sk-..."
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
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

          {!apiKey ? (
            <div
              style={{
                background: 'white',
                borderRadius: 16,
                padding: 60,
                textAlign: 'center',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
              }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>🔑</div>
              <p style={{ color: '#999', fontSize: 16 }}>OpenAI API Key를 입력하세요</p>
            </div>
          ) : (
            <>
              {/* 탭 */}
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  marginBottom: 28,
                }}>
                <button
                  onClick={() => setActiveTab('ingest')}
                  style={{
                    flex: 1,
                    padding: '16px 24px',
                    background: activeTab === 'ingest' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
                    color: activeTab === 'ingest' ? 'white' : '#666',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  }}>
                  <Upload size={20} />
                  데이터 삽입
                </button>
                <button
                  onClick={() => setActiveTab('search')}
                  style={{
                    flex: 1,
                    padding: '16px 24px',
                    background: activeTab === 'search' ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'white',
                    color: activeTab === 'search' ? 'white' : '#666',
                    border: 'none',
                    borderRadius: 12,
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
                  }}>
                  <Search size={20} />
                  벡터 검색
                </button>
              </div>
              {activeTab === 'ingest' && embeddings && <IngestForm embeddings={embeddings} />}
              {activeTab === 'search' && embeddings && <SearchForm embeddings={embeddings} />}
            </>
          )}
        </div>
      </div>
    </section>
  );
};
