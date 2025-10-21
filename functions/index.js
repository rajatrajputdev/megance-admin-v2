'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');

try { admin.initializeApp(); } catch (_) {}

const REGION = process.env.FUNCTIONS_REGION || 'asia-south2';
const OWNER_EMAIL = process.env.OWNER_EMAIL || 'megancetech@gmail.com';

// Secrets for XpressBees + Twilio (returns notifications)
const XPRESSBEES_USERNAME = defineSecret('XPRESSBEES_USERNAME');
const XPRESSBEES_PASSWORD = defineSecret('XPRESSBEES_PASSWORD');
const TWILIO_ACCOUNT_SID = defineSecret('TWILIO_ACCOUNT_SID');
const TWILIO_AUTH_TOKEN = defineSecret('TWILIO_AUTH_TOKEN');
const TWILIO_WHATSAPP_FROM = defineSecret('TWILIO_WHATSAPP_FROM');
const TWILIO_RETURNS_USER_TEMPLATE_SID = defineSecret('TWILIO_RETURNS_USER_TEMPLATE_SID');
// Only rejection template is needed per latest requirement
const TWILIO_RETURNS_USER_REJECTED_SID = defineSecret('TWILIO_RETURNS_USER_REJECTED_SID');
// Success SID removed per requirement; only reject sends WhatsApp now

function isAdminAuth(ctx) {
  const email = ctx?.auth?.token?.email || '';
  const claimAdmin = ctx?.auth?.token?.admin === true;
  return claimAdmin || (email && email.toLowerCase() === OWNER_EMAIL.toLowerCase());
}

function phoneToWhatsApp(raw) {
  try {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (s.startsWith('whatsapp:')) return s;
    if (s.startsWith('+')) return `whatsapp:${s}`;
    const digits = s.replace(/[^\d]/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `whatsapp:+91${digits}`;
    return `whatsapp:+${digits}`;
  } catch { return ''; }
}

function xbOrigin(rawBase) {
  try {
    const raw = (rawBase || process.env.XPRESSBEES_BASE_URL || 'https://shipment.xpressbees.com').toString();
    const u = new URL(raw);
    return u.origin;
  } catch (_) {
    try { return String(rawBase || process.env.XPRESSBEES_BASE_URL || 'https://shipment.xpressbees.com').replace(/\/api\/.*/, '').replace(/\/$/, ''); } catch { return 'https://shipment.xpressbees.com'; }
  }
}

async function getXpressbeesToken({ username, password }) {
  const email = String(username || '').trim();
  const pass = String(password || '').trim();
  const loginUrl = `${xbOrigin()}/api/users/login`;
  const resp = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: pass })
  });
  let json = null; try { json = await resp.json(); } catch { json = null; }
  if (!resp.ok) {
    const msg = (json && (json.message || json.error)) || `HTTP ${resp.status}`;
    throw new Error(msg);
  }
  let tok = null;
  if (json) {
    if (typeof json.data === 'string') tok = json.data;
    if (!tok) tok = json.token || json.access_token || (json.data && (json.data.token || json.data.access_token)) || null;
  }
  if (!tok) throw new Error('Login ok but no token');
  return tok;
}

function trunc(s, n) { try { const v = String(s || ''); return v.length > n ? v.slice(0, n) : v; } catch { return ''; } }
function onlyDigits(s) { try { return String(s || '').replace(/[^\d]/g, ''); } catch { return ''; } }
function phone10(s) { const d = onlyDigits(s); return d.length >= 10 ? d.slice(-10) : d; }
function pin6(s) { const d = onlyDigits(s); return d.length >= 6 ? d.slice(0, 6) : d; }
function splitAddress(addr) {
  try {
    const s = String(addr || '').trim();
    if (!s) return { address: '', address_2: '' };
    const parts = s.split(/,\s*/);
    const a1 = trunc(parts.slice(0, 2).join(', '), 200) || trunc(s, 200);
    const a2 = trunc(parts.slice(2).join(', '), 200);
    return { address: a1, address_2: a2 };
  } catch { return { address: '', address_2: '' }; }
}
function kgToGrams(kg) { const n = Number(kg); if (!Number.isFinite(n)) return 500; return Math.max(1, Math.round(n * 1000)); }

// Warehouse/pickup defaults (kept minimal; adjust via env if needed)
const PICKUP_DETAILS = {
  warehouse_name: process.env.PICKUP_WAREHOUSE_NAME || 'Megance WH1',
  name: process.env.PICKUP_NAME || 'Megance',
  phone: process.env.PICKUP_PHONE || '8882132169',
  email: process.env.PICKUP_EMAIL || 'support@megance.com',
  address: process.env.PICKUP_ADDRESS || 'A-51, First floor, Meera Bagh, Paschim Vihar',
  city: process.env.PICKUP_CITY || 'NEW DELHI',
  state: process.env.PICKUP_STATE || 'DELHI',
  pincode: process.env.PICKUP_PINCODE || '110087',
  gst_number: process.env.PICKUP_GST || process.env.XPRESSBEES_GST_NUMBER || ''
};

function buildXbReversePayload({ orderLabel, data, pickupOverride }) {
  const billing = data.billing || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const amount = Math.round(Number(data.amount) || 0);
  const discount = Math.round(Number(data.discount) || 0);
  const base = Math.max(0, amount - discount);
  const gst = Number.isFinite(Number(data.gst)) ? Math.round(Number(data.gst)) : Math.round(base * 0.18);
  const payable = Math.round(Number(data.payable) || base + gst);

  const dwKg = Number(process.env.XPRESSBEES_DEFAULT_WEIGHT || 0.7);
  const grams = kgToGrams(dwKg);
  const dl = Number(process.env.XPRESSBEES_DEFAULT_LENGTH || 30);
  const dbt = Number(process.env.XPRESSBEES_DEFAULT_BREADTH || 20);
  const dh = Number(process.env.XPRESSBEES_DEFAULT_HEIGHT || 10);

  // In reverse, pickup is buyer (allow override)
  const pName = pickupOverride?.name || billing.name || '';
  const pPhone = phone10(pickupOverride?.phone || billing.phone || '');
  const pZipRaw = pickupOverride?.zip || pickupOverride?.pincode || pickupOverride?.pin || '';
  const pickupPin = pin6(pZipRaw || billing.zip || '');
  const pickupAddressRaw = pickupOverride?.address || billing.address || '';
  const { address: pickupAddr1, address_2: pickupAddr2 } = splitAddress(pickupAddressRaw);
  const pickupCity = trunc(pickupOverride?.city || billing.city || '', 40);
  const pickupState = trunc(pickupOverride?.state || billing.state || '', 40);

  // Consignee is warehouse (our address)
  const warehouse_name = trunc(PICKUP_DETAILS.warehouse_name || 'Megance WH1', 20);
  const consAddr1 = PICKUP_DETAILS.address || '';
  const consAddr2 = '';
  const consigneePin = pin6(PICKUP_DETAILS.pincode || '');
  const consigneePhone = phone10(PICKUP_DETAILS.phone || '');
  const cityGuess = PICKUP_DETAILS.city || 'NEW DELHI';
  const gstNo = (PICKUP_DETAILS.gst_number || '').trim();

  const order_items = items.map((it) => ({
    name: String(it.name || ''),
    qty: String(Number(it.qty) || 1),
    price: String(Number(it.price) || 0),
    sku: String(it.id || '')
  }));

  return {
    order_number: trunc(orderLabel, 20),
    payment_type: 'prepaid',
    order_amount: payable,
    discount: discount || 0,
    package_weight: grams,
    package_length: dl,
    package_breadth: dbt,
    package_height: dh,
    request_auto_pickup: (process.env.XPRESSBEES_AUTO_PICKUP || 'yes').toLowerCase() === 'yes' ? 'yes' : 'no',
    pickup: {
      warehouse_name: trunc((pName || 'Buyer').toString(), 20),
      name: trunc(pName || '', 200),
      address: pickupAddr1,
      address_2: pickupAddr2,
      city: pickupCity,
      state: pickupState,
      pincode: pickupPin,
      phone: pPhone,
    },
    consignee: {
      name: trunc(PICKUP_DETAILS.name || 'Megance', 200),
      company_name: trunc(warehouse_name, 200),
      address: consAddr1,
      address_2: consAddr2,
      city: trunc(cityGuess || 'NEW DELHI', 40),
      state: trunc(PICKUP_DETAILS.state || 'DELHI', 40),
      pincode: consigneePin,
      phone: consigneePhone || '9999999999',
      ...(gstNo ? { gst_number: gstNo } : {}),
    },
    order_items,
    collectable_amount: 0,
    is_reverse: true,
  };
}

async function sendWhatsApp({ accountSid, authToken, from, to, contentSid, variables }) {
  if (!accountSid || !authToken || !from || !to || !contentSid) {
    return { ok: false, error: 'missing_config' };
  }
  const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  const body = new URLSearchParams({ From: from, To: to, ContentSid: contentSid, ContentVariables: variables }).toString();
  const resp = await fetch(endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: `Basic ${auth}` }, body });
  if (!resp.ok) { const txt = await resp.text().catch(()=> ''); return { ok: false, error: txt || `HTTP ${resp.status}` }; }
  const msg = await resp.json().catch(()=>({}));
  return { ok: true, sid: msg?.sid || null };
}

// Admin: Resolve a refund request (approve/reject) and optionally notify via WhatsApp
exports.adminResolveRefundRequest = onCall({ region: REGION, secrets: [
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_FROM,
  TWILIO_RETURNS_USER_REJECTED_SID, TWILIO_RETURNS_USER_TEMPLATE_SID,
] }, async (req) => {
  if (!isAdminAuth(req)) throw new HttpsError('permission-denied', 'Admin only');
  const id = String(req.data?.id || '').trim();
  const decisionRaw = String(req.data?.status || req.data?.decision || '').trim().toLowerCase();
  const notes = String(req.data?.notes || '').trim();
  if (!id) throw new HttpsError('invalid-argument', 'id is required');
  if (!['approved', 'rejected'].includes(decisionRaw)) throw new HttpsError('invalid-argument', 'status must be approved|rejected');

  const db = admin.firestore();
  const ref = db.doc(`refundRequests/${id}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Request not found');
  const data = snap.data() || {};

  const processedAt = admin.firestore.FieldValue.serverTimestamp();
  const actor = req?.auth?.token?.email || '(admin)';

  await ref.set({ status: decisionRaw, processedAt, processedBy: actor, decisionNotes: notes || null }, { merge: true });

  // Mirror to user's subcollection if present
  try {
    const uid = String(data.userId || '');
    if (uid) {
      await db.collection('users').doc(uid).collection('refundRequests').doc(id)
        .set({ status: decisionRaw, processedAt, processedBy: actor, decisionNotes: notes || null }, { merge: true });
    }
  } catch (_) {}

  // Try WhatsApp notification to USER ONLY (no admin copy)
  try {
    if (decisionRaw === 'rejected') {
      // Enforce justification for rejection
      if (!notes || !String(notes).trim()) {
        throw new HttpsError('invalid-argument', 'Rejection note is required');
      }
      const accountSid = TWILIO_ACCOUNT_SID.value() || process.env.TWILIO_ACCOUNT_SID || '';
      const authToken = TWILIO_AUTH_TOKEN.value() || process.env.TWILIO_AUTH_TOKEN || '';
      let from = TWILIO_WHATSAPP_FROM.value() || process.env.TWILIO_WHATSAPP_FROM || '';
      const contentRejected = (TWILIO_RETURNS_USER_REJECTED_SID.value() || process.env.TWILIO_RETURNS_USER_REJECTED_SID || '').trim();
      const contentFallback = (TWILIO_RETURNS_USER_TEMPLATE_SID.value() || process.env.TWILIO_RETURNS_USER_TEMPLATE_SID || '').trim();
      if (from && !from.startsWith('whatsapp:')) from = 'whatsapp:' + (from.startsWith('+') ? from : ('+' + String(from).replace(/[^\d+]/g, '')));

      const userPhone = data?.contact?.phone || '';
      const toUser = phoneToWhatsApp(userPhone);

      const orderIdLabel = String(data?.orderRef?.orderId || data?.orderRef?.id || '').trim();
      const userVars = JSON.stringify({
        1: String(data?.contact?.name || ''),
        2: orderIdLabel,
        3: 'REJECTED',
        4: String(notes).trim(),
      });

      if (accountSid && authToken && from) {
        const contentSid = contentRejected || contentFallback;
        try { if (toUser && contentSid) await sendWhatsApp({ accountSid, authToken, from, to: toUser, contentSid, variables: userVars }); } catch (_) {}
      }
    }
  } catch (e) {
    if (e instanceof HttpsError) throw e;
  }


  return { ok: true };
});

// Admin: Create a reverse pickup (return) for an order and persist to order doc
exports.adminCreateReturn = onCall({ region: REGION, secrets: [XPRESSBEES_USERNAME, XPRESSBEES_PASSWORD] }, async (req) => {
  if (!isAdminAuth(req)) throw new HttpsError('permission-denied', 'Admin only');
  const orderId = String(req.data?.orderId || '').trim();
  if (!orderId) throw new HttpsError('invalid-argument', 'orderId is required');
  const pickup = (() => {
    const p = req.data?.pickup || {};
    if (!p || typeof p !== 'object') return null;
    const out = {};
    if (p.name) out.name = String(p.name);
    if (p.phone) out.phone = String(p.phone);
    if (p.address) out.address = String(p.address);
    if (p.city) out.city = String(p.city);
    if (p.state) out.state = String(p.state);
    if (p.zip || p.pincode || p.pin) out.zip = String(p.zip || p.pincode || p.pin);
    return Object.keys(out).length ? out : null;
  })();
  const reason = String(req.data?.reason || '').trim();
  const notes = String(req.data?.notes || '').trim();

  const db = admin.firestore();
  let ref = db.doc(`orders/${orderId}`);
  let snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Order not found');
  const data = snap.data() || {};

  // Idempotency: if already created
  if (data.returnAwb || data.returnShipmentId) {
    return { ok: true, already: true, awb: data.returnAwb || null, shipmentId: data.returnShipmentId || null };
  }

  const username = XPRESSBEES_USERNAME.value() || process.env.XPRESSBEES_USERNAME || '';
  const password = XPRESSBEES_PASSWORD.value() || process.env.XPRESSBEES_PASSWORD || '';
  if (!username || !password) throw new HttpsError('failed-precondition', 'XpressBees not configured');

  const token = await getXpressbeesToken({ username, password });
  const orderLabel = `RET${orderId.slice(0,6).toUpperCase()}`;
  const payload = buildXbReversePayload({ orderLabel, data, pickupOverride: pickup || null });
  if (reason || notes) payload.remarks = [reason, notes].filter(Boolean).join(' | ');

  const url = `${xbOrigin()}/api/shipments2`;
  let resp = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(payload) });
  if (resp.status === 401 || resp.status === 403) {
    const fresh = await getXpressbeesToken({ username, password });
    resp = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${fresh}` }, body: JSON.stringify(payload) });
  }
  let raw = null; try { raw = await resp.json(); } catch { try { raw = await resp.text(); } catch { raw = null; } }
  if (!resp.ok) {
    const msg = (raw && (raw.message || raw.error)) || `HTTP ${resp.status}`;
    throw new HttpsError('internal', String(msg));
  }
  let awb = null, shipmentId = null;
  try {
    const s = raw && typeof raw === 'object' ? (raw.data || raw || {}) : {};
    awb = s?.awb_number || s?.awb || s?.awbno || null;
    shipmentId = s?.shipment_id || s?.order_id || s?.id || null;
  } catch {}

  await ref.set({
    returnRequested: true,
    returnRequestedAt: admin.firestore.FieldValue.serverTimestamp(),
    returnAwb: awb || null,
    returnShipmentId: shipmentId || null,
    returnRaw: raw || null,
    ...(reason ? { returnReason: reason } : {}),
    ...(notes ? { returnNotes: notes } : {}),
    ...(pickup ? { returnPickup: pickup } : {}),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // Mirror to user subcollection if exists
  try {
    const uid = String(data.userId || '');
    if (uid) {
      await db.collection('users').doc(uid).collection('orders').doc(orderId).set({
        returnRequested: true,
        returnAwb: awb || null,
        returnShipmentId: shipmentId || null,
        ...(reason ? { returnReason: reason } : {}),
        ...(notes ? { returnNotes: notes } : {}),
        ...(pickup ? { returnPickup: pickup } : {}),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  } catch (_) {}

  return { ok: true, awb, shipmentId };
});
