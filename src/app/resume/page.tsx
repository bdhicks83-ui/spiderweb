'use client';

// Resume builder — free lead-magnet feature, no plan-tier gate.
// Auth-gated like the dashboard: logged-in users on any plan (including
// Free) can generate a branded PDF resume from their approved insights.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

const supabase = createClient();

type Status = 'checking' | 'ready' | 'generating' | 'done' | 'error';

export default function ResumePage() {
  const [status, setStatus] = useState<Status>('checking');
  const [name, setName] = useState('');
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('resume.pdf');
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace('/login'); return; }
      setStatus('ready');
    })();
  }, [router]);

  // Release the object URL when it's replaced or the page unmounts.
  useEffect(() => {
    return () => {
      if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    };
  }, [downloadUrl]);

  async function generate() {
    if (status === 'generating') return;
    setStatus('generating');
    setError(null);
    if (downloadUrl) { URL.revokeObjectURL(downloadUrl); setDownloadUrl(null); }

    try {
      const res = await fetch('/api/generate-resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim() || undefined,
          title: title.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Resume generation failed. Try again.');
        setStatus('error');
        return;
      }

      const disposition = res.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="(.+?)"/);
      const blob = await res.blob();
      setFileName(match?.[1] || 'resume.pdf');
      setDownloadUrl(URL.createObjectURL(blob));
      setStatus('done');
    } catch {
      setError('Resume generation failed. Try again.');
      setStatus('error');
    }
  }

  if (status === 'checking') {
    return <div style={styles.center}><p>Loading…</p></div>;
  }

  const generating = status === 'generating';

  return (
    <div style={styles.wrapper}>
      <div style={styles.container}>
        <h1 style={styles.title}>Build your resume</h1>
        <p style={styles.help}>
          Generates a one-page executive resume from your approved insights —
          summary, key experience, frameworks, and strengths. Free on every plan.
        </p>

        <div style={styles.card}>
          <label style={styles.label}>Name</label>
          <input
            style={styles.input}
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={generating}
          />

          <label style={styles.label}>Title (optional)</label>
          <input
            style={styles.input}
            type="text"
            placeholder="e.g. VP of Product"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={generating}
          />

          <button style={styles.primary} onClick={generate} disabled={generating}>
            {generating ? 'Generating…' : 'Generate my resume'}
          </button>

          {status === 'error' && error && (
            <p style={styles.errorText}>
              {error}{' '}
              {error.toLowerCase().includes('approved insight') && (
                <a href="/approve" style={styles.inlineLink}>Go approve some →</a>
              )}
            </p>
          )}

          {status === 'done' && downloadUrl && (
            <div style={styles.doneBox}>
              <p style={styles.doneText}>Your resume is ready.</p>
              <a href={downloadUrl} download={fileName} style={styles.downloadLink}>
                ⬇ Download {fileName}
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: { minHeight: '100vh', display: 'flex', justifyContent: 'center', padding: '48px 24px', fontFamily: 'system-ui, sans-serif' },
  container: { width: '100%', maxWidth: '560px', display: 'flex', flexDirection: 'column', gap: '12px' },
  center: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui, sans-serif' },
  title: { fontSize: '28px', fontWeight: 700, margin: 0 },
  help: { margin: '0 0 8px', fontSize: '14px', color: '#666', lineHeight: 1.5 },
  card: { padding: '24px', backgroundColor: '#fff', border: '1px solid #e0e0e0', borderRadius: '14px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '8px' },
  label: { fontSize: '13px', fontWeight: 600, color: '#555', marginTop: '4px' },
  input: { padding: '10px 12px', fontSize: '15px', border: '1px solid #ccc', borderRadius: '8px', fontFamily: 'inherit', boxSizing: 'border-box', width: '100%' },
  primary: { marginTop: '10px', padding: '12px 20px', fontSize: '15px', fontWeight: 600, color: '#fff', background: '#111', border: 'none', borderRadius: '8px', cursor: 'pointer' },
  errorText: { marginTop: '4px', fontSize: '14px', color: '#b91c1c' },
  inlineLink: { color: '#b91c1c', fontWeight: 600, textDecoration: 'underline' },
  doneBox: { marginTop: '8px', padding: '16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '10px', display: 'flex', flexDirection: 'column', gap: '8px' },
  doneText: { margin: 0, fontSize: '14px', color: '#166534', fontWeight: 600 },
  downloadLink: { fontSize: '14px', fontWeight: 600, color: '#15803d', textDecoration: 'none' },
};
