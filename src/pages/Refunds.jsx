import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, orderBy, doc, getDoc } from 'firebase/firestore';
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
  try { return d.toLocaleString(); } catch { return d.toISOString(); }
}

function currencyINR(v) {
  return `₹ ${Number(v || 0).toFixed(2)}`;
}

function statusInfo(statusRaw) {
  const s = String(statusRaw || 'requested').toLowerCase();
  if (s === 'approved') return { label: 'Approved', bg: '#dcfce7', fg: '#166534' };
  if (s === 'rejected') return { label: 'Rejected', bg: '#fee2e2', fg: '#991b1b' };
  return { label: 'Awaiting Decision', bg: '#fef3c7', fg: '#92400e' };
}

export default function Refunds() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [queryText, setQueryText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all | requested | approved | rejected
  const [selected, setSelected] = useState(null);
  const [orderInfo, setOrderInfo] = useState(null);
  const [orderLoading, setOrderLoading] = useState(false);
  const [returnMap, setReturnMap] = useState({}); // orderId -> boolean (has return)
  const fnsRegion = (import.meta.env.VITE_FUNCTIONS_REGION || 'asia-south2').trim();
  const fns = getFunctions(app, fnsRegion);

  useEffect(() => {
    setLoading(true);
    const unsub = onSnapshot(query(collection(db, 'refundRequests'), orderBy('createdAt', 'desc')), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRows(list);
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  // Enrich list with return status (from orders)
  useEffect(() => {
    const ids = Array.from(new Set(rows.map(r => String(r?.orderRef?.orderId || r?.orderRef?.id || '').trim()).filter(Boolean)));
    const pending = ids.filter(id => !(id in returnMap));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const updates = {};
      for (const oid of pending) {
        try {
          const s = await getDoc(doc(db, 'orders', oid));
          const data = s.exists() ? s.data() : null;
          updates[oid] = !!(data && (data.returnAwb || data.returnShipmentId));
        } catch {
          updates[oid] = false;
        }
      }
      if (!cancelled) setReturnMap(prev => ({ ...prev, ...updates }));
    })();
    return () => { cancelled = true; };
  }, [rows, returnMap, db]);

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    let list = rows;
    if (statusFilter !== 'all') {
      list = list.filter((r) => String(r.status || 'requested').toLowerCase() === statusFilter);
    }
    if (!q) return list;
    return list.filter((r) => {
      const f = [r.id, r?.orderRef?.id, r?.orderRef?.orderId, r?.contact?.email, r?.contact?.phone, r?.contact?.name]
        .map((x) => String(x || '').toLowerCase());
      return f.some((s) => s.includes(q));
    });
  }, [rows, queryText, statusFilter]);

  const approve = async (id) => {
    if (!confirm('Approve this refund request?')) return;
    const call = httpsCallable(fns, 'adminResolveRefundRequest');
    await call({ id, status: 'approved' });
  };
  const reject = async (id) => {
    const notes = prompt('Reason for rejection (required):');
    if (!notes || !notes.trim()) { alert('Please enter a short reason to send the customer.'); return; }
    const call = httpsCallable(fns, 'adminResolveRefundRequest');
    await call({ id, status: 'rejected', notes: notes.trim() });
  };
  const refreshOrder = async (oid) => {
    try {
      const snap = await getDoc(doc(db, 'orders', oid));
      setOrderInfo(snap.exists() ? ({ id: snap.id, ...snap.data() }) : null);
    } catch {}
  };

  const createReturn = async (r) => {
    if (!confirm('Create a reverse pickup for this order?')) return;
    const call = httpsCallable(fns, 'adminCreateReturn');
    const orderId = String(r?.orderRef?.orderId || r?.orderRef?.id || '').trim();
    const pickup = {
      name: r?.contact?.name || '',
      phone: r?.contact?.phone || '',
      address: r?.address || '',
      city: r?.contact?.city || '',
      state: r?.contact?.state || '',
      zip: r?.contact?.zip || '',
    };
    await call({ orderId, pickup, reason: 'refund-approved', notes: 'Created from admin Refunds page' });
    try { await refreshOrder(orderId); } catch {}
    try { setReturnMap(prev => ({ ...prev, [orderId]: true })); } catch {}
    alert('Reverse pickup created');
  };


  // Load associated order details when a request is selected
  useEffect(() => {
    const oid = String(selected?.orderRef?.orderId || selected?.orderRef?.id || '').trim();
    if (!oid) { setOrderInfo(null); return; }
    let cancelled = false;
    (async () => {
      try { setOrderLoading(true); } catch {}
      try {
        const snap = await getDoc(doc(db, 'orders', oid));
        if (!cancelled) setOrderInfo(snap.exists() ? ({ id: snap.id, ...snap.data() }) : null);
      } catch { if (!cancelled) setOrderInfo(null); }
      finally { if (!cancelled) setOrderLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [selected]);

  const openPrint = () => {
    if (!selected) return;
    const s = selected;
    const o = orderInfo;
    const stat = statusInfo(s.status);
    const orderShort = String(s?.orderRef?.orderId || s?.orderRef?.id || '').slice(-8).toUpperCase();
    const items = Array.isArray(o?.items) ? o.items : [];
    const itemsRows = items.map((it) => (
      `<tr>
        <td>${escapeHtml(it.name || '')}</td>
        <td style="text-align:center">${Number(it.qty || 0)}</td>
        <td style="text-align:right">${escapeHtml(it?.meta?.size ? 'Size ' + String(it.meta.size) : '')}${it?.meta?.gender ? ' · ' + String(it.meta.gender).toUpperCase() : ''}</td>
      </tr>`
    )).join('');
    const images = Array.isArray(s.images) ? s.images : [];
    const imgs = images.map((im, i) => (
      `<div style="display:inline-block;width:120px;height:120px;border:1px solid #eee;border-radius:8px;overflow:hidden;margin:4px 6px 6px 0">
        ${im.publicUrl ? `<img src="${im.publicUrl}" alt="Evidence ${i+1}" style="width:100%;height:100%;object-fit:cover" />` : `<div style=\"display:flex;align-items:center;justify-content:center;height:100%;color:#999\">No preview</div>`}
      </div>`
    )).join('');
    const bank = (s.bank && typeof s.bank === 'object') ? Object.entries(s.bank).map(([k,v]) => `<tr><td>${escapeLabel(k)}</td><td>${escapeHtml(String(v))}</td></tr>`).join('') : '';
    const decl = (s.declarations && typeof s.declarations === 'object') ? Object.entries(s.declarations).map(([k,v]) => `<tr><td>${escapeLabel(k)}</td><td>${escapeHtml(String(v))}</td></tr>`).join('') : '';
    const amount = Number(o?.amount || 0);
    const discount = Number(o?.discount || 0);
    const payable = Number(o?.payable || amount);
    const reasonTxt = reasonText(s);
    const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Refund ${escapeHtml(s.id)}</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial; color:#111; margin: 20px; }
      .badge { display:inline-block; font-size:12px; border-radius:999px; padding:2px 8px; }
      table { width:100%; border-collapse: collapse; }
      th, td { border: 1px solid #e5e7eb; padding: 8px; font-size: 14px; }
      th { background:#f8fafc; text-align:left; }
      .section { margin: 14px 0; }
      .grid { display:grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
      @media print { .no-print { display: none } body { margin: 0 } }
    </style>
  </head>
  <body>
    <div style="border:1px solid #e5e7eb; background:${stat.bg}; color:${stat.fg}; padding:10px 12px; border-radius:8px;">
      <div style="font-weight:700">${escapeHtml(stat.label)}</div>
      <div style="font-size:12px">Refund Request ${escapeHtml(s.id)} · Order #${escapeHtml(orderShort)}</div>
    </div>

    <div class="section">
      <div style="font-weight:700; margin-bottom:6px">Summary</div>
      <div class="grid">
        <div><div style="font-size:12px;color:#555">Submitted</div><div>${escapeHtml(formatDate(s.createdAt))}</div></div>
        ${s.processedAt ? `<div><div style="font-size:12px;color:#555">Processed</div><div>${escapeHtml(formatDate(s.processedAt))}${s.processedBy ? ' · ' + escapeHtml(s.processedBy) : ''}</div></div>` : ''}
        <div><div style="font-size:12px;color:#555">Status</div><div>${escapeHtml(String(s.status || 'requested'))}</div></div>
        ${s.decisionNotes ? `<div><div style=\"font-size:12px;color:#555\">Notes</div><div>${escapeHtml(s.decisionNotes)}</div></div>` : ''}
      </div>
    </div>

    <div class="section">
      <div style="font-weight:700; margin-bottom:6px">Customer</div>
      <div class="grid">
        <div><div style="font-size:12px;color:#555">Name</div><div>${escapeHtml(s?.contact?.name || '')}</div></div>
        <div><div style="font-size:12px;color:#555">Email</div><div>${escapeHtml(s?.contact?.email || '')}</div></div>
        <div><div style="font-size:12px;color:#555">Phone</div><div>${escapeHtml(s?.contact?.phone || '')}</div></div>
        <div><div style="font-size:12px;color:#555">Address</div><div>${escapeHtml(s?.address || '')}</div></div>
      </div>
    </div>

    <div class="section">
      <div style="font-weight:700; margin-bottom:6px">Order</div>
      <div class="grid">
        <div><div style="font-size:12px;color:#555">Order</div><div>#${o ? escapeHtml(o.id.slice(-8)) : '-'}</div></div>
        <div><div style="font-size:12px;color:#555">Placed On</div><div>${o ? escapeHtml(formatDate(o.createdAt)) : '-'}</div></div>
        <div><div style="font-size:12px;color:#555">Payment Method</div><div>${o ? escapeHtml(String(o.paymentMethod || (o.paymentId ? 'online' : 'cod')).toUpperCase()) : '-'}</div></div>
        <div><div style="font-size:12px;color:#555">Tracking (Delivery)</div><div>${escapeHtml(o?.xbAwb || '-')}</div></div>
        <div><div style="font-size:12px;color:#555">Tracking (Return)</div><div>${escapeHtml(o?.returnAwb || '-')}</div></div>
        <div><div style="font-size:12px;color:#555">Items</div><div>${o ? String(items.reduce((s,it)=>s+(Number(it.qty)||0),0)) : '-'}</div></div>
        <div><div style="font-size:12px;color:#555">Total</div><div>${currencyINR(amount)}</div></div>
        <div><div style="font-size:12px;color:#555">Discount</div><div>${discount ? '- ' + currencyINR(discount) : '-'}</div></div>
        <div><div style="font-size:12px;color:#555">Payable</div><div>${currencyINR(payable)}</div></div>
      </div>
      ${items.length ? `<table style="margin-top:10px"><thead><tr><th>Item</th><th style=\"text-align:center\">Qty</th><th style=\"text-align:right\">Notes</th></tr></thead><tbody>${itemsRows}</tbody></table>` : ''}
    </div>

    <div class="section">
      <div style="font-weight:700; margin-bottom:6px">Reason & Preference</div>
      <div class="grid">
        <div><div style="font-size:12px;color:#555">Reason</div><div>${escapeHtml(reasonTxt)}</div></div>
        <div><div style="font-size:12px;color:#555">Condition</div><div>${escapeHtml(String(s?.condition || ''))}</div></div>
        <div><div style="font-size:12px;color:#555">Resolution</div><div>${escapeHtml(String(s?.resolution || 'refund'))}</div></div>
        <div><div style="font-size:12px;color:#555">Refund Method</div><div>${escapeHtml(String(s?.refundMethod || 'prepaid'))}</div></div>
      </div>
    </div>

    ${bank ? `<div class=\"section\"><div style=\"font-weight:700;margin-bottom:6px\">Bank Details</div><table><tbody>${bank}</tbody></table></div>` : ''}
    ${decl ? `<div class=\"section\"><div style=\"font-weight:700;margin-bottom:6px\">Declarations</div><table><tbody>${decl}</tbody></table></div>` : ''}
    ${images.length ? `<div class=\"section\"><div style=\"font-weight:700;margin-bottom:6px\">Images</div>${imgs}</div>` : ''}

    <div class="no-print" style="margin-top:12px"><button onclick="window.print()">Print</button></div>
    <script>
      function escapeHtml(s){return String(s||'').replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));}
    </script>
  </body>
  </html>`;
    const finalHtml = html;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.open();
    w.document.write(finalHtml);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 300);
    function escapeHtml(x){ return String(x||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c])); }
    function escapeLabel(k){ try { return String(k).replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase()); } catch { return String(k); } }
  };

  const reasonText = (r) => {
    try {
      const reason = r?.reason || {};
      const out = [];
      if (reason.wrongSize) out.push('Wrong Size');
      if (reason.damaged) out.push('Damaged Product');
      if (reason.differentItem) out.push('Different Item Received');
      if (reason.qualityIssue) out.push('Quality Issue');
      if (reason.other && reason.otherText) out.push(`Other: ${String(reason.otherText)}`);
      else if (reason.other) out.push('Other');
      return out.join(', ');
    } catch { return ''; }
  };

  return (
    <div>
      <div className="toolbar">
        <h1>Refunds</h1>
        <div style={{ display:'flex', gap: 8, alignItems:'center', flexWrap:'wrap' }}>
          <input className="input" placeholder="Search by id/order/email/phone" value={queryText} onChange={(e)=>setQueryText(e.target.value)} style={{ maxWidth: 300 }} />
          <select className="select" value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}>
            <option value="all">All</option>
            <option value="requested">Requested</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 12 }}>Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="card" style={{ padding: 12 }}>No refund requests</div>
      ) : (
        <div className="card">
          <div className="card-body" style={{ overflowX: 'auto' }}>
            <table className="table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th align="left" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>Request</th>
                  <th align="left" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>Order</th>
                  <th align="left" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>Contact</th>
                  <th align="left" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>Status</th>
                  <th align="left" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>Dates</th>
                  <th align="left" style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r, idx) => {
                  const status = String(r.status || 'requested');
                  const oid = String(r?.orderRef?.orderId || r?.orderRef?.id || '').trim();
                  const hasReturn = oid ? !!returnMap[oid] : false;
                  return (
                    <tr key={r.id} style={{ background: idx % 2 === 0 ? '#fff' : '#fafbff' }}>
                      <td style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 600 }}>{r.id}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>{reasonText(r)}</div>
                      </td>
                      <td style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 600 }}>#{String(r?.orderRef?.orderId || r?.orderRef?.id || '').slice(-8)}</div>
                        {hasReturn && <div className="badge" style={{ marginTop: 6 }}>Return Created</div>}
                      </td>
                      <td style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontWeight: 600 }}>{r?.contact?.name || '-'}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>{r?.contact?.email || ''}</div>
                        <div style={{ fontSize: 12, color: '#666' }}>{r?.contact?.phone || ''}</div>
                      </td>
                      <td style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                        <span className={`badge ${status === 'requested' ? 'muted' : ''}`}>{status}</span>
                      </td>
                      <td style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 12 }}>Created: {formatDate(r.createdAt)}</div>
                        {r.processedAt && <div style={{ fontSize: 12 }}>Processed: {formatDate(r.processedAt)}</div>}
                      </td>
                      <td style={{ padding: '12px 14px', borderTop: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="ghost" onClick={() => setSelected(r)}>View Details</button>
                          <button className="primary" onClick={() => approve(r.id)} disabled={status !== 'requested'}>Approve</button>
                          <button onClick={() => reject(r.id)} disabled={status !== 'requested'}>Reject</button>
                          <button onClick={() => createReturn(r)} disabled={false}>Create Return</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && (
        <div className="card" style={{ marginTop: 14 }}>
            <div className="card-body" style={{ display: 'grid', gap: 12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontSize: 12, color: '#555' }}>Refund Request</div>
                  <div style={{ fontWeight: 700 }}>{selected.id}</div>
                </div>
                <div style={{ display:'flex', gap: 8 }}>
                <button onClick={openPrint}>Print</button>
                <button onClick={() => setSelected(null)}>Close</button>
                </div>
              </div>

            {/* Status banner */}
            {(() => { const si = statusInfo(selected?.status); return (
              <div style={{ border:'1px solid #e5e7eb', background: si.bg, color: si.fg, padding: '8px 10px', borderRadius: 8 }}>
                <strong>{si.label}</strong>
                <span style={{ marginLeft: 8, fontSize: 12, opacity:.9 }}>This request is currently {String(selected?.status || 'requested')}.</span>
              </div>
            ); })()}

            {/* Friendly summary */}
            <div style={{ fontSize: 14, background:'#f8fafc', border:'1px solid #e5e7eb', padding: '10px 12px', borderRadius: 8 }}>
              {(() => {
                const name = selected?.contact?.name || 'Customer';
                const orderShort = String(selected?.orderRef?.orderId || selected?.orderRef?.id || '').slice(-8).toUpperCase();
                const when = formatDate(selected.createdAt);
                const status = String(selected?.status || 'requested');
                return (
                  <div>
                    <div><strong>{name}</strong> requested a refund for order <strong>#{orderShort}</strong>.</div>
                    <div style={{ fontSize: 12, color:'#555' }}>Submitted: {when} · Status: <span className={`badge ${status==='requested'?'muted':''}`}>{status}</span></div>
                  </div>
                );
              })()}
            </div>

            {/* Quick guide for beginners */}
            <div style={{ border:'1px solid #e5e7eb', borderRadius: 8, padding: '10px 12px', background:'#ffffff' }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>How to handle this request</div>
              {(() => { const st = String(selected?.status || 'requested'); const hasReturn = Boolean(orderInfo?.returnAwb);
                return (
                  <div style={{ display:'grid', gap: 8 }}>
                    <div style={{ display:'grid', gap: 6 }}>
                      <div><strong>1. Review</strong> the customer details, reason, and images below.</div>
                      {st === 'requested' && (
                        <>
                          <div><strong>2. Create Return Pickup</strong> first (schedule courier collection).</div>
                          <div><strong>3. Approve</strong> the request after return is created.</div>
                          {hasReturn && (
                            <div style={{ fontSize:12, color:'#166534', background:'#ecfdf5', border:'1px solid #bbf7d0', padding:'6px 8px', borderRadius:8 }}>
                              Return pickup has been created. Please click Approve to complete this request.
                            </div>
                          )}
                        </>
                      )}
                      {st === 'approved' && (
                        <>
                          {!hasReturn ? (
                            <div><strong>2. Next</strong> — Create Return Pickup if the item needs to be collected.</div>
                          ) : (
                            <div style={{ fontSize:12, color:'#1f2937' }}>This request is approved{hasReturn ? ' and the return pickup is created.' : '.'}</div>
                          )}
                        </>
                      )}
                      {st === 'rejected' && (<div><strong>2. Rejected</strong> — No further action required.</div>)}
                    </div>
                    <div style={{ display:'flex', gap: 8, flexWrap:'wrap' }}>
                      {st === 'requested' && (<>
                        {!hasReturn ? (
                          <>
                            <button onClick={() => createReturn(selected)}>Create Return Pickup</button>
                            <button onClick={() => reject(selected.id)}>Reject</button>
                          </>
                        ) : (
                          // After return is created: hide Create/Reject; only show Approve
                          <button className="primary" onClick={() => approve(selected.id)}>Approve</button>
                        )}
                      </>)}
                      {st === 'approved' && (!hasReturn ? (
                        <button onClick={() => createReturn(selected)}>Create Return Pickup</button>
                      ) : null)}
                      {/* st === 'rejected' → no action buttons */}
                    </div>
                  </div>
                ); })()}
            </div>

            {/* Summary */}
            <div style={{ display:'grid', gap: 8, gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))' }}>
              <div>
                <div style={{ fontSize: 12, color:'#555' }}>Order</div>
                <div style={{ fontWeight:600 }}>#{String(selected?.orderRef?.orderId || selected?.orderRef?.id || '').slice(-8)}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color:'#555' }}>Status</div>
                <div><span className={`badge ${String(selected.status||'requested')==='requested'?'muted':''}`}>{selected.status||'requested'}</span></div>
              </div>
              <div>
                <div style={{ fontSize: 12, color:'#555' }}>Created</div>
                <div>{formatDate(selected.createdAt)}</div>
              </div>
              {selected.processedAt && (
                <div>
                  <div style={{ fontSize: 12, color:'#555' }}>Processed</div>
                  <div>{formatDate(selected.processedAt)} {selected.processedBy ? `· ${selected.processedBy}` : ''}</div>
                </div>
              )}
              {selected.decisionNotes && (
                <div>
                  <div style={{ fontSize: 12, color:'#555' }}>Notes</div>
                  <div style={{ fontSize: 12 }}>{selected.decisionNotes}</div>
                </div>
              )}
            </div>

            {/* Customer & Address */}
            <div style={{ display:'grid', gap: 8, gridTemplateColumns:'repeat(auto-fit, minmax(260px, 1fr))' }}>
              <div>
                <div style={{ fontSize: 12, color:'#555' }}>Contact</div>
                <div style={{ fontWeight:600 }}>{selected?.contact?.name || '-'}</div>
                <div style={{ fontSize:12, color:'#666' }}>{selected?.contact?.email || ''}</div>
                <div style={{ fontSize:12, color:'#666' }}>{selected?.contact?.phone || ''}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color:'#555' }}>Address</div>
                <div style={{ fontSize: 12 }}>{selected?.address || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color:'#555' }}>Reason</div>
                <div style={{ fontSize: 12 }}>{reasonText(selected) || '-'}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color:'#555' }}>Condition / Resolution</div>
                <div style={{ fontSize: 12 }}>{selected?.condition || '-' } · {selected?.resolution || '-'}</div>
              </div>
              {selected?.refundMethod && (
                <div>
                  <div style={{ fontSize: 12, color:'#555' }}>Refund Method</div>
                  <div style={{ fontSize: 12 }}>{selected.refundMethod}</div>
                </div>
              )}
              {selected?.deliveryDate && (
                <div>
                  <div style={{ fontSize: 12, color:'#555' }}>Delivery Date</div>
                  <div style={{ fontSize: 12 }}>{String(selected.deliveryDate)}</div>
                </div>
              )}
              {selected?.requestDate && (
                <div>
                  <div style={{ fontSize: 12, color:'#555' }}>Request Date</div>
                  <div style={{ fontSize: 12 }}>{String(selected.requestDate)}</div>
                </div>
              )}
            </div>

            {/* Order details (if available) */}
            <div className="card" style={{ border:'1px solid var(--border)', borderRadius: 8 }}>
              <div className="card-body">
                <div style={{ fontWeight: 600, marginBottom: 6 }}>Order Details</div>
                {orderLoading ? (
                  <div style={{ fontSize: 12, color:'#666' }}>Loading order…</div>
                ) : !orderInfo ? (
                  <div style={{ fontSize: 12, color:'#666' }}>Order not found</div>
                ) : (
                  <div style={{ display:'grid', gap: 12 }}>
                    <div style={{ display:'grid', gap: 8, gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))' }}>
                      <div>
                        <div style={{ fontSize: 12, color:'#555' }}>Order</div>
                        <div>#{orderInfo.id.slice(-8)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color:'#555' }}>Placed On</div>
                        <div>{formatDate(orderInfo.createdAt)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color:'#555' }}>Payment Method</div>
                        <div style={{ fontSize: 12 }}>{String(orderInfo.paymentMethod || (orderInfo.paymentId ? 'online' : 'cod')).toUpperCase()}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color:'#555' }}>Tracking Number (Delivery)</div>
                        <div style={{ fontSize: 12 }}>{orderInfo.xbAwb || '-'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color:'#555' }}>Tracking Number (Return Pickup)</div>
                        <div style={{ fontSize: 12 }}>{orderInfo.returnAwb || '-'}</div>
                      </div>
                    </div>
                    {(() => {
                      const itemsCount = Array.isArray(orderInfo.items) ? orderInfo.items.reduce((s, it) => s + (Number(it.qty)||0), 0) : 0;
                      const amount = Number(orderInfo.amount || 0);
                      const discount = Number(orderInfo.discount || 0);
                      const payable = Number(orderInfo.payable || amount);
                      return (
                        <div style={{ display:'flex', gap: 12, flexWrap:'wrap' }}>
                          <div className="card" style={{ border:'1px solid #e5e7eb', borderRadius: 8 }}>
                            <div className="card-body">
                              <div style={{ fontSize: 12, color:'#555' }}>Items</div>
                              <div style={{ fontWeight:700 }}>{itemsCount}</div>
                            </div>
                          </div>
                          <div className="card" style={{ border:'1px solid #e5e7eb', borderRadius: 8 }}>
                            <div className="card-body">
                              <div style={{ fontSize: 12, color:'#555' }}>Total</div>
                              <div style={{ fontWeight:700 }}>{currencyINR(amount)}</div>
                            </div>
                          </div>
                          <div className="card" style={{ border:'1px solid #e5e7eb', borderRadius: 8 }}>
                            <div className="card-body">
                              <div style={{ fontSize: 12, color:'#555' }}>Discount</div>
                              <div style={{ fontWeight:700 }}>{discount ? `- ${currencyINR(discount)}` : '-'}</div>
                            </div>
                          </div>
                          <div className="card" style={{ border:'1px solid #e5e7eb', borderRadius: 8 }}>
                            <div className="card-body">
                              <div style={{ fontSize: 12, color:'#555' }}>Payable</div>
                              <div style={{ fontWeight:700 }}>{currencyINR(payable)}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
                {orderInfo?.items && orderInfo.items.length > 0 && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: 12, color:'#555', marginBottom: 6 }}>Items</div>
                    <div style={{ display:'grid', gap: 6 }}>
                      {orderInfo.items.map((it, i) => (
                        <div key={i} style={{ display:'flex', justifyContent:'space-between', gap: 8, background:'#fff', border:'1px solid #eee', borderRadius: 8, padding: '8px 10px' }}>
                          <div>
                            <div style={{ fontWeight:600 }}>{it.name}</div>
                            <div style={{ fontSize:12, color:'#666' }}>
                              {it?.meta?.size ? `Size ${it.meta.size}` : ''}{it?.meta?.gender ? ` · ${String(it.meta.gender).toUpperCase()}` : ''}
                            </div>
                          </div>
                          <div style={{ fontSize:12 }}>Qty: {it.qty}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Refund method — bank details (if any) */}
            {selected?.bank && typeof selected.bank === 'object' && (
              <div className="card" style={{ border:'1px solid var(--border)', borderRadius: 8 }}>
                <div className="card-body">
                  <div style={{ fontWeight:600, marginBottom: 6 }}>Bank Details</div>
                  <div style={{ display:'grid', gap: 8, gridTemplateColumns:'repeat(auto-fit, minmax(240px, 1fr))' }}>
                    {Object.entries(selected.bank).map(([k,v]) => (
                      <div key={k}>
                        <div style={{ fontSize:12, color:'#555' }}>{String(k).replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase())}</div>
                        <div style={{ fontSize:12 }}>{String(v)}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Declarations (yes/no) */}
            {selected?.declarations && typeof selected.declarations === 'object' && (
              <div className="card" style={{ border:'1px solid var(--border)', borderRadius: 8 }}>
                <div className="card-body">
                  <div style={{ fontWeight:600, marginBottom: 6 }}>Declarations</div>
                  <div style={{ display:'grid', gap: 6, gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))' }}>
                    {Object.entries(selected.declarations).map(([k,v]) => (
                      <div key={k} style={{ fontSize:12 }}>
                        <strong>{String(k).replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase())}:</strong> {String(v)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {Array.isArray(selected?.images) && selected.images.length > 0 && (
              <div>
                <div style={{ fontSize: 12, color:'#555', marginBottom: 6 }}>Images</div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                  {selected.images.map((im, i) => (
                    <a key={i} href={im.publicUrl || '#'} target="_blank" rel="noreferrer" style={{ border:'1px solid #eee', borderRadius: 8, overflow:'hidden', background:'#fff' }}>
                      {im.publicUrl ? (
                        <img alt={`Evidence ${i+1}`} src={im.publicUrl} style={{ width:'100%', height:120, objectFit:'cover' }} />
                      ) : (
                        <div style={{ width:'100%', height:120, display:'flex', alignItems:'center', justifyContent:'center', color:'#999' }}>No preview</div>
                      )}
                      <div style={{ padding:'6px 8px', fontSize:11, color:'#555', borderTop:'1px solid #eee' }}>{im.name || `Evidence ${i+1}`}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            <div style={{ fontSize: 12, color:'#555' }}>Create Return first, then Approve. Approve updates status only (no message). Reject requires a reason and notifies the customer. After approval, you can optionally send a success message to the user.</div>
          </div>
        </div>
      )}
    </div>
  );
}
