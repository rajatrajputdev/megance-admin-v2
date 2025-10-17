import React, { useEffect, useState } from 'react';
import { db } from '../firebase/config';
import { addDoc, collection, getDocs, serverTimestamp } from 'firebase/firestore';

const Categories = () => {
  const [name, setName] = useState('');
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const snap = await getDocs(collection(db, 'categories'));
    setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const addCategory = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    await addDoc(collection(db, 'categories'), {
      name: name.trim(),
      slug: name.trim().toLowerCase().replace(/\s+/g, '-'),
      isActive: true,
      createdAt: serverTimestamp(),
    });
    setName('');
    await load();
  };

  return (
    <div>
      <h1>Categories</h1>
      <form onSubmit={addCategory} style={{ marginBottom: 16 }}>
        <input
          type="text"
          placeholder="New category name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ padding: 8, marginRight: 8 }}
        />
        <button type="submit">Add</button>
      </form>

      {loading ? (
        <p>Loading...</p>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
          {categories.map((c) => (
            <div key={c.id} style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong>{c.name}</strong>
                <span style={{ fontSize: 12, color: c.isActive ? 'green' : 'red' }}>
                  {c.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>Slug: {c.slug}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Categories;

