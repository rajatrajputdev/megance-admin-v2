import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

function currency(v) {
  return `₹ ${Number(v || 0).toFixed(2)}`;
}

const GST_PCT = 18;

export default function UserStats() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [minCount, setMinCount] = useState('');
  const [maxCount, setMaxCount] = useState('');

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(collection(db, 'orders'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(list);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const filteredOrders = useMemo(() => {
    const minA = minAmount !== '' ? Number(minAmount) : null;
    const maxA = maxAmount !== '' ? Number(maxAmount) : null;
    const minC = minCount !== '' ? Number(minCount) : null;
    const maxC = maxCount !== '' ? Number(maxCount) : null;
    return orders.filter((o) => {
      const amount = Number(o?.payable ?? o?.amount ?? 0) || 0;
      const shoeCount = Array.isArray(o?.items) ? o.items.reduce((sum, it) => sum + (Number(it?.qty) || 0), 0) : 0;
      if (minA !== null && amount < minA) return false;
      if (maxA !== null && amount > maxA) return false;
      if (minC !== null && shoeCount < minC) return false;
      if (maxC !== null && shoeCount > maxC) return false;
      return true;
    });
  }, [orders, minAmount, maxAmount, minCount, maxCount]);

  const paidOrders = useMemo(() => {
    return filteredOrders.filter((o) => Boolean(o?.paymentId));
  }, [filteredOrders]);

  const totals = useMemo(() => {
    const sumWithGst = paidOrders.reduce((sum, o) => sum + (Number(o?.payable ?? o?.amount ?? 0) || 0), 0);
    // Per requirement: treat GST as flat 18% of the total (gross)
    const sumGst = sumWithGst * (GST_PCT / 100);
    const sumWithoutGst = sumWithGst * (1 - (GST_PCT / 100)); // 82% of total
    return { sumWithGst, sumWithoutGst, sumGst };
  }, [paidOrders]);

  const perUser = useMemo(() => {
    const map = new Map();
    for (const o of filteredOrders) {
      const email = String(o?.billing?.email || '').trim().toLowerCase() || '(unknown)';
      const name = String(o?.billing?.name || '').trim() || '-';
      const paid = Boolean(o?.paymentId);
      const amount = Number(o?.payable ?? o?.amount ?? 0) || 0;
      if (!map.has(email)) {
        map.set(email, { email, name, totalPaid: 0, ordersTotal: 0, ordersPaid: 0 });
      }
      const u = map.get(email);
      u.ordersTotal += 1;
      if (paid) {
        u.ordersPaid += 1;
        u.totalPaid += amount;
      }
    }
    return Array.from(map.values()).sort((a, b) => (b.totalPaid - a.totalPaid));
  }, [filteredOrders]);

  // No additional user-level search filter – only amount and shoe count filters

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>User Stats</h1>
          {!loading && (
            <div style={{ fontSize: 14, color: '#555', fontWeight: 500 }}>
              Users: {perUser.length} · Paid orders: {paidOrders.length} · All orders: {filteredOrders.length}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#555' }}>Order Amount</span>
            <input className="input" type="number" placeholder="Min" value={minAmount} onChange={(e)=>setMinAmount(e.target.value)} style={{ width: 110 }} />
            <span style={{ color: '#999' }}>–</span>
            <input className="input" type="number" placeholder="Max" value={maxAmount} onChange={(e)=>setMaxAmount(e.target.value)} style={{ width: 110 }} />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#555' }}>Shoe Count</span>
            <input className="input" type="number" placeholder="Min" value={minCount} onChange={(e)=>setMinCount(e.target.value)} style={{ width: 90 }} />
            <span style={{ color: '#999' }}>–</span>
            <input className="input" type="number" placeholder="Max" value={maxCount} onChange={(e)=>setMaxCount(e.target.value)} style={{ width: 90 }} />
          </div>
          <div style={{ fontSize: 12, color: '#555' }}>GST: {GST_PCT}% (fixed)</div>
        </div>
      </div>

      {/* Totals */}
      <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        <div className="card">
          <div className="card-body">
            <div style={{ fontSize: 12, color: '#555' }}>Total Orders (incl. GST)</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, fontVariantNumeric: 'tabular-nums', letterSpacing: 0.3, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" }}>{currency(totals.sumWithGst)}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div style={{ fontSize: 12, color: '#555' }}>Total Orders without GST</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, fontVariantNumeric: 'tabular-nums', letterSpacing: 0.3, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" }}>{currency(totals.sumWithoutGst)}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <div style={{ fontSize: 12, color: '#555' }}>GST Collected</div>
            <div style={{ fontSize: 28, fontWeight: 700, marginTop: 8, fontVariantNumeric: 'tabular-nums', letterSpacing: 0.3, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" }}>{currency(totals.sumGst)}</div>
          </div>
        </div>
      </div>

      {/* Users table */}
      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-body" style={{ overflowX: 'auto' }}>
          {loading ? (
            <div>Loading…</div>
          ) : perUser.length === 0 ? (
            <div>No users found</div>
          ) : (
            <table className="table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th align="left" style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }}>User</th>
                  <th align="left" style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }}>Email</th>
                  <th align="right" style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }}>Total Paid</th>
                  <th align="right" style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }}>Orders (paid)</th>
                  <th align="right" style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }}>Orders (total)</th>
                </tr>
              </thead>
              <tbody>
                {perUser.map((u, idx) => (
                  <tr key={u.email} style={{ background: idx % 2 === 0 ? '#fff' : '#fafbff' }}>
                    <td style={{ padding: '14px', borderTop: '1px solid var(--border)' }}>{u.name}</td>
                    <td style={{ padding: '14px', borderTop: '1px solid var(--border)', color: '#555' }}>{u.email}</td>
                    <td align="right" style={{ padding: '14px', borderTop: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" }}>{currency(u.totalPaid)}</td>
                    <td align="right" style={{ padding: '14px', borderTop: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" }}>{u.ordersPaid}</td>
                    <td align="right" style={{ padding: '14px', borderTop: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums', fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace" }}>{u.ordersTotal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
