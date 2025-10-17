import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';

function StockRow({ p }) {
  const gendered = p.sizeQuantities && typeof p.sizeQuantities === 'object';
  const perGender = gendered ? ['men','women'].map((g)=>({
    g,
    list: Array.isArray(p.sizeQuantities[g]) ? p.sizeQuantities[g] : [],
  })) : [];
  const generic = !gendered && Array.isArray(p.sizes) && p.sizes.length && typeof p.sizes[0] === 'object' ? p.sizes : [];
  return (
    <div className="card">
      <div className="card-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 600 }}>{p.name}</div>
          <div style={{ fontSize: 12 }}><strong>Total:</strong> {typeof p.quantity === 'number' ? p.quantity : '-'}</div>
        </div>
        {gendered ? (
          <div className="mt-6">
            {perGender.map(({ g, list }) => (
              list.length ? (
                <div key={g} style={{ marginTop: 6 }}>
                  <div style={{ fontWeight: 600, textTransform: 'capitalize', fontSize: 13 }}>{g}</div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {list.map((s, i) => (
                      <span key={`${g}-${i}`} style={{ padding: '2px 6px', border: '1px solid #eee', borderRadius: 6, background: '#fff' }}>
                        {s.size}: {s.quantity}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null
            ))}
          </div>
        ) : generic.length ? (
          <div className="mt-6" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {generic.map((s, i) => (
              <span key={i} style={{ padding: '2px 6px', border: '1px solid #eee', borderRadius: 6, background: '#fff' }}>
                {s.size}: {s.quantity}
              </span>
            ))}
          </div>
        ) : (
          <div className="mt-6" style={{ fontSize: 12, color: '#666' }}>No per-size quantities configured</div>
        )}
      </div>
    </div>
  );
}

export default function Stock() {
  const [list, setList] = useState([]);
  const [q, setQ] = useState('');
  useEffect(() => {
    const unsub = onSnapshot(query(collection(db, 'products'), orderBy('name')), (snap) => {
      setList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return list;
    return list.filter((p) => String(p.name || '').toLowerCase().includes(term));
  }, [list, q]);

  return (
    <div>
      <div className="toolbar">
        <h1>Stock</h1>
        <input className="input" placeholder="Search products…" value={q} onChange={(e)=>setQ(e.target.value)} style={{ maxWidth: 280 }} />
      </div>
      <div className="grid-cards">
        {filtered.map((p) => <StockRow key={p.id} p={p} />)}
      </div>
    </div>
  );
}

