'use client';

// Phase 5 — "Ask Your Spiderweb": ask a question, get an answer grounded
// in your own approved insights. Auth is enforced by the API route (401 →
// friendly message), matching the /approve and /upload patterns.

import { useState } from 'react';

type Source = {
  id: string;
  excerpt: string;
  similarity: number;
};

type AskState =
  | { phase: 'idle' }
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'noMatch'; message: string }
  | { phase: 'answered'; answer: string; sources: Source[] };

export default function AskPage() {
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<AskState>({ phase: 'idle' });
  const [showSources, setShowSources] = useState(false);

  async function ask() {
    const q = question.trim();
    if (!q || state.phase === 'loading') return;

    setState({ phase: 'loading' });
    setShowSources(false);

    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });

      const data = await res.json();

      if (res.status === 401) {
        setState({ phase: 'error', message: 'Please log in to ask your Spiderweb.' });
        return;
      }
      if (!res.ok) {
        setState({ phase: 'error', message: data.error || 'Something went wrong. Try again.' });
        return;
      }
      if (data.noMatch) {
        setState({ phase: 'noMatch', message: data.message });
        return;
      }

      setState({ phase: 'answered', answer: data.answer, sources: data.sources || [] });
    } catch {
      setState({ phase: 'error', message: 'Something went wrong. Try again.' });
    }
  }

  const loading = state.phase === 'loading';

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <h1 style={styles.title}>Ask Your Spiderweb</h1>
        <p style={styles.subtitle}>
          Answers come only from insights you&apos;ve captured and approved.
        </p>

        <div style={styles.inputRow}>
          <input
            style={styles.input}
            type="text"
            value={question}
            placeholder="Ask a question..."
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') ask();
            }}
            disabled={loading}
          />
          <button
            style={{
              ...styles.askButton,
              ...(loading || !question.trim() ? styles.askButtonDisabled : {}),
            }}
            onClick={ask}
            disabled={loading || !question.trim()}
          >
            {loading ? 'Thinking...' : 'Ask'}
          </button>
        </div>

        {state.phase === 'loading' && (
          <p style={styles.loadingText}>Searching your captured expertise...</p>
        )}

        {state.phase === 'error' && <p style={styles.errorText}>{state.message}</p>}

        {state.phase === 'noMatch' && (
          <div style={styles.noMatchCard}>
            <p style={styles.noMatchText}>{state.message}</p>
          </div>
        )}

        {state.phase === 'answered' && (
          <div style={styles.answerCard}>
            <p style={styles.answerText}>{state.answer}</p>

            <p style={styles.basedOn}>
              Based on {state.sources.length} of your insight
              {state.sources.length === 1 ? '' : 's'}
            </p>

            <button
              style={styles.sourcesToggle}
              onClick={() => setShowSources((s) => !s)}
            >
              {showSources ? 'Hide sources' : 'Show sources'}
            </button>

            {showSources && (
              <ul style={styles.sourceList}>
                {state.sources.map((s) => (
                  <li key={s.id} style={styles.sourceItem}>
                    <span style={styles.sourceExcerpt}>{s.excerpt}</span>
                    <span style={styles.sourceSimilarity}>
                      {Math.round(s.similarity * 100)}% match
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    justifyContent: 'center',
    padding: '48px 24px',
    fontFamily: 'system-ui, sans-serif',
  },
  container: {
    width: '100%',
    maxWidth: '640px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  title: {
    fontSize: '28px',
    fontWeight: 700,
    margin: 0,
  },
  subtitle: {
    fontSize: '15px',
    color: '#666',
    margin: 0,
  },
  inputRow: {
    display: 'flex',
    gap: '8px',
    marginTop: '8px',
  },
  input: {
    flex: 1,
    padding: '12px 16px',
    fontSize: '16px',
    border: '1px solid #ccc',
    borderRadius: '8px',
    outline: 'none',
  },
  askButton: {
    padding: '12px 24px',
    fontSize: '16px',
    fontWeight: 600,
    color: '#fff',
    backgroundColor: '#111',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
  },
  askButtonDisabled: {
    backgroundColor: '#999',
    cursor: 'default',
  },
  loadingText: {
    color: '#666',
    fontSize: '15px',
  },
  errorText: {
    color: '#c0392b',
    fontSize: '15px',
  },
  noMatchCard: {
    padding: '20px',
    backgroundColor: '#f7f7f7',
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
  },
  noMatchText: {
    margin: 0,
    color: '#555',
    fontSize: '15px',
    lineHeight: 1.6,
  },
  answerCard: {
    padding: '24px',
    backgroundColor: '#fff',
    border: '1px solid #e0e0e0',
    borderRadius: '12px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
  },
  answerText: {
    margin: 0,
    fontSize: '16px',
    lineHeight: 1.7,
    whiteSpace: 'pre-wrap',
  },
  basedOn: {
    marginTop: '16px',
    marginBottom: 0,
    fontSize: '13px',
    color: '#888',
  },
  sourcesToggle: {
    marginTop: '8px',
    padding: 0,
    fontSize: '13px',
    color: '#2563eb',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left',
  },
  sourceList: {
    margin: '12px 0 0',
    padding: 0,
    listStyle: 'none',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sourceItem: {
    padding: '12px',
    backgroundColor: '#fafafa',
    border: '1px solid #eee',
    borderRadius: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  sourceExcerpt: {
    fontSize: '14px',
    color: '#333',
    lineHeight: 1.5,
  },
  sourceSimilarity: {
    fontSize: '12px',
    color: '#999',
  },
};
