/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Product, StoreConfig, Invoice, StaffUser } from './types';
import { INITIAL_PRODUCTS, INITIAL_STORE_CONFIG } from './data';
import {
  fetchProducts, insertProduct, updateProduct as dbUpdateProduct,
  deleteProduct as dbDeleteProduct,
  fetchInvoices, insertInvoice,
  fetchStoreConfig, saveStoreConfig,
} from './lib/db';
import { getCurrentUser, logout } from './lib/auth';
import Checkout from './components/Checkout';
import Inventory from './components/Inventory';
import Reports from './components/Reports';
import Settings from './components/Settings';
import Data from './components/Data';
import Login from './components/Login';
import InvoicePrint from './components/InvoicePrint';
import {
  ShoppingCart, Box, BarChart3, Settings as SettingsIcon,
  Clock, Store, Printer, LogOut, User, Database
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [products, setProducts] = useState<Product[]>([]);
  const [storeConfig, setStoreConfig] = useState<StoreConfig>(INITIAL_STORE_CONFIG);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [activeTab, setActiveTab] = useState<'checkout' | 'inventory' | 'data' | 'reports' | 'settings'>('checkout');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [selectedReprintInvoice, setSelectedReprintInvoice] = useState<Invoice | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Check existing session on mount
  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);
    setAuthChecked(true);
  }, []);

  // Load data from Supabase when logged in
  useEffect(() => {
    if (!currentUser) return;

    async function loadData() {
      const url = import.meta.env.VITE_SUPABASE_URL;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      if (!url || !key || url === 'https://placeholder.supabase.co') {
        setLoadError('Thiếu cấu hình Supabase. Hãy thêm VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY vào Vercel → Settings → Environment Variables rồi Redeploy.');
        setIsLoading(false);
        return;
      }

      try {
        const [dbProducts, dbConfig, dbInvoices] = await Promise.all([
          fetchProducts(),
          fetchStoreConfig(),
          fetchInvoices(),
        ]);

        if (dbProducts.length === 0) {
          for (const p of INITIAL_PRODUCTS) {
            await insertProduct(p);
          }
          setProducts(INITIAL_PRODUCTS);
        } else {
          setProducts(dbProducts);
        }

        if (dbConfig) {
          setStoreConfig(dbConfig);
        } else {
          await saveStoreConfig(INITIAL_STORE_CONFIG);
        }

        setInvoices(dbInvoices);
      } catch (err: any) {
        console.error('Supabase error:', err);
        setLoadError('Không thể kết nối database. Kiểm tra lại biến môi trường VITE_SUPABASE_URL và VITE_SUPABASE_ANON_KEY.');
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [currentUser]);

  // Real-time clock
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // When user logs in, reset to checkout tab
  const handleLogin = (user: StaffUser) => {
    setCurrentUser(user);
    setIsLoading(true);
    setLoadError('');
    // Reset to checkout; if sales employee, only checkout/reports available
    setActiveTab('checkout');
  };

  const handleLogout = () => {
    logout();
    setCurrentUser(null);
    setProducts([]);
    setInvoices([]);
    setIsLoading(true);
    setLoadError('');
  };

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAddProduct = async (newProd: Product) => {
    await insertProduct(newProd);
    setProducts(prev => [...prev, newProd]);
  };

  const handleUpdateProduct = async (updatedProd: Product) => {
    await dbUpdateProduct(updatedProd);
    setProducts(prev => prev.map(p => p.id === updatedProd.id ? updatedProd : p));
  };

  const handleDeleteProduct = async (id: string) => {
    await dbDeleteProduct(id);
    setProducts(prev => prev.filter(p => p.id !== id));
  };

  const handleRestockProduct = async (id: string, amount: number) => {
    const product = products.find(p => p.id === id);
    if (!product) return;
    const updated = { ...product, stock: product.stock + amount };
    await dbUpdateProduct(updated);
    setProducts(prev => prev.map(p => p.id === id ? updated : p));
  };

  const handleAddInvoice = async (newInvoice: Invoice) => {
    // Deduct stock — allow negative (no Math.max clamp)
    for (const item of newInvoice.items) {
      const product = products.find(p => p.id === item.product.id);
      if (product) {
        await dbUpdateProduct({ ...product, stock: product.stock - item.quantity });
      }
    }
    await insertInvoice(newInvoice);

    setProducts(prev => prev.map(p => {
      const soldItem = newInvoice.items.find(it => it.product.id === p.id);
      if (soldItem) return { ...p, stock: p.stock - soldItem.quantity };
      return p;
    }));
    setInvoices(prev => [...prev, newInvoice]);
  };

  const handleSaveConfig = async (updatedConfig: StoreConfig) => {
    await saveStoreConfig(updatedConfig);
    setStoreConfig(updatedConfig);
  };

  const handleUpdateProductsStock = async (updates: { id: string; delta: number }[]) => {
    for (const u of updates) {
      const product = products.find(p => p.id === u.id);
      if (product) {
        await dbUpdateProduct({ ...product, stock: product.stock + u.delta });
      }
    }
    setProducts(prev => prev.map(p => {
      const u = updates.find(x => x.id === p.id);
      return u ? { ...p, stock: p.stock + u.delta } : p;
    }));
  };

  const lowStockCount = products.filter(p => p.stock <= p.minStock).length;
  const isManager = currentUser?.role === 'manager';

  // ── Auth check ──────────────────────────────────────────────────────────────

  if (!authChecked) return null;

  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  // ── Loading / Error screens ─────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-600 font-semibold">Đang kết nối dữ liệu...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md w-full text-center">
          <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-rose-500 text-2xl">!</span>
          </div>
          <h2 className="font-bold text-slate-800 mb-2">Lỗi kết nối</h2>
          <p className="text-sm text-slate-500">{loadError}</p>
        </div>
      </div>
    );
  }

  // ── Main UI ─────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 font-sans flex flex-col justify-between antialiased">
      {/* Header Navigation Bar */}
      <header className="bg-white border-b border-slate-200 shadow-xs select-none sticky top-0 z-40 transition-all duration-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Logo Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-xs">
              MT
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-lg font-extrabold tracking-tight leading-none text-slate-800">VietPOS</h1>
                <span className="text-[9px] bg-blue-600 h-max text-white font-extrabold px-1.5 py-0.5 rounded-sm shrink-0 tracking-wider">CHUYÊN NGHIỆP</span>
              </div>
              <p className="text-[11px] font-mono text-slate-500 font-medium tracking-tight mt-1 flex items-center gap-1">
                <Store className="w-3.5 h-3.5 shrink-0 text-slate-400" /> {storeConfig.name}
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="flex items-center w-full sm:w-auto overflow-x-auto gap-1 sm:gap-2">
            <button
              onClick={() => setActiveTab('checkout')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                activeTab === 'checkout'
                  ? 'text-blue-600 border-b-2 border-blue-600 rounded-none'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg'
              }`}
            >
              <ShoppingCart className="w-3.5 h-3.5" /> Bán hàng
            </button>

            {isManager && (
              <button
                onClick={() => setActiveTab('inventory')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold whitespace-nowrap transition-all duration-150 relative cursor-pointer ${
                  activeTab === 'inventory'
                    ? 'text-blue-600 border-b-2 border-blue-600 rounded-none'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg'
                }`}
              >
                <Box className="w-3.5 h-3.5" /> Kho hàng
                {lowStockCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-rose-500 border-2 border-white text-white text-[9px] font-bold w-5 h-5 rounded-full flex items-center justify-center">
                    {lowStockCount}
                  </span>
                )}
              </button>
            )}

            {isManager && (
              <button
                onClick={() => setActiveTab('data')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                  activeTab === 'data'
                    ? 'text-blue-600 border-b-2 border-blue-600 rounded-none'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg'
                }`}
              >
                <Database className="w-3.5 h-3.5" /> Dữ liệu
              </button>
            )}

            <button
              onClick={() => setActiveTab('reports')}
              className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                activeTab === 'reports'
                  ? 'text-blue-600 border-b-2 border-blue-600 rounded-none'
                  : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" /> Báo cáo
            </button>

            {isManager && (
              <button
                onClick={() => setActiveTab('settings')}
                className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 text-xs font-bold whitespace-nowrap transition-all duration-150 cursor-pointer ${
                  activeTab === 'settings'
                    ? 'text-blue-600 border-b-2 border-blue-600 rounded-none'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-lg'
                }`}
              >
                <SettingsIcon className="w-3.5 h-3.5" /> Thiết lập
              </button>
            )}
          </nav>

          {/* Right: Clock + User info */}
          <div className="hidden md:flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-mono font-medium text-slate-500 bg-slate-50 border border-slate-200 p-2 rounded-xl">
              <Clock className="w-4 h-4 text-blue-500" />
              <span>{currentTime.toLocaleDateString('vi-VN')} {currentTime.toLocaleTimeString('vi-VN')}</span>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-2 rounded-xl">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold ${isManager ? 'bg-blue-600' : 'bg-emerald-600'}`}>
                <User className="w-3.5 h-3.5" />
              </div>
              <div className="text-left">
                <p className="text-xs font-bold text-slate-700 leading-none">{currentUser.displayName}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{isManager ? 'Quản lý' : 'Nhân viên'}</p>
              </div>
              <button
                onClick={handleLogout}
                title="Đăng xuất"
                className="ml-1 text-slate-400 hover:text-rose-600 transition cursor-pointer"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 z-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.15 }}
            className="w-full h-full"
          >
            {activeTab === 'checkout' && (
              <Checkout
                products={products.filter(p => !p.hidden)}
                storeConfig={storeConfig}
                onAddInvoice={handleAddInvoice}
                onSelectInvoiceForReprint={setSelectedReprintInvoice}
              />
            )}
            {activeTab === 'inventory' && isManager && (
              <Inventory
                products={products}
                onAddProduct={handleAddProduct}
                onUpdateProduct={handleUpdateProduct}
                onDeleteProduct={handleDeleteProduct}
                onRestockProduct={handleRestockProduct}
              />
            )}
            {activeTab === 'data' && isManager && (
              <Data
                invoices={invoices}
                products={products}
                onUpdateProductsStock={handleUpdateProductsStock}
              />
            )}
            {activeTab === 'reports' && (
              <Reports
                invoices={invoices}
                products={products}
                isManager={isManager}
                onSelectInvoiceForReprint={setSelectedReprintInvoice}
              />
            )}
            {activeTab === 'settings' && isManager && (
              <Settings
                config={storeConfig}
                onSaveConfig={handleSaveConfig}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 select-none">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-500 font-medium">
          <p>© 2026 VietPOS POS System. Hỗ trợ in hóa đơn K80 và liên thông mã quét VietQR thuận tiện.</p>
        </div>
      </footer>

      {/* Invoice Print Modal */}
      <AnimatePresence>
        {selectedReprintInvoice && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-stone-50 rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-stone-200 flex items-center justify-between bg-white text-stone-850">
                <div className="flex items-center gap-1.5">
                  <Printer className="w-5 h-5 text-blue-600" />
                  <h3 className="font-bold text-xs sm:text-sm tracking-tight">Kính xem hóa đơn mẫu K80</h3>
                </div>
                <button
                  onClick={() => setSelectedReprintInvoice(null)}
                  className="text-stone-400 hover:text-stone-800 font-bold p-1 cursor-pointer text-sm"
                >
                  ✕
                </button>
              </div>

              <div className="p-5 flex justify-center bg-stone-100 overflow-y-auto max-h-[60vh]">
                <div id="print-area" className="bg-white border border-stone-200 shadow-sm p-4 rounded-lg">
                  <InvoicePrint
                    invoice={selectedReprintInvoice}
                    config={storeConfig}
                  />
                </div>
              </div>

              <div className="p-4 bg-white border-t border-stone-200 flex justify-end gap-3.5">
                <button
                  type="button"
                  onClick={() => setSelectedReprintInvoice(null)}
                  className="px-4 py-2 border border-stone-300 hover:bg-stone-55 text-stone-600 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  Đóng cửa sổ
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Printer className="w-4 h-4" /> IN HÓA ĐƠN NGAY
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
