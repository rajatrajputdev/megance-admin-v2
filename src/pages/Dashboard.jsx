import React from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';

function useOrders() {
  const [orders, setOrders] = React.useState([]);
  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, 'orders'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setOrders(list);
    });
    return () => unsub();
  }, []);
  return orders;
}

function useProducts() {
  const [products, setProducts] = React.useState([]);
  React.useEffect(() => {
    const unsub = onSnapshot(collection(db, 'products'), (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProducts(list);
    });
    return () => unsub();
  }, []);
  return products;
}

function computeMostSold(orders) {
  const paid = (orders || []).filter((o) => Boolean(o?.paymentId));
  const counts = new Map(); // name -> qty
  for (const o of paid) {
    const items = Array.isArray(o?.items) ? o.items : [];
    for (const it of items) {
      const name = String(it?.name || '').trim();
      if (!name) continue;
      const qty = Number(it?.qty || 0) || 0;
      counts.set(name, (counts.get(name) || 0) + qty);
    }
  }
  let top = null;
  for (const [name, qty] of counts.entries()) {
    if (!top || qty > top.qty) top = { name, qty };
  }
  return top; // { name, qty } or null
}

function MostSoldCard() {
  const orders = useOrders();
  const products = useProducts();
  const top = React.useMemo(() => computeMostSold(orders), [orders]);
  const product = React.useMemo(() => {
    if (!top) return null;
    return products.find((p) => String(p?.name || '').trim() === top.name) || null;
  }, [products, top]);

  if (!orders.length) {
    return (
      <div className="card">
        <div className="card-body">Loading stats…</div>
      </div>
    );
  }
  if (!top) {
    return (
      <div className="card">
        <div className="card-body">No sales yet</div>
      </div>
    );
  }

  const cover = product?.imageUrl || (Array.isArray(product?.images) && product.images[0]) || null;
  const desc = product?.description || '';

  return (
    <div className="card" style={{ maxWidth: 520 }}>
      {cover ? (
        <img className="card-img" src={cover} alt={top.name} style={{ height: 140 }} />
      ) : (
        <div className="card-img" style={{ height: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>No Image</div>
      )}
      <div className="card-body">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Most Sold Product</h2>
          <span className="badge">{top.qty} sold</span>
        </div>
        <div style={{ marginTop: 6, fontWeight: 600 }}>{top.name}</div>
        {desc ? (
          <div style={{ fontSize: 12, color: '#555', marginTop: 4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{desc}</div>
        ) : null}
      </div>
    </div>
  );
}

const Dashboard = () => {
  return (
    <div>
      <div className="toolbar">
        <h1>Dashboard</h1>
      </div>
      <div className="grid-cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
        <MostSoldCard />
      </div>
    </div>
  );
};

export default Dashboard;
