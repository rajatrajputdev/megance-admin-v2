import React from 'react';
import { Link } from 'react-router-dom';

const Sidebar = () => {
  const [open, setOpen] = React.useState({
    catalog: true,
    sales: true,
    analytics: true,
    marketing: false,
  });

  const toggle = (key) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <aside className="sidebar">
      <h2>Admin</h2>
      <ul style={{ display: 'grid', gap: 6 }}>
        <li><Link to="/">Dashboard</Link></li>

        <li className="sidebar-group">
          <button className="sidebar-group-header" onClick={() => toggle('catalog')}>
            <span className="chev" aria-hidden>{open.catalog ? '▾' : '▸'}</span>
            <span>Catalog</span>
          </button>
          {open.catalog && (
            <ul className="sidebar-sub">
              <li><Link to="/products">Products</Link></li>
              <li><Link to="/add-product">Add Product</Link></li>
              <li><Link to="/categories">Categories</Link></li>
              <li><Link to="/stock">Stock</Link></li>
            </ul>
          )}
        </li>

        <li className="sidebar-group">
          <button className="sidebar-group-header" onClick={() => toggle('sales')}>
            <span className="chev" aria-hidden>{open.sales ? '▾' : '▸'}</span>
            <span>Sales</span>
          </button>
          {open.sales && (
            <ul className="sidebar-sub">
              <li><Link to="/orders">Orders</Link></li>
              <li><Link to="/refunds">Refunds</Link></li>
              <li><Link to="/coupons">Coupons</Link></li>
            </ul>
          )}
        </li>

        <li className="sidebar-group">
          <button className="sidebar-group-header" onClick={() => toggle('analytics')}>
            <span className="chev" aria-hidden>{open.analytics ? '▾' : '▸'}</span>
            <span>Analytics</span>
          </button>
          {open.analytics && (
            <ul className="sidebar-sub">
              <li><Link to="/user-stats">User Stats</Link></li>
            </ul>
          )}
        </li>

        <li className="sidebar-group">
          <button className="sidebar-group-header" onClick={() => toggle('marketing')}>
            <span className="chev" aria-hidden>{open.marketing ? '▾' : '▸'}</span>
            <span>Marketing</span>
          </button>
          {open.marketing && (
            <ul className="sidebar-sub">
              <li><Link to="/newsletter">Newsletter</Link></li>
            </ul>
          )}
        </li>
      </ul>
    </aside>
  );
};

export default Sidebar;
