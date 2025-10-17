import React, { useEffect, useState } from 'react';
import { collection, getDocs, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { uploadProductImages } from '../lib/storage';
import { saveProduct } from '../lib/products';
import { useNavigate } from 'react-router-dom';

const AddProduct = () => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [sizes, setSizes] = useState('');
  const [quantity, setQuantity] = useState('');
  const [images, setImages] = useState([]);
  const [coverIndex, setCoverIndex] = useState(0);
  const [hoverIndex, setHoverIndex] = useState(-1);
  const [categories, setCategories] = useState([]);
  const [categoryId, setCategoryId] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [isVisible, setIsVisible] = useState(true);
  const [availableTags] = useState(['trending', 'bestseller', 'new-arrival', 'featured']);
  const [selectedTags, setSelectedTags] = useState([]);
  const [customTags, setCustomTags] = useState('');
  // New: genders and per-gender size tables
  const [genders, setGenders] = useState(['men', 'women']);
  const [sizesMen, setSizesMen] = useState([{ size: '', quantity: 0 }]);
  const [sizesWomen, setSizesWomen] = useState([{ size: '', quantity: 0 }]);
  const [sizesList, setSizesList] = useState([{ size: '', quantity: 0 }]);
  const navigate = useNavigate();

  useEffect(() => {
    const loadCategories = async () => {
      const snap = await getDocs(collection(db, 'categories'));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setCategories(list);
    };
    loadCategories();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!Array.isArray(images) || images.length === 0) {
      console.error('Please select at least one image');
      return;
    }

    // Upload images to Supabase (helper)
    const uploaded = await uploadProductImages(images);
    const imagePaths = uploaded.map(u => u.path);
    const imageUrls = uploaded.map(u => u.publicUrl);

    // Resolve cover and hover selections by index
    const coverIdx = Number.isInteger(coverIndex) && coverIndex >= 0 && coverIndex < uploaded.length ? coverIndex : 0;
    const hoverIdx = Number.isInteger(hoverIndex) && hoverIndex >= 0 && hoverIndex < uploaded.length ? hoverIndex : -1;
    const cover = uploaded[coverIdx] || uploaded[0];
    const hov = hoverIdx >= 0 ? uploaded[hoverIdx] : null;

    // Create category on the fly if provided
    let category = categories.find((c) => c.id === categoryId) || null;
    if (!category && newCategory.trim()) {
      const ref = await addDoc(collection(db, 'categories'), {
        name: newCategory.trim(),
        slug: newCategory.trim().toLowerCase().replace(/\s+/g, '-'),
        isActive: true,
        createdAt: new Date(),
      });
      category = { id: ref.id, name: newCategory.trim() };
    }

    // Merge tags
    const normalizedPredef = selectedTags;
    const normalizedCustom = customTags
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const tags = Array.from(new Set([...normalizedPredef, ...normalizedCustom]));

    // Normalize sizes
    const genericSizes = sizesList
      .map((s) => ({ size: String(s.size).trim(), quantity: Number(s.quantity) || 0 }))
      .filter((s) => s.size);

    const selectedGenders = (genders || []).filter((g) => g === 'men' || g === 'women');
    const menList = sizesMen
      .map((s) => ({ size: String(s.size).trim(), quantity: Number(s.quantity) || 0 }))
      .filter((s) => s.size);
    const womenList = sizesWomen
      .map((s) => ({ size: String(s.size).trim(), quantity: Number(s.quantity) || 0 }))
      .filter((s) => s.size);

    const totalQty = selectedGenders.length > 0
      ? selectedGenders.reduce((sum, g) => sum + (g === 'men' ? menList : womenList).reduce((acc, s) => acc + (s.quantity || 0), 0), 0)
      : genericSizes.reduce((sum, s) => sum + (s.quantity || 0), 0);

    // Prepare doc
    const doc = {
      name,
      description,
      price: parseFloat(price),
      categoryId: category?.id || null,
      categoryName: category?.name || null,
      tags,
      quantity: Number.isFinite(totalQty) && totalQty > 0 ? totalQty : parseInt(quantity) || 0,
      isVisible,
      // Back-compat: set single image fields to the selected cover image
      imageUrl: cover?.publicUrl || null,
      imagePath: cover?.path || null,
      // Optional hover image for homepage/product cards
      hover: hov?.publicUrl || null,
      hoverPath: hov?.path || null,
      // New fields: store all images
      images: imageUrls,
      imagePaths,
    };

    if (selectedGenders.length > 0) {
      doc.genders = selectedGenders;
      doc.sizes = Object.fromEntries(
        selectedGenders.map((g) => [g, (g === 'men' ? menList : womenList).map((x) => x.size)])
      );
      doc.sizeQuantities = Object.fromEntries(
        selectedGenders.map((g) => [g, (g === 'men' ? menList : womenList)])
      );
    } else {
      doc.sizes = genericSizes;
    }

    // Add product to Firestore (helper)
    await saveProduct(doc);

    navigate('/products');
  };

  return (
    <div>
      <div className="toolbar">
        <h1>Add Product</h1>
      </div>
      <pre style={{ background: '#f6f8fa', padding: 8 }}>
        {`Supabase URL: ${import.meta.env.VITE_SUPABASE_URL || '(missing)'}\nSupabase key length: ${(import.meta.env.VITE_SUPABASE_ANON_KEY || '').length}`}
      </pre>
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
              placeholder="New category"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
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

        {/* Per-gender sizes if any gender selected; otherwise generic */}
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
          <input
            className="input"
            type="file"
            multiple
            onChange={(e) => {
              const list = Array.from(e.target.files || []);
              setImages(list);
              // Set sensible defaults
              setCoverIndex(0);
              setHoverIndex(list.length > 1 ? 1 : -1);
            }}
          />
        </div>
        {images.length > 0 && (
          <div className="form-row">
            <label className="label">Main Display & Hover</label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 12, marginBottom: 6 }}>Main display image</div>
                <select className="select" value={coverIndex}
                  onChange={(e) => setCoverIndex(parseInt(e.target.value))}>
                  {images.map((f, i) => (
                    <option key={i} value={i}>{`Image ${i + 1}${f?.name ? ` — ${f.name}` : ''}`}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 12, marginBottom: 6 }}>Hover image (optional)</div>
                <select className="select" value={hoverIndex}
                  onChange={(e) => setHoverIndex(parseInt(e.target.value))}>
                  <option value={-1}>None</option>
                  {images.map((f, i) => (
                    <option key={i} value={i}>{`Image ${i + 1}${f?.name ? ` — ${f.name}` : ''}`}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}
        <button className="primary" type="submit">Add Product</button>
      </form>
    </div>
  );
};

export default AddProduct;
