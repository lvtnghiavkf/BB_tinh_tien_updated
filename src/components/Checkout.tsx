/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Product, CartItem, PaymentMethod, Invoice, StoreConfig } from '../types';
import {
  Search, ShoppingCart, Trash2, Plus, Minus, CreditCard, DollarSign,
  QrCode, User, Phone, CheckCircle2, SlidersHorizontal, Calculator,
  Printer, Coins, X, Scan, Tag
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CheckoutProps {
  products: Product[];
  storeConfig: StoreConfig;
  onAddInvoice: (invoice: Invoice) => void;
  onSelectInvoiceForReprint: (invoice: Invoice) => void;
}

export default function Checkout({
  products,
  storeConfig,
  onAddInvoice,
  onSelectInvoiceForReprint
}: CheckoutProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [cart, setCart] = useState<CartItem[]>([]);

  // Barcode scanner state
  const [barcodeInput, setBarcodeInput] = useState('');
  const [barcodeMsg, setBarcodeMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const barcodeMsgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Invoice form states
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [discountMode, setDiscountMode] = useState<'percent' | 'fixed'>('percent');
  const [discountPercent, setDiscountPercent] = useState<number>(0);
  const [discountFixed, setDiscountFixed] = useState<number>(0);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');

  // Cash calculation
  const [cashGiven, setCashGiven] = useState<number>(0);

  const categories = Array.from(new Set(products.map((p) => p.category)));

  const formatVND = (value: number) => value.toLocaleString('vi-VN') + ' ₫';

  const isWeightUnit = (unit: string) =>
    /^(kg|g|gram|gam|lít|lit|liter|litre|ml|l)$/i.test(unit.trim());

  const formatQty = (qty: number) =>
    Number.isInteger(qty) ? String(qty) : qty.toLocaleString('vi-VN', { maximumFractionDigits: 3 });

  // ── Barcode scanner ──────────────────────────────────────────────────────────

  const showBarcodeMsg = useCallback((text: string, ok: boolean) => {
    if (barcodeMsgTimer.current) clearTimeout(barcodeMsgTimer.current);
    setBarcodeMsg({ text, ok });
    barcodeMsgTimer.current = setTimeout(() => setBarcodeMsg(null), 2500);
  }, []);

  const handleBarcodeSubmit = useCallback(() => {
    const code = barcodeInput.trim();
    if (!code) return;
    setBarcodeInput('');

    const product = products.find(
      (p) => p.sku.toLowerCase() === code.toLowerCase() ||
             p.name.toLowerCase() === code.toLowerCase()
    );

    if (!product) {
      showBarcodeMsg(`Không tìm thấy mã: "${code}"`, false);
      return;
    }

    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        showBarcodeMsg(`+1 "${product.name}" (x${existing.quantity + 1})`, true);
        return prev.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      showBarcodeMsg(`Đã thêm: "${product.name}"`, true);
      return [...prev, { product, quantity: 1 }];
    });
  }, [barcodeInput, products, showBarcodeMsg]);

  const handleBarcodeKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBarcodeSubmit();
    }
  };

  // ── Product filtering ────────────────────────────────────────────────────────

  const availableProducts = products.filter((p) => {
    const matchSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        p.sku.toLowerCase().includes(searchTerm.toLowerCase());
    const matchCat = !selectedCategory || p.category === selectedCategory;
    return matchSearch && matchCat;
  });

  // ── Cart operations ─────────────────────────────────────────────────────────

  const addToCart = (product: Product) => {
    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.id === product.id);
      if (existing) {
        return prevCart.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      return [...prevCart, { product, quantity: 1 }];
    });
  };

  const updateCartQuantity = (productId: string, delta: number) => {
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.product.id !== productId) return item;
        const step = isWeightUnit(item.product.unit) ? 0.1 : 1;
        const newQty = Math.round((item.quantity + delta * step) * 1000) / 1000;
        if (newQty <= 0) return null;
        return { ...item, quantity: newQty };
      }).filter(Boolean) as CartItem[]
    );
  };

  const setCartQty = (productId: string, qty: number) => {
    const rounded = Math.round(qty * 1000) / 1000;
    if (rounded <= 0) { removeFromCart(productId); return; }
    setCart(prev => prev.map(item =>
      item.product.id === productId ? { ...item, quantity: rounded } : item
    ));
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const clearCart = () => {
    setCart([]);
    setCustomerName('');
    setCustomerPhone('');
    setDiscountPercent(0);
    setDiscountFixed(0);
    setDiscountMode('percent');
    setCashGiven(0);
  };

  // ── Financial summary ────────────────────────────────────────────────────────

  const subtotal = cart.reduce((acc, item) => acc + (item.product.sellingPrice * item.quantity), 0);

  const discountAmount = discountMode === 'percent'
    ? Math.round((subtotal * discountPercent) / 100)
    : Math.min(discountFixed, subtotal);

  const effectiveDiscountPercent = subtotal > 0
    ? Math.round((discountAmount / subtotal) * 100)
    : 0;

  const totalAmount = Math.max(0, subtotal - discountAmount);
  const changeDue = cashGiven > 0 ? Math.max(0, cashGiven - totalAmount) : 0;

  // ── Checkout ─────────────────────────────────────────────────────────────────

  const handleCheckout = (e: React.FormEvent) => {
    e.preventDefault();
    if (cart.length === 0) return;

    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const invoiceId = `HD-${randomSuffix}`;

    const newInvoice: Invoice = {
      id: invoiceId,
      timestamp: new Date().toISOString(),
      items: [...cart],
      totalAmount: subtotal,
      discountPercent: effectiveDiscountPercent,
      discountAmount,
      finalAmount: totalAmount,
      paymentMethod,
      customerName: customerName.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
    };

    onAddInvoice(newInvoice);
    onSelectInvoiceForReprint(newInvoice);
    clearCart();
  };

  const vietQrUrl = `https://img.vietqr.io/image/${storeConfig.bankId}-${storeConfig.bankAccount}-qr_only.png?amount=${totalAmount}&addInfo=${encodeURIComponent('HD Thanh Toan')}&accountName=${encodeURIComponent(storeConfig.bankAccountName)}`;
  const quickBills = [20000, 50000, 100000, 200000, 500000];
  const quickDiscountPct = [5, 10, 15, 20];
  const quickDiscountVND = [5000, 10000, 20000, 50000];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
      {/* LEFT COLUMN */}
      <div className="lg:col-span-7 flex flex-col space-y-4">

        {/* Barcode Scanner Input */}
        <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl space-y-2">
          <div className="flex items-center gap-2 text-blue-700 text-xs font-bold">
            <Scan className="w-4 h-4" /> QUÉT MÃ VẠCH SẢN PHẨM
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-blue-400 pointer-events-none">
                <Tag className="w-4 h-4" />
              </span>
              <input
                ref={barcodeRef}
                type="text"
                value={barcodeInput}
                onChange={(e) => setBarcodeInput(e.target.value)}
                onKeyDown={handleBarcodeKeyDown}
                placeholder="Quét mã vạch hoặc nhập SKU rồi nhấn Enter..."
                className="w-full pl-9 pr-3 py-2 border border-blue-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 text-sm font-medium text-slate-700 transition"
              />
            </div>
            <button
              type="button"
              onClick={handleBarcodeSubmit}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer shrink-0"
            >
              Thêm
            </button>
          </div>
          <AnimatePresence>
            {barcodeMsg && (
              <motion.p
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`text-xs font-semibold flex items-center gap-1.5 ${barcodeMsg.ok ? 'text-emerald-700' : 'text-rose-600'}`}
              >
                {barcodeMsg.ok
                  ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  : <X className="w-3.5 h-3.5 shrink-0" />}
                {barcodeMsg.text}
              </motion.p>
            )}
          </AnimatePresence>
        </div>

        {/* Product Search & Category Filters */}
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
              <Search className="w-5 h-5" />
            </span>
            <input
              type="text"
              placeholder="Tìm kiếm sản phẩm (Tên, Mã vạch, SKU)..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition text-sm font-medium text-slate-750"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer text-sm"
              >
                ✕
              </button>
            )}
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 scrollbar-thin">
            <button
              onClick={() => setSelectedCategory('')}
              className={`px-4 py-2 text-xs font-semibold rounded-full border transition whitespace-nowrap cursor-pointer ${
                !selectedCategory
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-slate-650 border-slate-200 hover:bg-slate-50'
              }`}
            >
              Tất cả danh mục
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-2 text-xs font-semibold rounded-full border transition whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-slate-655 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Products Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3.5 overflow-y-auto max-h-[480px] pr-1">
          {availableProducts.map((p) => {
            const inCartItem = cart.find((item) => item.product.id === p.id);
            const inCartQty = inCartItem?.quantity || 0;
            const isLowStock = p.stock > 0 && p.stock <= p.minStock;
            const isOutOfStock = p.stock === 0;
            const isNegativeStock = p.stock < 0;

            return (
              <motion.div
                key={p.id}
                whileTap={{ scale: 0.97 }}
                onClick={() => addToCart(p)}
                className={`bg-white p-3.5 rounded-xl border transition-all group relative flex flex-col justify-between shadow-xs select-none cursor-pointer ${
                  inCartQty > 0
                    ? 'border-blue-300 bg-blue-50/30'
                    : 'border-slate-200 hover:border-blue-400 hover:shadow-xs'
                }`}
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide bg-slate-50 px-1.5 py-0.5 rounded">
                    {p.category}
                  </span>
                  {inCartQty > 0 && (
                    <span className="bg-blue-600 text-white font-extrabold text-[10px] min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center border border-white">
                      {formatQty(inCartQty)}
                    </span>
                  )}
                </div>

                <div className="flex-1 space-y-1">
                  <h4 className="font-bold text-slate-800 text-xs sm:text-sm line-clamp-2 leading-tight group-hover:text-blue-600 transition">
                    {p.name}
                  </h4>
                  <p className="text-[10px] text-slate-400 font-mono tracking-wide">{p.sku}</p>
                </div>

                <div className="mt-4 flex items-end justify-between border-t border-slate-100 pt-2.5">
                  <div>
                    <p className="text-xs text-slate-400 italic font-medium">{p.unit}</p>
                    <p className="font-bold text-blue-600 text-xs sm:text-sm font-mono mt-0.5">
                      {formatVND(p.sellingPrice)}
                    </p>
                  </div>
                  <div className="text-right">
                    {isNegativeStock ? (
                      <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1.5 py-0.5 rounded">Tồn: {p.stock}</span>
                    ) : isOutOfStock ? (
                      <span className="text-[9px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded uppercase">Hết kho</span>
                    ) : isLowStock ? (
                      <span className="text-[9px] font-bold text-amber-650 bg-amber-50 px-1.5 py-0.5 rounded">Tồn: {p.stock}</span>
                    ) : (
                      <span className="text-[9px] text-slate-400 font-medium block">Tồn: {p.stock}</span>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* RIGHT COLUMN: Cart */}
      <form onSubmit={handleCheckout} className="lg:col-span-5 bg-white p-5 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between h-[750px]">
        {/* Cart Header */}
        <div>
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-50 rounded-xl text-blue-600">
                <ShoppingCart className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-slate-800 text-sm">Giỏ hàng tính tiền</h3>
                <p className="text-[10px] text-slate-400 font-semibold">{cart.length} nhóm mặt hàng</p>
              </div>
            </div>
            {cart.length > 0 && (
              <button
                type="button"
                onClick={clearCart}
                className="text-xs text-rose-500 hover:text-rose-700 font-bold transition flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" /> Xóa sạch
              </button>
            )}
          </div>

          {/* Cart Items */}
          <div className="overflow-y-auto max-h-[200px] my-3 pr-1 divide-y divide-slate-100">
            {cart.length === 0 ? (
              <div className="py-8 text-center text-slate-400 flex flex-col items-center justify-center">
                <ShoppingCart className="w-8 h-8 stroke-1 text-slate-300 mb-2 animate-bounce" />
                <p className="text-xs font-semibold text-slate-500">Giỏ hàng trống rỗng</p>
                <p className="text-[10px] text-slate-400 mt-1">Quét mã vạch hoặc chọn sản phẩm bên trái.</p>
              </div>
            ) : (
              cart.map((item) => (
                <div key={item.product.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-slate-800 text-xs sm:text-sm truncate leading-snug">{item.product.name}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">{formatVND(item.product.sellingPrice)} / {item.product.unit}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center border border-slate-200 rounded-lg bg-white overflow-hidden p-0.5 h-7">
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.product.id, -1)}
                        className="p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-800 active:scale-95 cursor-pointer"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                      <input
                        type="number"
                        step={isWeightUnit(item.product.unit) ? 'any' : '1'}
                        min={isWeightUnit(item.product.unit) ? '0.001' : '1'}
                        value={item.quantity}
                        onChange={e => {
                          const v = parseFloat(e.target.value.replace(',', '.'));
                          if (!isNaN(v) && v > 0) setCartQty(item.product.id, v);
                        }}
                        className={`text-center font-bold text-xs font-mono bg-transparent border-0 focus:outline-none focus:ring-0 p-0 ${isWeightUnit(item.product.unit) ? 'w-16' : 'w-7'}`}
                      />
                      <button
                        type="button"
                        onClick={() => updateCartQuantity(item.product.id, 1)}
                        className="p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-800 active:scale-95 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFromCart(item.product.id)}
                      className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-rose-50 transition cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Customer Info */}
        <div className="border-t border-slate-200 pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                <User className="w-3 h-3" /> Tên Khách
              </label>
              <input
                type="text"
                placeholder="Anh Hoàng, Chị Lan..."
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg shadow-xs text-xs outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                <Phone className="w-3 h-3" /> Số Điện Thoại
              </label>
              <input
                type="text"
                placeholder="09..."
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg shadow-xs text-xs outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Discount Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 text-xs font-semibold flex items-center gap-1">
                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" /> Giảm giá / Khuyến mãi:
              </span>
              {/* Mode Toggle */}
              <div className="flex bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                <button
                  type="button"
                  onClick={() => { setDiscountMode('percent'); setDiscountFixed(0); }}
                  className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                    discountMode === 'percent' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  % Giảm
                </button>
                <button
                  type="button"
                  onClick={() => { setDiscountMode('fixed'); setDiscountPercent(0); }}
                  className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition cursor-pointer ${
                    discountMode === 'fixed' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-700'
                  }`}
                >
                  VNĐ Giảm
                </button>
              </div>
            </div>

            {discountMode === 'percent' ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={discountPercent || ''}
                    onChange={(e) => setDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                    placeholder="0"
                    className="w-20 px-2.5 py-1 border border-slate-200 bg-white rounded-lg text-right font-mono font-bold text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none"
                  />
                  <span className="text-xs font-bold text-slate-500">%</span>
                  <div className="flex gap-1 ml-auto">
                    {quickDiscountPct.map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => setDiscountPercent(pct)}
                        className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                          discountPercent === pct
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                        }`}
                      >
                        {pct}%
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setDiscountPercent(0)}
                      className="px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200 bg-white text-slate-400 hover:text-slate-600 transition cursor-pointer"
                    >
                      0%
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={discountFixed || ''}
                    onChange={(e) => setDiscountFixed(Math.max(0, Number(e.target.value)))}
                    placeholder="Nhập số tiền giảm..."
                    className="flex-1 px-2.5 py-1 border border-slate-200 bg-white rounded-lg font-mono font-bold text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none"
                  />
                  <span className="text-xs font-bold text-slate-500 shrink-0">₫</span>
                </div>
                <div className="flex gap-1 flex-wrap">
                  {quickDiscountVND.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      onClick={() => setDiscountFixed(amt)}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border transition cursor-pointer ${
                        discountFixed === amt
                          ? 'bg-blue-600 text-white border-blue-600'
                          : 'bg-white text-slate-500 border-slate-200 hover:border-blue-300'
                      }`}
                    >
                      -{formatVND(amt).replace(' ₫', '')}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setDiscountFixed(0)}
                    className="px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200 bg-white text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  >
                    Bỏ
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Payment Methods */}
        <div className="border-t border-slate-200 pt-3">
          <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2">Hình thức thanh toán</label>
          <div className="grid grid-cols-3 gap-2">
            {(['CASH', 'QR', 'CARD'] as PaymentMethod[]).map((method) => {
              const labels: Record<PaymentMethod, { icon: React.ReactNode; label: string }> = {
                CASH: { icon: <Coins className="w-4 h-4" />, label: 'Tiền mặt' },
                QR: { icon: <QrCode className="w-4 h-4" />, label: 'VietQR CK' },
                CARD: { icon: <CreditCard className="w-4 h-4" />, label: 'Quẹt thẻ' },
              };
              const m = labels[method];
              return (
                <button
                  key={method}
                  type="button"
                  onClick={() => setPaymentMethod(method)}
                  className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all cursor-pointer ${
                    paymentMethod === method
                      ? 'border-blue-600 bg-blue-50/20 text-blue-700 font-bold shadow-xs'
                      : 'border-slate-200 hover:border-slate-350 bg-white text-slate-600'
                  }`}
                >
                  {m.icon}
                  <span className="text-[10px] tracking-tight">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Payment Detail Panels */}
        <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 min-h-[120px] flex flex-col justify-center">
          {paymentMethod === 'CASH' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-500 font-bold text-xs flex items-center gap-1">
                  <Calculator className="w-4 h-4 text-slate-400" /> Tiền khách đưa:
                </span>
                <input
                  type="number"
                  placeholder="0"
                  value={cashGiven || ''}
                  onChange={(e) => setCashGiven(Math.max(0, Number(e.target.value)))}
                  className="w-32 px-2.5 py-1 border border-slate-200 bg-white rounded-lg text-right font-mono font-bold text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none"
                />
              </div>
              <div className="flex flex-wrap gap-1 justify-end">
                {quickBills.map((bill) => (
                  <button
                    key={bill}
                    type="button"
                    onClick={() => setCashGiven(bill)}
                    className="px-2 py-0.5 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[9px] font-bold text-slate-600 font-mono transition shadow-2xs cursor-pointer"
                  >
                    +{formatVND(bill).replace(' ₫', '')}
                  </button>
                ))}
              </div>
              {cashGiven > 0 && (
                <div className="flex justify-between items-center border-t border-slate-200 pt-2 text-xs">
                  <span className="font-bold text-slate-600 uppercase tracking-wide">TIỀN TRẢ LẠI:</span>
                  <span className="font-bold text-sm text-rose-600 font-mono">{formatVND(changeDue)}</span>
                </div>
              )}
            </div>
          )}

          {paymentMethod === 'QR' && (
            <div className="flex items-center gap-4">
              <div className="shrink-0 bg-white p-1 rounded-lg border border-slate-200">
                {subtotal > 0 ? (
                  <img src={vietQrUrl} alt="VietQR code" className="w-20 h-20 object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-20 h-20 flex items-center justify-center bg-slate-100 text-slate-300">
                    <QrCode className="w-8 h-8 stroke-1" />
                  </div>
                )}
              </div>
              <div className="min-w-0 space-y-1">
                <span className="text-[10px] font-bold bg-blue-50 border border-blue-150 text-blue-700 px-1.5 py-0.5 rounded flex items-center gap-1 w-max">
                  <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-ping"></span>
                  CHỜ QUÉT VIETQR
                </span>
                <p className="text-xs font-bold text-slate-800 tracking-tight leading-tight truncate">TK: {storeConfig.bankAccount} ({storeConfig.bankId})</p>
                <p className="text-[10px] text-slate-500 uppercase truncate">Chủ: {storeConfig.bankAccountName}</p>
              </div>
            </div>
          )}

          {paymentMethod === 'CARD' && (
            <div className="text-center py-2 space-y-1.5">
              <p className="font-bold text-slate-700 text-xs flex items-center justify-center gap-1">
                <CreditCard className="w-4 h-4 text-blue-600" /> Quẹt thẻ ATM / Visa / Mastercard
              </p>
              <p className="text-[11px] text-slate-400">
                Kết nối máy POS cà thẻ để xử lý giao dịch.
              </p>
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="border-t border-slate-200 pt-3.5 space-y-3">
          <div className="space-y-1.5">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Tạm tính ({cart.reduce((s, i) => s + i.quantity, 0)} món):</span>
              <span className="font-mono">{formatVND(subtotal)}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-xs text-slate-500 italic">
                <span>
                  {discountMode === 'percent'
                    ? `Giảm ${discountPercent}%:`
                    : `Giảm cố định (≈${effectiveDiscountPercent}%):`}
                </span>
                <span className="font-mono text-emerald-600">-{formatVND(discountAmount)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm sm:text-base font-bold border-t border-slate-200 pt-2 text-slate-900">
              <span>TỔNG KHÁCH CẦN TRẢ:</span>
              <span className="font-mono font-bold text-blue-600 text-lg">{formatVND(totalAmount)}</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={cart.length === 0}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-lg text-xs sm:text-sm shadow-md transition-all duration-150 disabled:bg-slate-200 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
          >
            <Printer className="w-4.5 h-4.5" /> Thanh Toán & In Hóa Đơn
          </button>
        </div>
      </form>
    </div>
  );
}
