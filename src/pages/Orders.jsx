import React, { useEffect, useState } from 'react';
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
      const regions = envRegion ? [envRegion] : [undefined, 'us-central1', 'asia-south1', 'europe-west1'];
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

  return (
    <div>
      <div className="toolbar">
        <h1>Orders</h1>
      </div>
      {loading ? (
        <div className="card" style={{ padding: 12 }}>Loading…</div>
      ) : orders.length === 0 ? (
        <div className="card" style={{ padding: 12 }}>No orders found</div>
      ) : (
        <div className="grid-cards">
          {orders.map((o) => (
            <div key={o.id} className="card">
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 600 }}>#{o.id.slice(-8)}</div>
                  <span className={`badge ${o.status === 'ordered' ? '' : 'muted'}`}>{o.status || 'unknown'}</span>
                </div>
                <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>{formatDate(o.createdAt)}</div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 600 }}>Customer</div>
                  <div style={{ fontSize: 13, color: '#333' }}>{o?.billing?.name || '-'}</div>
                  <div style={{ fontSize: 12, color: '#666' }}>{o?.billing?.email || ''}</div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontWeight: 600 }}>Items</div>
                  <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                    {(o.items || []).map((it, i) => (
                      <li key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                        <span>{it.name} × {it.qty}</span>
                        <span>₹ {it.price * it.qty}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <hr style={{ border: '0', borderTop: '1px solid #eee', margin: '8px 0' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>Total</span>
                  <span>₹ {o.amount || 0}</span>
                </div>
                {o.discount ? (
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#16a34a' }}>
                    <span>Discount</span>
                    <span>- ₹ {o.discount}</span>
                  </div>
                ) : null}
                {o.coupon?.code && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#555' }}>
                    <span>Coupon</span>
                    <span>
                      <span style={{ fontWeight: 600 }}>{o.coupon.code}</span>
                      {o.coupon.valid === false && <span style={{ marginLeft: 6, color:'#a61717' }}>(invalid)</span>}
                    </span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span>Payable</span>
                  <span>₹ {o.payable || o.amount || 0}</span>
                </div>
                <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>Payment: {o.paymentId || '-'}</div>
                <div style={{ marginTop: 10 }}>
                  <button onClick={() => downloadInvoice(o)}>Invoice PDF</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Orders;
