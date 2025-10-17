import React, { useEffect, useState } from 'react';
import { fetchCoupons, upsertCoupon, deleteCoupon } from '../lib/coupons';

const empty = { code: '', type: 'percent', value: 10, minAmount: 0, maxDiscount: 0, maxUses: 0, perUserLimit: 1, startAt: '', endAt: '', isActive: true, label: '' };

export default function Coupons() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const load = async () => {
    setLoading(true);
    try { setList(await fetchCoupons()); } catch { setList([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const onChange = (e) => setForm((f) => ({ ...f, [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const save = async (e) => {
    e?.preventDefault(); setErr(''); setSaving(true);
    try { await upsertCoupon({ ...form, _new: true }); setForm(empty); await load(); } catch (e1) { setErr(e1?.message || 'Failed'); } finally { setSaving(false); }
  };

  const toggle = async (code, isActive) => { try { await upsertCoupon({ code, isActive: !isActive }); await load(); } catch {} };
  const remove = async (code) => { if (!confirm('Delete coupon?')) return; try { await deleteCoupon(code); await load(); } catch {} };

  return (
    <div>
      <div className="toolbar"><h1>Coupons</h1></div>
      <form className="form" onSubmit={save} style={{ marginBottom: 16 }}>
        <div className="form-row" style={{ display:'grid', gridTemplateColumns:'repeat(2, minmax(160px, 1fr))', gap: 10 }}>
          <div>
            <label className="label">Code</label>
            <input className="input" name="code" value={form.code} onChange={onChange} placeholder="e.g. FESTIVE15" required />
          </div>
          <div>
            <label className="label">Type</label>
            <select className="select" name="type" value={form.type} onChange={onChange}>
              <option value="percent">Percent</option>
              <option value="flat">Flat</option>
            </select>
          </div>
          <div>
            <label className="label">Value</label>
            <input className="input" type="number" name="value" value={form.value} onChange={onChange} />
          </div>
          <div>
            <label className="label">Min Amount</label>
            <input className="input" type="number" name="minAmount" value={form.minAmount} onChange={onChange} />
          </div>
          <div>
            <label className="label">Max Discount (optional)</label>
            <input className="input" type="number" name="maxDiscount" value={form.maxDiscount} onChange={onChange} />
          </div>
          <div>
            <label className="label">Max Uses (global)</label>
            <input className="input" type="number" name="maxUses" value={form.maxUses} onChange={onChange} />
          </div>
          <div>
            <label className="label">Per-User Limit</label>
            <input className="input" type="number" name="perUserLimit" value={form.perUserLimit} onChange={onChange} />
          </div>
          <div>
            <label className="label">Label (optional)</label>
            <input className="input" name="label" value={form.label} onChange={onChange} placeholder="Shown in UI" />
          </div>
          <div>
            <label className="label">Start (optional)</label>
            <input className="input" type="datetime-local" name="startAt" value={form.startAt} onChange={onChange} />
          </div>
          <div>
            <label className="label">End (optional)</label>
            <input className="input" type="datetime-local" name="endAt" value={form.endAt} onChange={onChange} />
          </div>
          <div style={{ display:'flex', alignItems:'end' }}>
            <label style={{ display:'inline-flex', gap:6, alignItems:'center' }}>
              <input type="checkbox" name="isActive" checked={form.isActive} onChange={onChange} /> Active
            </label>
          </div>
        </div>
        <button className="primary" type="submit" disabled={saving} style={{ marginTop: 10 }}>{saving ? 'Saving…' : 'Add Coupon'}</button>
        {err && <div style={{ color:'#a61717', marginTop:8 }}>{err}</div>}
      </form>

      {loading ? (
        <p>Loading…</p>
      ) : (
        <div style={{ overflowX:'auto' }}>
          <table className="table" style={{ width:'100%', borderCollapse:'collapse' }}>
            <thead>
              <tr>
                <th align="left">Code</th>
                <th>Type</th>
                <th>Value</th>
                <th>Min</th>
                <th>Cap</th>
                <th>Max Uses</th>
                <th>Per User</th>
                <th>Total Used</th>
                <th>Active</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} style={{ borderTop:'1px solid #eee' }}>
                  <td>{c.id}</td>
                  <td align="center">{c.type}</td>
                  <td align="right">{c.value}</td>
                  <td align="right">{c.minAmount || 0}</td>
                  <td align="right">{c.maxDiscount || 0}</td>
                  <td align="right">{c.maxUses || 0}</td>
                  <td align="right">{c.perUserLimit || 1}</td>
                  <td align="right">{c.totalUses || 0}</td>
                  <td align="center">{c.isActive ? 'Yes' : 'No'}</td>
                  <td align="right">
                    <button onClick={() => toggle(c.id, c.isActive)} style={{ marginRight: 8 }}>{c.isActive ? 'Disable' : 'Enable'}</button>
                    <button onClick={() => remove(c.id)} style={{ color:'#a61717' }}>Delete</button>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={10} style={{ padding: 12, opacity:.7 }}>No coupons yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

