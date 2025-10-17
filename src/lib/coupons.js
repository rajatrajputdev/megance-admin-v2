import { db } from "../firebase/config";
import { collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp, Timestamp } from "firebase/firestore";

export async function fetchCoupons() {
  const snap = await getDocs(collection(db, "coupons"));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

function toTs(v) {
  if (!v) return null;
  try {
    if (v instanceof Timestamp) return v;
    const d = new Date(v);
    if (isNaN(d.getTime())) return null;
    return Timestamp.fromDate(d);
  } catch { return null; }
}

export async function upsertCoupon(input) {
  const code = String(input.code || "").trim().toUpperCase();
  if (!code) throw new Error("Coupon code is required");
  const ref = doc(db, "coupons", code);
  const type = String(input.type || "").toLowerCase() === "flat" ? "flat" : "percent";
  const data = {
    type,
    value: Number(input.value) || 0,
    minAmount: Number(input.minAmount) || 0,
    maxDiscount: Number(input.maxDiscount) || 0,
    maxUses: Number(input.maxUses) || 0,
    perUserLimit: Number(input.perUserLimit) || 1,
    startAt: toTs(input.startAt),
    endAt: toTs(input.endAt),
    isActive: Boolean(input.isActive),
    label: (input.label || "").toString().slice(0, 140),
    updatedAt: serverTimestamp(),
  };
  if (input._new) data.createdAt = serverTimestamp();
  await setDoc(ref, data, { merge: true });
}

export async function deleteCoupon(code) {
  const id = String(code || "").trim().toUpperCase();
  if (!id) return;
  await deleteDoc(doc(db, "coupons", id));
}

