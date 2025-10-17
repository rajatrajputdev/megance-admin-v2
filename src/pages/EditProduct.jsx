import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc, deleteField } from 'firebase/firestore';
import { db } from '../firebase/config';
import { uploadProductImages, removeProductImage } from '../lib/storage';
import { updateProduct } from '../lib/products';
import { useNavigate, useParams } from 'react-router-dom';

const EditProduct = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  // Back-compat single cover fields
  const [imageUrl, setImageUrl] = useState('');
  const [imagePath, setImagePath] = useState('');
  // Array-based images
  const [currentImages, setCurrentImages] = useState([]); // [{ url, path }]
  const [removedPaths, setRemovedPaths] = useState(new Set());
  const [newImages, setNewImages] = useState([]); // File[]
  // Cover & hover selections (keys). Key is existing path or `url:<url>` for current images; for new files it's `new:<index>`
  const [coverKey, setCoverKey] = useState('');
  const [hoverKey, setHoverKey] = useState('');
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  const [availableTags] = useState(['trending', 'bestseller', 'new-arrival', 'featured']);
  const [selectedTags, setSelectedTags] = useState([]);
  const [customTags, setCustomTags] = useState('');
  const [genders, setGenders] = useState([]);
  const [sizesMen, setSizesMen] = useState([{ size: '', quantity: 0 }]);
  const [sizesWomen, setSizesWomen] = useState([{ size: '', quantity: 0 }]);
  const [sizesList, setSizesList] = useState([{ size: '', quantity: 0 }]);

  useEffect(() => {
    const loadCategories = async () => {
      const snap = await getDocs(collection(db, 'categories'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCategories(list);
    };
    loadCategories();
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const ref = doc(db, 'products', id);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        setLoading(false);
        navigate('/products');
        return;
      }
      const p = snap.data();
      setName(p.name || '');
      setDescription(p.description || '');
      setPrice(String(p.price ?? ''));
      setQuantity(String(p.quantity ?? ''));
      setImageUrl(p.imageUrl || '');
      setImagePath(p.imagePath || '');
      const urls = Array.isArray(p.images) ? p.images.filter(Boolean) : [];
      const paths = Array.isArray(p.imagePaths) ? p.imagePaths.filter(Boolean) : [];
      // Pair arrays by index when possible; fall back to url-only entries
      const paired = urls.map((u, i) => ({ url: u, path: paths[i] || null }));
      setCurrentImages(paired);
      // Initialize cover/hover keys from existing values if possible
      const findKeyFor = (u, pth) => {
        const idx = paired.findIndex(ci => (pth ? ci.path === pth : false) || ci.url === u);
        if (idx >= 0) return paired[idx].path || `url:${paired[idx].url}`;
        return '';
      };
      setCoverKey(findKeyFor(p.imageUrl, p.imagePath) || (paired[0] ? (paired[0].path || `url:${paired[0].url}`) : ''));
      setHoverKey(findKeyFor(p.hover, p.hoverPath) || '');
      setCategoryId(p.categoryId || '');
      setIsVisible(p.isVisible !== false);
      const tags = Array.isArray(p.tags) ? p.tags : [];
      setSelectedTags(tags.filter((t) => availableTags.includes(t)));
      setCustomTags(tags.filter((t) => !availableTags.includes(t)).join(', '));

      const g = Array.isArray(p.genders) ? p.genders.filter((x) => x === 'men' || x === 'women') : [];
      setGenders(g);

      if (g.length > 0) {
        const menQ = Array.isArray(p.sizeQuantities?.men) ? p.sizeQuantities.men : (Array.isArray(p.sizes?.men) ? p.sizes.men.map((s) => ({ size: String(s), quantity: 0 })) : []);
        const womenQ = Array.isArray(p.sizeQuantities?.women) ? p.sizeQuantities.women : (Array.isArray(p.sizes?.women) ? p.sizes.women.map((s) => ({ size: String(s), quantity: 0 })) : []);
        setSizesMen(menQ.length ? menQ : [{ size: '', quantity: 0 }]);
        setSizesWomen(womenQ.length ? womenQ : [{ size: '', quantity: 0 }]);
      } else {
        const s = Array.isArray(p.sizes) ? p.sizes : [];
        const normalized = s.length && typeof s[0] === 'object' ? s : s.map((x) => ({ size: String(x), quantity: 0 }));
        setSizesList(normalized.length ? normalized : [{ size: '', quantity: 0 }]);
      }
      setLoading(false);
    };
    load();
  }, [id, navigate, availableTags]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Compute final arrays: keep non-removed current, plus uploaded new
    const keep = currentImages.filter(ci => !removedPaths.has(ci.path || `url:${ci.url}`));
    const uploadedNew = newImages.length ? await uploadProductImages(newImages) : [];
    const finalPairs = [
      ...keep,
      ...uploadedNew.map(u => ({ url: u.publicUrl, path: u.path })),
    ];
    const nextImageUrlsArr = finalPairs.map(x => x.url).filter(Boolean);
    const nextImagePathsArr = finalPairs.map(x => x.path).filter(Boolean);
    const keyOf = (pair) => pair.path || `url:${pair.url}`;
    const keepMap = Object.fromEntries(keep.map(p => [keyOf(p), p]));
    const resolveSel = (k) => {
      if (!k) return null;
      if (k.startsWith('new:')) {
        const idx = parseInt(k.split(':')[1]);
        if (Number.isFinite(idx) && idx >= 0 && idx < uploadedNew.length) return { url: uploadedNew[idx].publicUrl, path: uploadedNew[idx].path };
        return null;
      }
      return keepMap[k] || null;
    };
    const selCover = resolveSel(coverKey);
    const selHover = resolveSel(hoverKey);
    const nextImageUrl = (selCover?.url) || nextImageUrlsArr[0] || null;
    const nextImagePath = (selCover?.path) || nextImagePathsArr[0] || null;

    const normalizedPredef = selectedTags;
    const normalizedCustom = customTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const tags = Array.from(new Set([...normalizedPredef, ...normalizedCustom]));

    const selectedGenders = (genders || []).filter((g) => g === 'men' || g === 'women');
    const menList = sizesMen
      .map((s) => ({ size: String(s.size).trim(), quantity: Number(s.quantity) || 0 }))
      .filter((s) => s.size);
    const womenList = sizesWomen
      .map((s) => ({ size: String(s.size).trim(), quantity: Number(s.quantity) || 0 }))
      .filter((s) => s.size);
    const genericSizes = sizesList
      .map((s) => ({ size: String(s.size).trim(), quantity: Number(s.quantity) || 0 }))
      .filter((s) => s.size);

    const totalQty = selectedGenders.length > 0
      ? selectedGenders.reduce((sum, g) => sum + (g === 'men' ? menList : womenList).reduce((acc, s) => acc + (s.quantity || 0), 0), 0)
      : genericSizes.reduce((sum, s) => sum + (s.quantity || 0), 0);

    const docData = {
      name,
      description,
      price: parseFloat(price),
      categoryId: categoryId || null,
      categoryName: categories.find((c) => c.id === categoryId)?.name || null,
      tags,
      quantity: Number.isFinite(totalQty) && totalQty > 0 ? totalQty : parseInt(quantity) || 0,
      isVisible,
      imageUrl: nextImageUrl || null,
      imagePath: nextImagePath || null,
      images: nextImageUrlsArr,
      imagePaths: nextImagePathsArr,
      hover: selHover?.url || null,
      hoverPath: selHover?.path || null,
    };

    if (selectedGenders.length > 0) {
      docData.genders = selectedGenders;
      docData.sizes = Object.fromEntries(
        selectedGenders.map((g) => [g, (g === 'men' ? menList : womenList).map((x) => x.size)])
      );
      docData.sizeQuantities = Object.fromEntries(
        selectedGenders.map((g) => [g, (g === 'men' ? menList : womenList)])
      );
    } else {
      docData.sizes = genericSizes;
      docData.sizeQuantities = deleteField();
      docData.genders = deleteField();
    }

    await updateProduct(id, docData);
    // After updating doc, remove any deleted images from storage
    for (const p of Array.from(removedPaths)) {
      // Skip if it's a url-only marker
      if (p && !String(p).startsWith('url:')) {
        try { await removeProductImage(p); } catch (_) {}
      }
    }
    navigate('/products');
  };

  if (loading) return (<div className="toolbar"><h1>Loading…</h1></div>);

  return (
    <div>
      <div className="toolbar">
        <h1>Edit Product</h1>
      </div>
      <form className="form" onSubmit={handleSubmit}>
        <div className="form-row">
          <label className="label">Name</label>
          <input className="input" type="text" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="form-row">
          <label className="label">Description</label>
          <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="form-row">
          <label className="label">Price</label>
          <input className="input" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div className="form-row">
          <label className="label">Category</label>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="select" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Select category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <span>or</span>
            <input className="input"
              type="text"
              placeholder="New category (not created here)"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              disabled
              title="Create categories from the Categories page"
            />
          </div>
        </div>

        {/* Genders */}
        <div className="form-row">
          <label className="label">Genders</label>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            {['men','women'].map((g) => (
              <label key={g} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={genders.includes(g)}
                  onChange={(e) => setGenders((prev) => e.target.checked ? [...prev, g] : prev.filter((x) => x !== g))}
                />
                <span style={{ textTransform: 'capitalize' }}>{g}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-row">
          <label className="label">Tags</label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
            {availableTags.map((t) => (
              <label key={t} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={selectedTags.includes(t)}
                  onChange={(e) =>
                    setSelectedTags((prev) =>
                      e.target.checked ? [...prev, t] : prev.filter((x) => x !== t)
                    )
                  }
                />
                <span style={{ textTransform: 'capitalize' }}>{t.replace('-', ' ')}</span>
              </label>
            ))}
          </div>
          <div style={{ marginTop: 8 }}>
            <input className="input"
              type="text"
              placeholder="Custom tags (comma-separated)"
              value={customTags}
              onChange={(e) => setCustomTags(e.target.value)}
            />
          </div>
        </div>

        {genders.includes('men') && (
          <div className="form-row">
            <label className="label">Sizes & quantities — Men</label>
            {sizesMen.map((row, idx) => (
              <div key={`m-${idx}`} style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input className="input"
                  type="text"
                  placeholder="Size (e.g., 6, 7, 8)"
                  value={row.size}
                  onChange={(e) =>
                    setSizesMen((prev) => prev.map((r, i) => (i === idx ? { ...r, size: e.target.value } : r)))
                  }
                />
                <input className="input"
                  type="number"
                  placeholder="Qty"
                  value={row.quantity}
                  onChange={(e) =>
                    setSizesMen((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))
                  }
                />
                <button type="button" onClick={() => setSizesMen((prev) => prev.filter((_, i) => i !== idx))}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" style={{ marginTop: 6 }} onClick={() => setSizesMen((prev) => [...prev, { size: '', quantity: 0 }])}>
              + Add size (Men)
            </button>
          </div>
        )}

        {genders.includes('women') && (
          <div className="form-row">
            <label className="label">Sizes & quantities — Women</label>
            {sizesWomen.map((row, idx) => (
              <div key={`w-${idx}`} style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input className="input"
                  type="text"
                  placeholder="Size (e.g., 4, 5, 6)"
                  value={row.size}
                  onChange={(e) =>
                    setSizesWomen((prev) => prev.map((r, i) => (i === idx ? { ...r, size: e.target.value } : r)))
                  }
                />
                <input className="input"
                  type="number"
                  placeholder="Qty"
                  value={row.quantity}
                  onChange={(e) =>
                    setSizesWomen((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))
                  }
                />
                <button type="button" onClick={() => setSizesWomen((prev) => prev.filter((_, i) => i !== idx))}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" style={{ marginTop: 6 }} onClick={() => setSizesWomen((prev) => [...prev, { size: '', quantity: 0 }])}>
              + Add size (Women)
            </button>
          </div>
        )}

        {!genders.includes('men') && !genders.includes('women') && (
          <div className="form-row">
            <label className="label">Sizes & quantities</label>
            {sizesList.map((row, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input className="input"
                  type="text"
                  placeholder="Size (e.g., S, M, 42)"
                  value={row.size}
                  onChange={(e) =>
                    setSizesList((prev) => prev.map((r, i) => (i === idx ? { ...r, size: e.target.value } : r)))
                  }
                />
                <input className="input"
                  type="number"
                  placeholder="Qty"
                  value={row.quantity}
                  onChange={(e) =>
                    setSizesList((prev) => prev.map((r, i) => (i === idx ? { ...r, quantity: e.target.value } : r)))
                  }
                />
                <button type="button" onClick={() => setSizesList((prev) => prev.filter((_, i) => i !== idx))}>
                  Remove
                </button>
              </div>
            ))}
            <button type="button" style={{ marginTop: 6 }} onClick={() => setSizesList((prev) => [...prev, { size: '', quantity: 0 }])}>
              + Add size
            </button>
          </div>
        )}

        <div className="form-row">
          <label className="label">Fallback total quantity (optional)</label>
          <input className="input" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        </div>

        <div className="form-row">
          <label className="label">
            <input type="checkbox" checked={isVisible} onChange={(e) => setIsVisible(e.target.checked)} /> Visible
          </label>
        </div>

        <div className="form-row">
          <label className="label">Images</label>
          {currentImages.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8, width: '100%' }}>
              {currentImages.map((ci, idx) => {
                const key = ci.path || `url:${ci.url}`;
                const isRemoved = removedPaths.has(key);
                return (
                  <div key={key || idx} style={{ position: 'relative', border: '1px solid #eee', borderRadius: 8, overflow: 'hidden', opacity: isRemoved ? 0.45 : 1 }}>
                    {ci.url ? (
                      <img alt={`image-${idx}`} src={ci.url} style={{ width: '100%', height: 120, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ width: '100%', height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>No preview</div>
                    )}
                    <button
                      type="button"
                      onClick={() => setRemovedPaths(prev => {
                        const next = new Set(prev);
                        if (next.has(key)) next.delete(key); else next.add(key);
                        return next;
                      })}
                      style={{ position: 'absolute', top: 6, right: 6, padding: '4px 8px' }}
                    >{isRemoved ? 'Undo' : 'Remove'}</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ color: '#666' }}>No images yet</div>
          )}
        </div>

        <div className="form-row">
          <label className="label">Add Images</label>
          <input className="input" type="file" multiple onChange={(e) => setNewImages(Array.from(e.target.files || []))} />
          <div style={{ fontSize: 12, color: '#666', marginTop: 6 }}>Selected: {newImages.length}</div>
        </div>

        <div className="form-row">
          <label className="label">Main Display & Hover</label>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 12, marginBottom: 6 }}>Main display image</div>
              <select className="select" value={coverKey} onChange={(e) => setCoverKey(e.target.value)}>
                {currentImages.map((ci, i) => (
                  <option key={ci.path || `url:${ci.url}`} value={ci.path || `url:${ci.url}`}>{`Current ${i + 1}`}</option>
                ))}
                {newImages.map((f, i) => (
                  <option key={`new:${i}`} value={`new:${i}`}>{`New ${i + 1}${f?.name ? ` — ${f.name}` : ''}`}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, marginBottom: 6 }}>Hover image (optional)</div>
              <select className="select" value={hoverKey} onChange={(e) => setHoverKey(e.target.value)}>
                <option value="">None</option>
                {currentImages.map((ci, i) => (
                  <option key={ci.path || `url:${ci.url}`} value={ci.path || `url:${ci.url}`}>{`Current ${i + 1}`}</option>
                ))}
                {newImages.map((f, i) => (
                  <option key={`new:${i}`} value={`new:${i}`}>{`New ${i + 1}${f?.name ? ` — ${f.name}` : ''}`}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <button className="primary" type="submit">Update Product</button>
      </form>
    </div>
  );
};

export default EditProduct;
