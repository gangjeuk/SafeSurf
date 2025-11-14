import { Document as LangChainDocument } from '@langchain/core/documents';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { PGliteVectorStore, pg } from '@packages/db';
import { Upload, AlertCircle, CheckCircle, FileText, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { OpenAIEmbeddings } from '@langchain/openai';

function IngestForm({ embeddings }: { embeddings: OpenAIEmbeddings }) {
  const [text, setText] = useState('');
  const [documentId, setDocumentId] = useState('');
  const [chunkSize, setChunkSize] = useState(1000);
  const [chunkOverlap, setChunkOverlap] = useState(200);
  const [running, setRunning] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  async function onIngest(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setRunning(true);

    try {
      const splitter = new RecursiveCharacterTextSplitter({
        chunkSize,
        chunkOverlap,
      });

      const chunks = await splitter.splitText(text);

      const documents = chunks.map(
        (chunk, index) =>
          new LangChainDocument({
            pageContent: chunk,
            metadata: {
              documentId: documentId || `doc-${Date.now()}`,
              chunkIndex: index,
              totalChunks: chunks.length,
            },
          }),
      );

      const store = new PGliteVectorStore(embeddings, pg);
      await store.init();
      await store.addDocuments(documents);

      setMsg({
        type: 'success',
        text: `${chunks.length}개의 청크로 분할되어 저장되었습니다!`,
      });

      setText('');
      setDocumentId('');
    } catch (err) {
      setMsg({
        type: 'error',
        text: `저장 실패: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setRunning(false);
    }
  }

  async function onClear() {
    if (!confirm('모든 데이터를 삭제하시겠습니까?')) return;

    setMsg(null);
    setRunning(true);

    try {
      const store = new PGliteVectorStore(embeddings, pg);
      await store.init();
      await store.clear();

      setMsg({
        type: 'success',
        text: '모든 데이터가 삭제되었습니다',
      });
    } catch (err) {
      setMsg({
        type: 'error',
        text: `삭제 실패: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div>
      <form
        onSubmit={onIngest}
        style={{
          background: 'white',
          borderRadius: 16,
          padding: 32,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.15)',
          marginBottom: 28,
        }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            marginBottom: 24,
            paddingBottom: 20,
            borderBottom: '2px solid #f3f4f6',
          }}>
          <FileText size={24} style={{ color: '#667eea' }} />
          <h2 style={{ margin: 0, color: '#333', fontSize: 20, fontWeight: 700 }}>문서 삽입</h2>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label
            htmlFor="documentId"
            style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: '#333',
              marginBottom: 8,
            }}>
            문서 ID (선택사항)
          </label>
          <input
            id="documentId"
            placeholder="예: article-123 (비워두면 자동 생성)"
            value={documentId}
            onChange={e => setDocumentId(e.target.value)}
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

        <div style={{ marginBottom: 20 }}>
          <label
            htmlFor="text"
            style={{
              display: 'block',
              fontSize: 14,
              fontWeight: 600,
              color: '#333',
              marginBottom: 8,
            }}>
            텍스트 내용
          </label>
          <textarea
            id="text"
            placeholder="저장할 텍스트를 입력하세요..."
            value={text}
            onChange={e => setText(e.target.value)}
            required
            rows={10}
            style={{
              width: '100%',
              padding: '12px 16px',
              border: '2px solid #e5e7eb',
              borderRadius: 8,
              fontSize: 14,
              fontFamily: 'inherit',
              boxSizing: 'border-box',
              transition: 'all 0.3s ease',
              resize: 'vertical',
            }}
            onFocus={e => (e.currentTarget.style.borderColor = '#667eea')}
            onBlur={e => (e.currentTarget.style.borderColor = '#e5e7eb')}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 12,
            marginBottom: 20,
          }}>
          <div>
            <label
              htmlFor="chunkSize"
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: '#333',
                marginBottom: 8,
              }}>
              청크 크기
            </label>
            <input
              id="chunkSize"
              type="number"
              min={100}
              max={5000}
              value={chunkSize}
              onChange={e => setChunkSize(Number(e.target.value))}
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
          <div>
            <label
              htmlFor="chunkOverlap"
              style={{
                display: 'block',
                fontSize: 14,
                fontWeight: 600,
                color: '#333',
                marginBottom: 8,
              }}>
              청크 오버랩
            </label>
            <input
              id="chunkOverlap"
              type="number"
              min={0}
              max={1000}
              value={chunkOverlap}
              onChange={e => setChunkOverlap(Number(e.target.value))}
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
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 12,
            marginBottom: msg ? 20 : 0,
          }}>
          <button
            type="submit"
            disabled={running || !text}
            style={{
              width: '100%',
              padding: '12px 32px',
              background: running || !text ? '#ccc' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: running || !text ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}>
            <Upload size={18} />
            {running ? '저장 중...' : '저장'}
          </button>
          <button
            type="button"
            onClick={onClear}
            disabled={running}
            style={{
              padding: '12px 24px',
              background: running ? '#ccc' : '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: running ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}>
            <Trash2 size={18} />
            전체 삭제
          </button>
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

      <div
        style={{
          background: '#f0f4ff',
          borderRadius: 16,
          padding: 24,
          border: '2px solid #667eea',
        }}>
        <h3 style={{ margin: '0 0 12px 0', color: '#667eea', fontSize: 16, fontWeight: 700 }}>사용 방법</h3>
        <ul
          style={{
            margin: 0,
            paddingLeft: 20,
            color: '#4b5563',
            fontSize: 14,
            lineHeight: 1.8,
          }}>
          <li>
            <strong>문서 ID:</strong> 문서를 구분하는 고유 ID
          </li>
          <li>
            <strong>텍스트 내용:</strong> 저장할 텍스트를 입력
          </li>
          <li>
            <strong>청크 크기:</strong> 텍스트를 나눌 청크의 최대 크기
          </li>
          <li>
            <strong>청크 오버랩:</strong> 인접 청크 간 중복되는 문자 수
          </li>
        </ul>
      </div>
    </div>
  );
}

export default IngestForm;
