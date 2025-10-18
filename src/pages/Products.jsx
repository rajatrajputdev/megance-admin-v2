import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Link } from 'react-router-dom';
import { deleteProduct } from '../lib/products';

const Products = () => {
  const [products, setProducts] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [visibility, setVisibility] = useState('all');
  const [sort, setSort] = useState('name-asc');

  useEffect(() => {
    const q = query(collection(db, 'products'), orderBy('name'));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setProducts(list);
    });
    return () => unsub();
  }, []);

  const onDelete = async (p) => {
    // eslint-disable-next-line no-alert
    const ok = confirm(`Delete product "${p.name}"? This cannot be undone.`);
    if (!ok) return;
    await deleteProduct(p.id);
  };

  const categories = useMemo(() => {
    const set = new Set(products.map((p) => String(p.categoryName || '').trim()).filter(Boolean));
    return Array.from(set).sort((a,b)=>a.localeCompare(b));
  }, [products]);

  const filteredSorted = useMemo(() => {
    const term = search.trim().toLowerCase();
    let list = products.filter((p) => {
      const okName = term ? String(p.name || '').toLowerCase().includes(term) : true;
      const okCat = category ? String(p.categoryName || '') === category : true;
      const okVis = visibility === 'all' ? true : visibility === 'visible' ? !!p.isVisible : !p.isVisible;
      return okName && okCat && okVis;
    });
    const getPrice = (p) => Number(p?.price || 0) || 0;
    const getQty = (p) => Number(p?.quantity || 0) || 0;
    const getCreated = (p) => (p?.createdAt?.toMillis?.() || 0);
    switch (sort) {
      case 'name-desc':
        list.sort((a,b)=>String(b.name||'').localeCompare(String(a.name||'')));
        break;
      case 'price-asc':
        list.sort((a,b)=>getPrice(a)-getPrice(b));
        break;
      case 'price-desc':
        list.sort((a,b)=>getPrice(b)-getPrice(a));
        break;
      case 'stock-asc':
        list.sort((a,b)=>getQty(a)-getQty(b));
        break;
      case 'stock-desc':
        list.sort((a,b)=>getQty(b)-getQty(a));
        break;
      case 'created-desc':
        list.sort((a,b)=>getCreated(b)-getCreated(a));
        break;
      case 'created-asc':
        list.sort((a,b)=>getCreated(a)-getCreated(b));
        break;
      case 'name-asc':
      default:
        list.sort((a,b)=>String(a.name||'').localeCompare(String(b.name||'')));
        break;
    }
    return list;
  }, [products, search, category, visibility, sort]);

  return (
    <div>
      <div className="toolbar">
        <div>
          <h1>Products</h1>
          <div style={{ fontSize: 12, color: '#555' }}>Showing {filteredSorted.length} of {products.length}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            className="input"
            placeholder="Search products…"
            value={search}
            onChange={(e)=>setSearch(e.target.value)}
            style={{ width: 200 }}
          />
          <select className="select" value={category} onChange={(e)=>setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map((c)=> (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <select className="select" value={visibility} onChange={(e)=>setVisibility(e.target.value)}>
            <option value="all">All</option>
            <option value="visible">Visible</option>
            <option value="hidden">Hidden</option>
          </select>
          <select className="select" value={sort} onChange={(e)=>setSort(e.target.value)}>
            <option value="name-asc">Name: A → Z</option>
            <option value="name-desc">Name: Z → A</option>
            <option value="price-asc">Price: Low → High</option>
            <option value="price-desc">Price: High → Low</option>
            <option value="stock-desc">Stock: High → Low</option>
            <option value="stock-asc">Stock: Low → High</option>
            <option value="created-desc">Newest first</option>
            <option value="created-asc">Oldest first</option>
          </select>
          <Link to="/add-product">
            <button className="primary">Add Product</button>
          </Link>
        </div>
      </div>
      <div className="grid-cards">
        {filteredSorted.map(product => (
          <div key={product.id} className="card">
            {(() => {
              const fallbackArr = Array.isArray(product.images) ? product.images : [];
              const cover = product.imageUrl || (fallbackArr.length ? fallbackArr[0] : null);
              return cover ? (
                <img className="card-img" src={cover} alt={product.name} />
              ) : (
                <div className="card-img" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>No Image</div>
              );
            })()}
            <div className="card-body">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: 16, margin: 0 }}>{product.name}</h2>
                <span className={`badge ${product.isVisible ? '' : 'muted'}`}>
                  {product.isVisible ? 'Visible' : 'Hidden'}
                </span>
              </div>
              <div style={{ marginTop: 6, fontSize: 12, color: '#333' }}>
                <strong>Stock:</strong> {typeof product.quantity === 'number' ? product.quantity : '-'}
              </div>
              {product.categoryName && (
                <div style={{ fontSize: 12, color: '#555', marginTop: 4 }}>Category: {product.categoryName}</div>
              )}
              {Array.isArray(product.tags) && product.tags.length > 0 && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {product.tags.map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                </div>
              )}
              <p style={{ marginTop: 8, marginBottom: 4 }}>Price: ₹ {product.price}</p>
              {/* Sizes (generic array with quantities) */}
              {Array.isArray(product.sizes) && product.sizes.length > 0 && (
                <div style={{ fontSize: 12, color: '#333' }}>
                  Sizes:
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                    {product.sizes.map((s, i) => (
                      <span key={i} style={{ padding: '2px 6px', border: '1px solid #eee', borderRadius: 6 }}>
                        {s.size}: {s.quantity}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Sizes (per gender quantities) */}
              {!Array.isArray(product.sizes) && product.sizeQuantities && (
                <div style={{ fontSize: 12, color: '#333', marginTop: 6 }}>
                  {['men', 'women'].map((g) => (
                    Array.isArray(product.sizeQuantities[g]) && product.sizeQuantities[g].length > 0 ? (
                      <div key={g} style={{ marginTop: 6 }}>
                        <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{g}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                          {product.sizeQuantities[g].map((s, i) => (
                            <span key={`${g}-${i}`} style={{ padding: '2px 6px', border: '1px solid #eee', borderRadius: 6 }}>
                              {s.size}: {s.quantity}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null
                  ))}
                </div>
              )}

              {/* Sizes (per gender strings only) */}
              {!Array.isArray(product.sizes) && !product.sizeQuantities && product.sizes && (
                <div style={{ fontSize: 12, color: '#333', marginTop: 6 }}>
                  {['men', 'women'].map((g) => (
                    Array.isArray(product.sizes[g]) && product.sizes[g].length > 0 ? (
                      <div key={g} style={{ marginTop: 6 }}>
                        <div style={{ fontWeight: 600, textTransform: 'capitalize' }}>{g}</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                          {product.sizes[g].map((s, i) => (
                            <span key={`${g}-${i}`} style={{ padding: '2px 6px', border: '1px solid #eee', borderRadius: 6 }}>
                              {s}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null
                  ))}
                </div>
              )}
          </div>
          <div className="card-footer" style={{ display: 'flex', gap: 8, padding: '8px 12px' }}>
            <Link to={`/edit-product/${product.id}`}>
              <button className="primary" type="button">Edit</button>
            </Link>
            <button className="danger" type="button" onClick={() => onDelete(product)}>Delete</button>
          </div>
        </div>
      ))}
      </div>
    </div>
  );
};

export default Products;
