import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db, app } from '../firebase/config';
import { getFunctions, httpsCallable } from 'firebase/functions';

function tsToDate(ts) {
  try {
    if (!ts) return null;
    if (ts.toDate) return ts.toDate();
    if (typeof ts.seconds === 'number') return new Date(ts.seconds * 1000);
  } catch {}
  return null;
}

function formatDate(ts) {
  const d = tsToDate(ts);
  if (!d) return '-';
  return d.toLocaleString();
}

const Orders = () => {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [productFilter, setProductFilter] = useState('');
  const [idInvoiceQuery, setIdInvoiceQuery] = useState('');
  const [dateFilter, setDateFilter] = useState(''); // YYYY-MM-DD
  const [monthFilter, setMonthFilter] = useState(''); // YYYY-MM

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(collection(db, 'orders'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      // Sort locally by createdAt desc (handles docs missing the field)
      list.sort((a,b)=>((b.createdAt?.toMillis?.()||0)-(a.createdAt?.toMillis?.()||0)));
      setOrders(list);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const downloadInvoice = async (order) => {
    const orderId = order?.id;
    try {
      // Prefer region from env if provided; otherwise, try a few common regions
      const envRegion = (import.meta.env.VITE_FUNCTIONS_REGION || '').trim();
      const regions = envRegion ? [envRegion] : [undefined, 'asia-south2', 'us-central1', 'asia-south1', 'europe-west1'];
      let response = null;
      let lastErr = null;
      for (const r of regions) {
        try {
          const fns = getFunctions(app, r);
          const call = httpsCallable(fns, 'getOrderInvoicePdfCallable');
          const res = await call({ orderId });
          if (res?.data?.data) { response = res.data; break; }
        } catch (e) { lastErr = e; }
      }
      if (!response) throw lastErr || new Error('Invoice function unavailable');

      const { contentType, data, filename } = response || {};
      if (!data) throw new Error('No data received from function');

      const blob = await (await fetch(`data:${contentType||'application/pdf'};base64,${data}`)).blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `invoice-${orderId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
    } catch (err) {
      // Fallback: open a printable invoice in a new tab
      try {
        const html = buildInvoiceHtml(order);
        const w = window.open('', '_blank');
        if (!w) throw err; // popup blocked; rethrow original
        w.document.open();
        w.document.write(html);
        w.document.close();
        // Give browser a tick to render before print
        setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 300);
      } catch (_) {
        alert('Unable to generate invoice. Please set VITE_FUNCTIONS_REGION to your Cloud Functions region and ensure getOrderInvoicePdfCallable is deployed.');
      }
    }
  };


  function buildInvoiceHtml(order) {
    const idShort = String(order?.id || '').slice(-8);
    const created = formatDate(order?.createdAt);
    const name = order?.billing?.name || '-';
    const email = order?.billing?.email || '';
    const items = Array.isArray(order?.items) ? order.items : [];
    const amount = Number(order?.amount || 0);
    const discount = Number(order?.discount || 0);
    const payable = Number(order?.payable || amount);
    const paymentId = order?.paymentId || '-';
    const coupon = order?.coupon?.code ? String(order.coupon.code) : '';

    const currency = (v) => `₹ ${Number(v || 0).toFixed(2)}`;
    const rows = items.map((it) => (
      `<tr>
        <td>${escapeHtml(it.name || '')}</td>
        <td style="text-align:center">${Number(it.qty || 0)}</td>
        <td style="text-align:right">${currency(it.price || 0)}</td>
        <td style="text-align:right">${currency((it.price || 0) * (it.qty || 0))}</td>
      </tr>`
    )).join('');

    const couponRow = coupon ? `<tr><td colspan="3" style="text-align:right">Coupon (${escapeHtml(coupon)})</td><td style="text-align:right">- ${currency(discount)}</td></tr>` : '';

    return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Invoice #${idShort}</title>
    <style>
      body { font-family: Inter, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:#111; margin: 24px; }
      .header { display:flex; justify-content:space-between; align-items:flex-start; }
      h1 { margin: 0 0 4px; font-size: 20px; }
      .muted { color: #555; font-size: 12px; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 14px; }
      th { background:#f8fafc; text-align:left; }
      .totals td { border: none; }
      .totals tr td { padding: 4px 0; }
      @media print { button { display:none } body { margin: 0 } }
    </style>
  </head>
  <body>
    <div class="header">
      <div>
        <h1>MEGANCE — Invoice</h1>
        <div class="muted">Order #${idShort} · ${escapeHtml(created)}</div>
      </div>
      <div class="muted" style="text-align:right">
        Generated ${escapeHtml(new Date().toLocaleString())}
      </div>
    </div>
    <div style="margin-top:14px">
      <div style="font-weight:600">Billed To</div>
      <div>${escapeHtml(name)}</div>
      <div class="muted">${escapeHtml(email)}</div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:right">Price</th>
          <th style="text-align:right">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${rows || '<tr><td colspan="4" style="text-align:center;opacity:.7">No items</td></tr>'}
      </tbody>
    </table>

    <table style="margin-top:12px">
      <tbody class="totals">
        <tr><td style="width:70%"></td><td style="width:15%; text-align:right">Subtotal</td><td style="width:15%; text-align:right">${currency(amount)}</td></tr>
        ${couponRow}
        <tr><td></td><td style="text-align:right; font-weight:700">Total</td><td style="text-align:right; font-weight:700">${currency(payable)}</td></tr>
      </tbody>
    </table>

    <div class="muted" style="margin-top:10px">Payment ID: ${escapeHtml(paymentId)}</div>
    <button onclick="window.print()" style="margin-top:16px">Print / Save as PDF</button>
  </body>
</html>`;
  }

  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, (c) => {
      switch (c) {
        case '&': return '&amp;';
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        default: return c;
      }
    });
  }

  // Helpers to group items by product and sub-categorize by size
  function getItemSize(it) {
    const candidates = [
      it?.size,
      it?.Size,
      it?.selectedSize,
      it?.sizeLabel,
      it?.variant?.size,
      it?.option?.size,
      it?.options?.size,
      it?.attributes?.size,
      it?.shoeSize,
    ];
    const s = candidates.find((x) => typeof x === 'string' && x.trim());
    if (s) return String(s).trim();
    // Sometimes size may be numeric
    const n = candidates.find((x) => typeof x === 'number' && Number.isFinite(x));
    return n != null ? String(n) : null;
  }

  function summarizeItems(items) {
    const map = new Map(); // name -> { name, sizes: Map(size->qty), totalQty, totalAmount }
    for (const raw of (items || [])) {
      const name = String(raw?.name || 'Unknown').trim();
      const size = getItemSize(raw); // null if absent
      const qty = Number(raw?.qty || 0) || 0;
      const price = Number(raw?.price || 0) || 0;
      if (!map.has(name)) {
        map.set(name, { name, sizes: new Map(), totalQty: 0, totalAmount: 0 });
      }
      const entry = map.get(name);
      entry.totalQty += qty;
      entry.totalAmount += price * qty;
      const key = size || '(default)';
      entry.sizes.set(key, (entry.sizes.get(key) || 0) + qty);
    }
    return Array.from(map.values());
  }

  // Unique product names from order items (for filtering)
  const productOptions = useMemo(() => {
    const set = new Set();
    for (const o of orders) {
      for (const it of (o.items || [])) {
        const n = String(it?.name || '').trim();
        if (n) set.add(n);
      }
    }
    return Array.from(set).sort((a,b)=>a.localeCompare(b));
  }, [orders]);

  // Filtered + Sorted orders
  const filteredSorted = useMemo(() => {
    const q = idInvoiceQuery.trim().toLowerCase();
    const hasQ = q.length > 0;
    // Date bounds
    let dayStart = null, dayEnd = null;
    if (dateFilter) {
      const d = new Date(dateFilter + 'T00:00:00');
      if (!isNaN(d)) {
        dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
        dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
      }
    }
    let monthStart = null, monthEnd = null;
    if (monthFilter) {
      const [y, m] = monthFilter.split('-').map((x) => parseInt(x, 10));
      if (Number.isInteger(y) && Number.isInteger(m)) {
        monthStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
        monthEnd = new Date(y, m, 0, 23, 59, 59, 999);
      }
    }

    const list = orders.filter((o) => {
      // Product filter
      if (productFilter) {
        const names = (o.items || []).map((it) => String(it?.name || ''));
        if (!names.some((n) => n === productFilter)) return false;
      }
      // ID / Invoice filter
      if (hasQ) {
        const id = String(o.id || '').toLowerCase();
        const idShort = String(o.id || '').slice(-8).toLowerCase();
        const invCandidates = [o.invoiceNumber, o.invoiceNo, o.invoice_id, o.invoiceId, o.invoice]
          .map((x) => (x == null ? '' : String(x))).map((s) => s.toLowerCase());
        const matchId = id.includes(q) || idShort.includes(q);
        const matchInv = invCandidates.some((s) => s && s.includes(q));
        if (!matchId && !matchInv) return false;
      }
      // Date filter (specific day)
      if (dayStart || dayEnd) {
        const d = tsToDate(o.createdAt);
        if (!d) return false;
        if (dayStart && d < dayStart) return false;
        if (dayEnd && d > dayEnd) return false;
      }
      // Month filter (YYYY-MM)
      if (monthStart || monthEnd) {
        const d = tsToDate(o.createdAt);
        if (!d) return false;
        if (monthStart && d < monthStart) return false;
        if (monthEnd && d > monthEnd) return false;
      }
      return true;
    });
    return list;
  }, [orders, productFilter, idInvoiceQuery, dateFilter, monthFilter]);

  // Total collected across filtered orders: sum payable when paymentId exists (best proxy for paid)
  const totalCollected = useMemo(() => {
    return filteredSorted.reduce((sum, o) => {
      const isCollected = Boolean(o?.paymentId);
      const val = Number(o?.payable ?? o?.amount ?? 0) || 0;
      return sum + (isCollected ? val : 0);
    }, 0);
  }, [filteredSorted]);

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Orders</h1>
          {!loading && (
            <div style={{ fontSize: 12, color: '#555' }}>
              Showing {filteredSorted.length} of {orders.length} · Total collected: ₹ {totalCollected.toFixed(2)}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'grid', gap: 4 }}>
            <label className="label">Order/Invoice</label>
            <input
              className="input"
              placeholder="Order ID or Invoice Number"
              value={idInvoiceQuery}
              onChange={(e)=>setIdInvoiceQuery(e.target.value)}
              style={{ width: 220 }}
            />
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <label className="label">Date</label>
            <input
              className="input"
              type="date"
              value={dateFilter}
              onChange={(e)=>setDateFilter(e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <label className="label">Month</label>
            <input
              className="input"
              type="month"
              value={monthFilter}
              onChange={(e)=>setMonthFilter(e.target.value)}
            />
          </div>
          <div style={{ display: 'grid', gap: 4 }}>
            <label className="label">Product</label>
            <select className="select" value={productFilter} onChange={(e)=>setProductFilter(e.target.value)}>
              <option value="">All products</option>
              {productOptions.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {loading ? (
        <div className="card" style={{ padding: 12 }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div className="card" style={{ padding: 12 }}>No orders found</div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width:'100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }} align="left">Order</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }} align="left">Date</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }} align="left">Customer</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }} align="left">Items</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }} align="right">Amount</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }} align="right">Discount</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }} align="right">Payable</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }} align="left">Status</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }} align="left">Payment</th>
                  <th style={{ padding: '12px 14px', fontSize: 12, color: '#555', borderBottom: '1px solid var(--border)' }} align="left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSorted.map((o) => {
                  const groups = summarizeItems(o.items || []);
                  return (
                    <tr key={o.id}>
                      <td style={{ padding: '14px', borderTop: '1px solid var(--border)', whiteSpace: 'nowrap' }}>#{o.id.slice(-8)}</td>
                      <td style={{ padding: '14px', borderTop: '1px solid var(--border)' }}>{formatDate(o.createdAt)}</td>
                      <td style={{ padding: '14px', borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 600 }}>{o?.billing?.name || '-'}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>{o?.billing?.email || ''}</div>
                      </td>
                      <td style={{ padding: '14px', borderTop: '1px solid var(--border)' }}>
                        {groups.length === 0 ? (
                          <div style={{ color: '#666', fontSize: 12 }}>No items</div>
                        ) : (
                          <div style={{ display: 'grid', gap: 6 }}>
                            {groups.map((g) => (
                              <div key={g.name}>
                                <div style={{ fontWeight: 600, fontSize: 13 }}>{g.name}</div>
                                <div style={{ fontSize: 12, color: '#555' }}>
                                  {Array.from(g.sizes.entries()).map(([sz, q], idx) => (
                                    <span key={sz}>
                                      {sz !== '(default)' ? `${sz}×${q}` : `Qty ${q}`}{idx < g.sizes.size - 1 ? ', ' : ''}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                      <td align="right" style={{ padding: '14px', borderTop: '1px solid var(--border)', fontVariantNumeric: 'tabular-nums' }}>₹ {Number(o.amount || 0).toFixed(2)}</td>
                      <td align="right" style={{ padding: '14px', borderTop: '1px solid var(--border)', color: '#16a34a', fontVariantNumeric: 'tabular-nums' }}>{o.discount ? `- ₹ ${Number(o.discount).toFixed(2)}` : '-'}</td>
                      <td align="right" style={{ padding: '14px', borderTop: '1px solid var(--border)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>₹ {Number(o.payable || o.amount || 0).toFixed(2)}</td>
                      <td style={{ padding: '14px', borderTop: '1px solid var(--border)' }}>
                        <span className={`badge ${o.status === 'ordered' ? '' : 'muted'}`}>{o.status || 'unknown'}</span>
                      </td>
                      <td style={{ padding: '14px', borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12, color: '#666' }}>{o.paymentId || '-'}</div>
                      </td>
                      <td style={{ padding: '14px', borderTop: '1px solid var(--border)' }}>
                        <button onClick={() => downloadInvoice(o)}>Invoice PDF</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Orders;
