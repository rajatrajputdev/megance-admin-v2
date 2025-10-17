import React, { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

function tsToDate(ts) {
  try {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
    if (typeof ts === 'number') return new Date(ts);
    if (typeof ts === 'string') {
      const d = new Date(ts);
      return isNaN(d.getTime()) ? null : d;
    }
  } catch {}
  return null;
}

function formatDate(ts) {
  const d = tsToDate(ts);
  if (!d) return '-';
  try { return d.toLocaleString(); } catch { return d.toISOString(); }
}

export default function Newsletter() {
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const collectionName = (import.meta.env.VITE_NEWSLETTER_COLLECTION || 'newsletter_subscribers').trim();

  useEffect(() => {
    let alive = true;
    const load = async () => {
      setLoading(true);
      try {
        const snap = await getDocs(collection(db, collectionName));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Sort by createdAt desc if present; fallback to id
        list.sort((a, b) => {
          const ad = tsToDate(a.createdAt)?.getTime?.() || 0;
          const bd = tsToDate(b.createdAt)?.getTime?.() || 0;
          if (bd !== ad) return bd - ad;
          return String(b.id).localeCompare(String(a.id));
        });
        if (alive) setSubs(list);
      } catch (e) {
        if (alive) setSubs([]);
      } finally {
        if (alive) setLoading(false);
      }
    };
    load();
    return () => { alive = false; };
  }, [collectionName]);

  return (
    <div>
      <div className="toolbar">
        <h1>Newsletter</h1>
      </div>
      {loading ? (
        <div className="card" style={{ padding: 12 }}>Loading…</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th align="left">Email</th>
                <th align="left">Sources</th>
                <th align="left">UID</th>
                <th align="left">Created</th>
                <th align="left">Updated</th>
                <th align="left">Doc ID</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s, index) => {
                console.log(`Rendering Row ${index + 1}:`, s); // ✅ Logs each entry on render
                return (
                  <tr key={s.id} style={{ borderTop: '1px solid #eee' }}>
                    <td style={{ whiteSpace: 'nowrap' }}>{s.email || '-'}</td>
                    <td>{Array.isArray(s.sources) ? s.sources.join(', ') : (s.source || '-')}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{s.uid || '-'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(s.createdAt)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>{formatDate(s.updatedAt)}</td>
                    <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace' }}>{s.id}</td>
                  </tr>
                );
              })}
              {subs.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 12, opacity: 0.7 }}>No subscribers found in "{collectionName}"</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
        <ExportCsvButton rows={subs} />
        <CopyEmailsButton rows={subs} />
      </div>
    </div>
  );
}

function ExportCsvButton({ rows }) {
  const onExport = () => {
    const header = ['email', 'sources', 'uid', 'createdAt', 'updatedAt', 'id'];
    const lines = [header.join(',')];
    for (const r of rows) {
      const line = [
        escapeCsv(r.email || ''),
        escapeCsv(Array.isArray(r.sources) ? r.sources.join('|') : (r.source || '')),
        escapeCsv(r.uid || ''),
        escapeCsv(formatDate(r.createdAt)),
        escapeCsv(formatDate(r.updatedAt)),
        escapeCsv(r.id || ''),
      ].join(',');
      lines.push(line);
    }
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'newsletter-subscribers.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };
  return <button className="ghost" onClick={onExport} disabled={!rows?.length}>Export CSV</button>;
}

function CopyEmailsButton({ rows }) {
  const onCopy = async () => {
    const emails = rows.map((r) => r.email).filter(Boolean).join(', ');
    try { await navigator.clipboard.writeText(emails); alert('Copied emails to clipboard'); } catch {}
  };
  return <button className="ghost" onClick={onCopy} disabled={!rows?.length}>Copy Emails</button>;
}

function escapeCsv(value) {
  const s = String(value ?? '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return '"' + s.replaceAll('"', '""') + '"';
  }
  return s;
}
