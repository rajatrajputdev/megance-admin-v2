import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import AuthGate from './components/AuthGate';
import Dashboard from './pages/Dashboard';
import Products from './pages/Products';
import AddProduct from './pages/AddProduct';
import EditProduct from './pages/EditProduct';
import Categories from './pages/Categories';
import Stock from './pages/Stock';
import Orders from './pages/Orders';
import Coupons from './pages/Coupons';
import Newsletter from './pages/Newsletter';
import UserStats from './pages/UserStats';
import Refunds from './pages/Refunds';

function App() {
  return (
    <Router>
      <AuthGate>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/products" element={<Products />} />
            <Route path="/add-product" element={<AddProduct />} />
            <Route path="/edit-product/:id" element={<EditProduct />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/stock" element={<Stock />} />
            <Route path="/orders" element={<Orders />} />
            <Route path="/refunds" element={<Refunds />} />
            <Route path="/coupons" element={<Coupons />} />
            <Route path="/newsletter" element={<Newsletter />} />
            <Route path="/user-stats" element={<UserStats />} />
          </Routes>
        </Layout>
      </AuthGate>
    </Router>
  );
}

export default App;
