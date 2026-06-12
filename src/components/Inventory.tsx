/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Product } from '../types';
import {
  Plus, Search, Edit2, Trash2, Box, ArrowUpRight,
  AlertTriangle, RotateCcw, PackageCheck, PackageX, DollarSign,
  Eye, EyeOff, Download, Upload, FileSpreadsheet, Tag, Pencil,
  ChevronDown, Copy, ArrowUpDown, ChevronUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface InventoryProps {
  products: Product[];
  onAddProduct: (product: Product) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
  onRestockProduct: (id: string, amount: number) => void;
}

const COL = {
  sku: 'Mã SKU',
  name: 'Tên sản phẩm',
  brand: 'Nhãn hiệu',
  category: 'Danh mục',
  cost: 'Giá vốn',
  price: 'Giá bán',
  stock: 'Tồn kho',
  min: 'Định mức tối thiểu',
  unit: 'ĐVT',
  hidden: 'Ẩn (Có/để trống)',
  barcode: 'Mã vạch',
};

export default function Inventory({
  products,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onRestockProduct
}: InventoryProps) {
  const categories = Array.from(new Set(products.map((p) => p.category)));

  // Bộ lọc
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'out' | 'low'>('all');

  // Sắp xếp
  const [sortField, setSortField] = useState<'sku' | 'brand' | 'category' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Mở rộng hàng
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Chọn nhiều
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal / form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockAmount, setRestockAmount] = useState<number>(10);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);

  // Trường form sản phẩm
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('Cái');
  const [costPrice, setCostPrice] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(10);
  const [customCategory, setCustomCategory] = useState('');
  const [formError, setFormError] = useState('');

  // Trường form "Sửa nhóm"
  const [bulkBrand, setBulkBrand] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkPricePercent, setBulkPricePercent] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Thống kê nhanh — âm tồn kho cũng tính là hết hàng
  const totalProducts = products.length;
  const outOfStockProducts = products.filter((p) => p.stock <= 0).length;
  const lowStockProducts = products.filter((p) => p.stock > 0 && p.stock <= p.minStock).length;
  const hiddenCount = products.filter((p) => p.hidden).length;
  const totalInventoryValue = products.reduce((acc, p) => acc + (p.stock * p.costPrice), 0);

  // Gợi ý nhãn hiệu cho autocomplete
  const brandSuggestions = useMemo(
    () => Array.from(new Set(products.map((p) => p.brand).filter(Boolean))).sort(),
    [products]
  );

  // Lọc danh sách
  const filteredProducts = useMemo(() => products.filter((p) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q);
    const matchesCategory = selectedCategory === '' || p.category === selectedCategory;
    let matchesStock = true;
    if (stockFilter === 'out') matchesStock = p.stock <= 0;
    else if (stockFilter === 'low') matchesStock = p.stock > 0 && p.stock <= p.minStock;
    return matchesSearch && matchesCategory && matchesStock;
  }), [products, searchTerm, selectedCategory, stockFilter]);

  // Sắp xếp
  const sortedProducts = useMemo(() => {
    if (!sortField) return filteredProducts;
    return [...filteredProducts].sort((a, b) => {
      const va = (sortField === 'sku' ? a.sku : sortField === 'brand' ? a.brand : a.category).toLowerCase();
      const vb = (sortField === 'sku' ? b.sku : sortField === 'brand' ? b.brand : b.category).toLowerCase();
      const cmp = va.localeCompare(vb, 'vi');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filteredProducts, sortField, sortDir]);

  const selectedProducts = products.filter((p) => selectedIds.has(p.id));
  const allFilteredSelected =
    sortedProducts.length > 0 && sortedProducts.every((p) => selectedIds.has(p.id));

  const formatVND = (val: number) => val.toLocaleString('vi-VN') + ' ₫';

  // ── Sắp xếp cột ─────────────────────────────────────────────────────────────
  function toggleSort(field: 'sku' | 'brand' | 'category') {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortField(field); setSortDir('asc'); }
  }

  function SortIcon({ field }: { field: 'sku' | 'brand' | 'category' }) {
    if (sortField !== field) return <ArrowUpDown className="w-3 h-3 text-slate-300 ml-1 inline" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-blue-500 ml-1 inline" />
      : <ChevronDown className="w-3 h-3 text-blue-500 ml-1 inline" />;
  }

  // ── Chọn nhiều ──────────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) sortedProducts.forEach((p) => next.delete(p.id));
      else sortedProducts.forEach((p) => next.add(p.id));
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const handleBulkDelete = () => {
    if (selectedProducts.length === 0) return;
    if (!confirm(`Xóa vĩnh viễn ${selectedProducts.length} sản phẩm đã chọn? Hành động này không thể hoàn tác.`)) return;
    selectedProducts.forEach((p) => onDeleteProduct(p.id));
    clearSelection();
  };

  const handleBulkHide = (hidden: boolean) => {
    if (selectedProducts.length === 0) return;
    selectedProducts.forEach((p) => onUpdateProduct({ ...p, hidden }));
    clearSelection();
  };

  const handleOpenBulkEdit = () => {
    setBulkBrand(''); setBulkCategory(''); setBulkPricePercent(0);
    setIsBulkEditOpen(true);
  };

  const handleBulkEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    selectedProducts.forEach((p) => {
      let selling = p.sellingPrice;
      if (bulkPricePercent !== 0) selling = Math.max(0, Math.round(p.sellingPrice * (1 + bulkPricePercent / 100)));
      onUpdateProduct({
        ...p,
        brand: bulkBrand.trim() !== '' ? bulkBrand.trim() : p.brand,
        category: bulkCategory !== '' ? bulkCategory : p.category,
        sellingPrice: selling,
      });
    });
    setIsBulkEditOpen(false);
    clearSelection();
  };

  // ── Nhân bản sản phẩm ───────────────────────────────────────────────────────
  const handleDuplicate = (p: Product) => {
    const newP: Product = { ...p, id: `prod-${Date.now()}`, sku: nextAutoSku(), stock: 0, name: p.name + ' (bản sao)' };
    onAddProduct(newP);
    setExpandedId(null);
  };

  // ── Form thêm / sửa 1 sản phẩm ──────────────────────────────────────────────
  const nextAutoSku = (offset = 0) => {
    const lastNum = products.reduce((max, p) => {
      const match = p.sku.match(/SP(\d+)/);
      if (match) { const num = parseInt(match[1], 10); return num > max ? num : max; }
      return max;
    }, 0);
    return `SP${String(lastNum + 1 + offset).padStart(5, '0')}`;
  };

  const handleOpenAddForm = () => {
    setEditingProduct(null);
    setSku(nextAutoSku()); setName(''); setBrand(''); setBarcode('');
    setCategory(categories[0] || 'Nước giải khát');
    setUnit('Cái'); setCostPrice(0); setSellingPrice(0); setStock(0); setMinStock(5);
    setCustomCategory(''); setFormError('');
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (p: Product) => {
    setEditingProduct(p);
    setSku(p.sku); setName(p.name); setBrand(p.brand || ''); setBarcode(p.barcode || '');
    setCategory(p.category); setUnit(p.unit); setCostPrice(p.costPrice);
    setSellingPrice(p.sellingPrice); setStock(p.stock); setMinStock(p.minStock);
    setCustomCategory(''); setFormError('');
    setIsFormOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) { setFormError('Vui lòng nhập tên sản phẩm.'); return; }
    if (costPrice < 0 || sellingPrice < 0) { setFormError('Giá nhập và giá bán không được là số âm.'); return; }
    if (costPrice > sellingPrice && sellingPrice > 0) setFormError('Cảnh báo: Giá nhập cao hơn giá bán (Bán lỗ!).');

    const finalCategory = category === 'new-cat' ? (customCategory.trim() || 'Khác') : category;
    const productPayload: Product = {
      id: editingProduct ? editingProduct.id : `prod-${Date.now()}`,
      sku, name, brand: brand.trim(), barcode: barcode.trim() || undefined,
      category: finalCategory, unit,
      costPrice: Number(costPrice), sellingPrice: Number(sellingPrice),
      stock: Number(stock), minStock: Number(minStock),
      hidden: editingProduct ? editingProduct.hidden : false,
    };

    if (editingProduct) onUpdateProduct(productPayload);
    else onAddProduct(productPayload);
    setIsFormOpen(false);
  };

  const handleRestockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockProduct) return;
    onRestockProduct(restockProduct.id, Number(restockAmount));
    setRestockProduct(null);
  };

  // ── Excel ────────────────────────────────────────────────────────────────────
  const buildRows = (list: Product[]) =>
    list.map((p) => ({
      [COL.sku]: p.sku,
      [COL.name]: p.name,
      [COL.brand]: p.brand || '',
      [COL.category]: p.category,
      [COL.cost]: p.costPrice,
      [COL.price]: p.sellingPrice,
      [COL.stock]: p.stock,
      [COL.min]: p.minStock,
      [COL.unit]: p.unit,
      [COL.hidden]: p.hidden ? 'Có' : '',
      [COL.barcode]: p.barcode || '',
    }));

  const downloadSheet = (rows: any[], filename: string) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 34 }, { wch: 16 }, { wch: 20 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 8 }, { wch: 16 }, { wch: 18 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sản phẩm');
    XLSX.writeFile(wb, filename);
  };

  const handleExport = () => {
    const today = new Date().toISOString().slice(0, 10);
    downloadSheet(buildRows(sortedProducts.length ? sortedProducts : products), `danh-sach-san-pham-${today}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const sample = [{
      [COL.sku]: 'SP00099', [COL.name]: 'Tên sản phẩm ví dụ',
      [COL.brand]: 'Nhãn hiệu', [COL.category]: 'Nước giải khát',
      [COL.cost]: 6500, [COL.price]: 10000, [COL.stock]: 100, [COL.min]: 20,
      [COL.unit]: 'Chai', [COL.hidden]: '', [COL.barcode]: '',
    }];
    downloadSheet(sample, 'mau-nhap-san-pham.xlsx');
  };

  const num = (v: any) => { const n = Number(String(v ?? '').replace(/[^\d.-]/g, '')); return isNaN(n) ? 0 : n; };
  const pick = (row: Record<string, any>, ...keys: string[]) => {
    for (const k of keys) { if (row[k] !== undefined && row[k] !== '') return row[k]; }
    return '';
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const data = await file.arrayBuffer();
      const wb = XLSX.read(data, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
      let added = 0, updated = 0, skipped = 0;
      rows.forEach((row, i) => {
        const nm = String(pick(row, COL.name, 'name', 'Tên')).trim();
        if (!nm) { skipped++; return; }
        const rawSku = String(pick(row, COL.sku, 'sku', 'SKU')).trim();
        const existing = rawSku ? products.find((p) => p.sku.toLowerCase() === rawSku.toLowerCase()) : undefined;
        const hiddenVal = String(pick(row, COL.hidden, 'Ẩn', 'hidden')).trim().toLowerCase();
        const isHidden = ['có', 'co', 'x', 'true', '1', 'yes'].includes(hiddenVal);
        const payload: Product = {
          id: existing ? existing.id : `prod-${Date.now()}-${i}`,
          sku: rawSku || nextAutoSku(added),
          name: nm,
          brand: String(pick(row, COL.brand, 'brand', 'Nhãn hiệu')).trim(),
          category: String(pick(row, COL.category, 'category', 'Danh mục')).trim() || 'Khác',
          costPrice: num(pick(row, COL.cost, 'costPrice', 'Giá vốn', 'Giá nhập')),
          sellingPrice: num(pick(row, COL.price, 'sellingPrice', 'Giá bán')),
          stock: num(pick(row, COL.stock, 'stock', 'Tồn kho')),
          minStock: num(pick(row, COL.min, 'minStock', 'Định mức tối thiểu')),
          unit: String(pick(row, COL.unit, 'unit', 'ĐVT')).trim() || 'Cái',
          hidden: isHidden,
          barcode: String(pick(row, COL.barcode, 'barcode', 'Mã vạch')).trim() || undefined,
        };
        if (existing) { onUpdateProduct(payload); updated++; }
        else { onAddProduct(payload); added++; }
      });
      alert(`Nhập Excel hoàn tất!\n• Thêm mới: ${added}\n• Cập nhật (trùng mã SKU): ${updated}${skipped ? `\n• Bỏ qua (thiếu tên): ${skipped}` : ''}`);
    } catch (err) {
      console.error(err);
      alert('Không đọc được file. Hãy dùng file .xlsx đúng định dạng (tải mẫu để tham khảo).');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ── JSX ──────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Thanh tiêu đề + công cụ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Quản lý kho hàng</h1>
          <p className="text-slate-500 text-sm mt-1">Cập nhật hàng hóa, chỉnh sửa đơn giá, nhập hàng kho và theo dõi định mức tồn kho an toàn.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls" onChange={handleImportFile} className="hidden" />
          <button onClick={handleDownloadTemplate}
            className="flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold px-3 py-2.5 rounded-lg text-xs transition cursor-pointer"
            title="Tải file Excel mẫu để nhập">
            <FileSpreadsheet className="w-4 h-4" /> Tải mẫu
          </button>
          <button onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-2.5 rounded-lg text-xs transition cursor-pointer">
            <Upload className="w-4 h-4" /> Nhập Excel
          </button>
          <button onClick={handleExport}
            className="flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold px-3 py-2.5 rounded-lg text-xs transition cursor-pointer">
            <Download className="w-4 h-4" /> Xuất Excel
          </button>
          <button onClick={handleOpenAddForm}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-lg text-sm transition-all shadow-xs cursor-pointer">
            <Plus className="w-4 h-4" /> Thêm sản phẩm
          </button>
        </div>
      </div>

      {/* Thẻ thống kê — bấm để lọc */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Tổng sản phẩm — reset về Tất cả */}
        <button
          onClick={() => setStockFilter('all')}
          className={`bg-white p-5 rounded-xl border flex items-center justify-between shadow-xs text-left w-full transition ${stockFilter === 'all' ? 'border-blue-400 ring-2 ring-blue-100' : 'border-slate-200 hover:border-slate-300'}`}
        >
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">TỔNG SẢN PHẨM</p>
            <p className="text-2xl font-extrabold text-slate-800">{totalProducts}</p>
          </div>
          <div className={`p-3 rounded-xl ${stockFilter === 'all' ? 'bg-blue-50 text-blue-600' : 'bg-slate-50 text-slate-500'}`}>
            <Box className="w-6 h-6" />
          </div>
        </button>

        {/* Hết hàng kho */}
        <button
          onClick={() => setStockFilter(stockFilter === 'out' ? 'all' : 'out')}
          className={`bg-white p-5 rounded-xl border flex items-center justify-between shadow-xs text-left w-full transition ${stockFilter === 'out' ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-200 hover:border-rose-300'}`}
        >
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">HẾT HÀNG KHO</p>
            <div className="flex items-center gap-2">
              <p className="text-2xl font-extrabold text-slate-800">{outOfStockProducts}</p>
              {outOfStockProducts > 0 && (
                <span className="text-[10px] font-bold bg-rose-50 text-rose-600 px-2 py-0.5 rounded-full border border-rose-100 flex items-center gap-1">
                  <PackageX className="w-3 h-3" /> Cần nhập!
                </span>
              )}
            </div>
          </div>
          <div className={`p-3 rounded-xl ${stockFilter === 'out' || outOfStockProducts > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
        </button>

        {/* Dưới định mức */}
        <button
          onClick={() => setStockFilter(stockFilter === 'low' ? 'all' : 'low')}
          className={`bg-white p-5 rounded-xl border flex items-center justify-between shadow-xs text-left w-full transition ${stockFilter === 'low' ? 'border-amber-400 ring-2 ring-amber-100' : 'border-slate-200 hover:border-amber-300'}`}
        >
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">DƯỚI ĐỊNH MỨC</p>
            <p className="text-2xl font-extrabold text-slate-800">{lowStockProducts}</p>
          </div>
          <div className={`p-3 rounded-xl ${stockFilter === 'low' || lowStockProducts > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
            <PackageCheck className="w-6 h-6" />
          </div>
        </button>

        {/* Tổng giá trị */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">TỔNG GIÁ TRỊ TỒN KHO</p>
            <p className="text-lg font-bold text-emerald-600 font-mono">{formatVND(totalInventoryValue)}</p>
          </div>
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl">
            <DollarSign className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Bảng + bộ lọc */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Thanh điều khiển */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 flex-1">
            <div className="relative flex-1 max-w-md">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder="Tìm theo tên, SKU hoặc nhãn hiệu..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm transition text-slate-700 font-medium"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm transition text-slate-700 font-medium cursor-pointer"
            >
              <option value="">Tất cả danh mục ({categories.length})</option>
              {categories.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
            </select>
            {hiddenCount > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700">
                <EyeOff className="w-3.5 h-3.5" />{hiddenCount} SP đang ẩn
              </span>
            )}
            {stockFilter !== 'all' && (
              <button onClick={() => setStockFilter('all')}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-blue-200 bg-blue-50 text-blue-700 cursor-pointer hover:bg-blue-100 transition">
                <RotateCcw className="w-3.5 h-3.5" />
                Xem tất cả
              </button>
            )}
          </div>
        </div>

        {/* Thanh hành động hàng loạt */}
        <AnimatePresence>
          {selectedProducts.length > 0 && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="bg-blue-50 border-b border-blue-100 overflow-hidden">
              <div className="px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold text-blue-800">Đã chọn {selectedProducts.length} sản phẩm</span>
                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  <button onClick={handleOpenBulkEdit} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer">
                    <Pencil className="w-3.5 h-3.5" /> Sửa nhóm
                  </button>
                  <button onClick={() => handleBulkHide(true)} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer">
                    <EyeOff className="w-3.5 h-3.5" /> Ẩn
                  </button>
                  <button onClick={() => handleBulkHide(false)} className="inline-flex items-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer">
                    <Eye className="w-3.5 h-3.5" /> Hiện
                  </button>
                  <button onClick={handleBulkDelete} className="inline-flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" /> Xóa
                  </button>
                  <button onClick={clearSelection} className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800 px-2 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer">
                    Bỏ chọn
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bảng sản phẩm */}
        <div className="overflow-x-auto">
          {sortedProducts.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Box className="w-12 h-12 mx-auto stroke-1 text-slate-300 mb-3" />
              <p className="text-sm font-semibold">Không tìm thấy sản phẩm nào</p>
              <p className="text-xs mt-1">Vui lòng kiểm tra lại từ khóa tìm kiếm hoặc đổi điều kiện lọc.</p>
              {(searchTerm || selectedCategory || stockFilter !== 'all') && (
                <button onClick={() => { setSearchTerm(''); setSelectedCategory(''); setStockFilter('all'); }}
                  className="mt-4 inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer">
                  <RotateCcw className="w-3.5 h-3.5" /> Khôi phục điều kiện
                </button>
              )}
            </div>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                  <th className="px-4 py-3.5 w-10">
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll}
                      className="w-4 h-4 accent-blue-600 cursor-pointer align-middle" title="Chọn tất cả" />
                  </th>
                  <th className="px-4 py-3.5 font-mono cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('sku')}>
                    Mã SP <SortIcon field="sku" />
                  </th>
                  <th className="px-4 py-3.5">Tên sản phẩm</th>
                  <th className="px-4 py-3.5 cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('brand')}>
                    Nhãn hiệu <SortIcon field="brand" />
                  </th>
                  <th className="px-4 py-3.5 cursor-pointer select-none whitespace-nowrap" onClick={() => toggleSort('category')}>
                    Danh mục <SortIcon field="category" />
                  </th>
                  <th className="px-4 py-3.5 text-right font-mono">Giá Vốn</th>
                  <th className="px-4 py-3.5 text-right font-mono">Giá Bán</th>
                  <th className="px-4 py-3.5 text-center">Tồn Kho</th>
                  <th className="px-4 py-3.5 text-center">ĐVT</th>
                  <th className="px-4 py-3.5 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sortedProducts.map((p) => {
                  const isOutOfStock = p.stock <= 0;
                  const isLowStock = !isOutOfStock && p.stock <= p.minStock;
                  let stockBadgeClass = 'bg-slate-50 border-slate-200 text-slate-700';
                  if (isOutOfStock) stockBadgeClass = 'bg-rose-50 border-rose-100 text-rose-600';
                  else if (isLowStock) stockBadgeClass = 'bg-amber-50 border-amber-100 text-amber-600';

                  const margin = p.sellingPrice > 0
                    ? Math.round(((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100) : 0;
                  const isSelected = selectedIds.has(p.id);
                  const isExpanded = expandedId === p.id;

                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        className={`transition text-sm cursor-pointer ${isSelected ? 'bg-blue-50/60' : isExpanded ? 'bg-slate-50' : 'hover:bg-slate-50/55'} ${p.hidden ? 'opacity-55' : ''}`}
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      >
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)}
                            className="w-4 h-4 accent-blue-600 cursor-pointer align-middle" />
                        </td>
                        <td className="px-4 py-3.5 font-mono font-medium text-slate-500 whitespace-nowrap">{p.sku}</td>
                        <td className="px-4 py-3.5 max-w-[200px]">
                          <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                            {p.name}
                            {p.hidden && (
                              <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 font-bold rounded border border-amber-300 bg-amber-50 text-amber-700 shrink-0">
                                <EyeOff className="w-3 h-3" /> Ẩn
                              </span>
                            )}
                          </div>
                          {isLowStock && !p.hidden && (
                            <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 font-bold rounded border bg-amber-50 border-amber-200 text-amber-600">
                              Sắp hết
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                          {p.brand ? (
                            <span className="inline-flex items-center gap-1 text-xs font-medium">
                              <Tag className="w-3 h-3 text-slate-400" /> {p.brand}
                            </span>
                          ) : <span className="text-slate-300 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                          <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold">{p.category}</span>
                        </td>
                        <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-500">{formatVND(p.costPrice)}</td>
                        <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-800">
                          {formatVND(p.sellingPrice)}
                          <span className="block text-[10px] text-slate-400 mt-0.5 italic font-sans font-normal">Lãi: ~{margin}%</span>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <span className={`px-2.5 py-1 rounded-lg border font-mono ${stockBadgeClass}`}>{p.stock}</span>
                          <span className="block text-[10px] text-slate-400 mt-1 font-normal">Định mức: {p.minStock}</span>
                        </td>
                        <td className="px-4 py-3.5 text-center text-slate-500 font-medium">{p.unit}</td>
                        <td className="px-4 py-3.5 text-center">
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-blue-500' : ''}`} />
                        </td>
                      </tr>

                      {/* Panel mở rộng — chi tiết đầy đủ */}
                      {isExpanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={10} className="px-5 py-4 border-t border-slate-200">
                            <div className="space-y-3">
                              {/* Tên + trạng thái */}
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-extrabold text-slate-800 text-sm">{p.name}</p>
                                  <p className="text-xs text-slate-500 mt-0.5">
                                    Nhóm hàng: <span className="font-semibold text-slate-700">{p.category}</span>
                                    {p.brand && <> · Nhãn hiệu: <span className="font-semibold text-slate-700">{p.brand}</span></>}
                                  </p>
                                </div>
                                <span className={`shrink-0 text-xs font-bold px-2.5 py-1 rounded-full border ${
                                  isOutOfStock ? 'bg-rose-50 text-rose-600 border-rose-200' :
                                  isLowStock   ? 'bg-amber-50 text-amber-600 border-amber-200' :
                                                 'bg-emerald-50 text-emerald-600 border-emerald-200'
                                }`}>
                                  {isOutOfStock ? 'Hết hàng' : isLowStock ? 'Sắp hết' : 'Còn hàng'}
                                </span>
                              </div>

                              {/* Lưới thông tin */}
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Mã SP (nội bộ)</p>
                                  <p className="font-mono font-bold text-slate-700 text-sm">{p.sku}</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Mã vạch (Barcode)</p>
                                  <p className="font-mono font-bold text-slate-700 text-sm">
                                    {p.barcode || <span className="text-slate-300 font-normal text-xs">Chưa có</span>}
                                  </p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Tồn kho</p>
                                  <p className={`font-mono font-bold text-sm ${isOutOfStock ? 'text-rose-600' : isLowStock ? 'text-amber-600' : 'text-slate-700'}`}>
                                    {p.stock} <span className="text-slate-400 font-normal text-xs">{p.unit}</span>
                                  </p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Định mức tồn tối thiểu</p>
                                  <p className="font-mono font-bold text-slate-700 text-sm">{p.minStock} <span className="text-slate-400 font-normal text-xs">{p.unit}</span></p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Giá vốn</p>
                                  <p className="font-mono font-bold text-slate-600 text-sm">{formatVND(p.costPrice)}</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Giá bán</p>
                                  <p className="font-mono font-bold text-slate-800 text-sm">{formatVND(p.sellingPrice)}</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Thương hiệu</p>
                                  <p className="font-bold text-slate-700 text-sm">{p.brand || <span className="text-slate-300 font-normal text-xs">—</span>}</p>
                                </div>
                                <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Đơn vị tính</p>
                                  <p className="font-bold text-slate-700 text-sm">{p.unit}</p>
                                </div>
                              </div>

                              {/* Nút thao tác */}
                              <div className="flex flex-wrap gap-2 pt-1">
                                <button onClick={(e) => { e.stopPropagation(); setRestockProduct(p); setRestockAmount(10); }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                                  <ArrowUpRight className="w-3.5 h-3.5" /> Nhập kho
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleDuplicate(p); }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                                  <Copy className="w-3.5 h-3.5" /> Nhân bản
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleOpenEditForm(p); }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                                  <Edit2 className="w-3.5 h-3.5" /> Chỉnh sửa
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); onUpdateProduct({ ...p, hidden: !p.hidden }); }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                                  {p.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                                  {p.hidden ? 'Hiện lại' : 'Ẩn SP'}
                                </button>
                                <button onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(`Xóa vĩnh viễn "${p.name}"?`)) onDeleteProduct(p.id);
                                }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                                  <Trash2 className="w-3.5 h-3.5" /> Xóa
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* datalist for brand autocomplete */}
      <datalist id="inv-brand-list">
        {brandSuggestions.map((b) => <option key={b} value={b} />)}
      </datalist>

      {/* Modal Thêm / Sửa sản phẩm */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-xl overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-800 text-base">{editingProduct ? 'Chỉnh sửa sản phẩm' : 'Thêm mới hàng hóa'}</h3>
                <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer">✕</button>
              </div>

              <form onSubmit={handleSaveProduct} className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">MÃ SP (NỘI BỘ)</label>
                    <input type="text" value={sku} onChange={(e) => setSku(e.target.value)} placeholder="SP00001"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-xl bg-slate-50 font-mono text-xs focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">ĐƠN VỊ TÍNH (ĐVT)</label>
                    <input type="text" value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="Cái, Chai, Gói, Hộp..."
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition" />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">TÊN SẢN PHẨM <span className="text-red-500">*</span></label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Nhập tên sản phẩm..."
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition font-bold" />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><Tag className="w-3 h-3" /> NHÃN HIỆU</label>
                    <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="VD: Coca-Cola, Hảo Hảo..."
                      list="inv-brand-list"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">MÃ VẠCH (IN TRÊN BAO BÌ)</label>
                    <input type="text" value={barcode} onChange={(e) => setBarcode(e.target.value)} placeholder="VD: 8938540313484"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">DANH MỤC</label>
                    <select value={category} onChange={(e) => setCategory(e.target.value)}
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition cursor-pointer">
                      {categories.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
                      <option value="new-cat">+ Tạo danh mục mới...</option>
                    </select>
                  </div>
                  {category === 'new-cat' && (
                    <div>
                      <label className="block text-xs font-bold text-indigo-600 mb-1">NHẬP DANH MỤC MỚI</label>
                      <input type="text" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="Tên danh mục mới"
                        className="w-full px-3 py-1.5 border border-indigo-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/10 focus:border-indigo-400 outline-none transition" />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">GIÁ VỐN (NHẬP) <span className="text-slate-400 font-normal">đ</span></label>
                    <input type="number" value={costPrice || ''} onChange={(e) => setCostPrice(Number(e.target.value))} placeholder="0"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">GIÁ BÁN <span className="text-slate-400 font-normal">đ</span></label>
                    <input type="number" value={sellingPrice || ''} onChange={(e) => setSellingPrice(Number(e.target.value))} placeholder="0"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition font-bold" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">CƠ SỐ TỒN KHO BAN ĐẦU</label>
                    <input type="number" value={stock} onChange={(e) => setStock(Number(e.target.value))} placeholder="0"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition" />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">CẢNH BÁO TỒN TỐI THIỂU</label>
                    <input type="number" value={minStock} onChange={(e) => setMinStock(Number(e.target.value))} placeholder="5"
                      className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition" />
                  </div>
                </div>

                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 text-xs font-medium">{formError}</div>
                )}

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition cursor-pointer">Hủy</button>
                  <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer">Lưu sản phẩm</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Sửa nhóm */}
      <AnimatePresence>
        {isBulkEditOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col">
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-1.5">
                  <Pencil className="w-4 h-4 text-blue-600" /> Sửa nhóm ({selectedProducts.length} SP)
                </h3>
                <button onClick={() => setIsBulkEditOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer">✕</button>
              </div>
              <form onSubmit={handleBulkEditSubmit} className="p-5 space-y-4">
                <p className="text-xs text-slate-500 bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  Để trống ô nào thì giữ nguyên giá trị cũ của ô đó cho toàn bộ sản phẩm đã chọn.
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">ĐỔI NHÃN HIỆU</label>
                  <input type="text" value={bulkBrand} onChange={(e) => setBulkBrand(e.target.value)} placeholder="Để trống = giữ nguyên"
                    list="inv-brand-list"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">ĐỔI DANH MỤC</label>
                  <select value={bulkCategory} onChange={(e) => setBulkCategory(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition cursor-pointer">
                    <option value="">-- Giữ nguyên --</option>
                    {categories.map((cat) => (<option key={cat} value={cat}>{cat}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">ĐIỀU CHỈNH GIÁ BÁN (%)</label>
                  <input type="number" value={bulkPricePercent || ''} onChange={(e) => setBulkPricePercent(Number(e.target.value))} placeholder="0 = giữ nguyên. VD: 10 = tăng 10%, -5 = giảm 5%"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs font-mono focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none transition" />
                  <p className="text-[11px] text-slate-400 italic mt-1">Số dương = tăng giá, số âm = giảm giá. Ví dụ 10 nghĩa là tăng 10%.</p>
                </div>
                <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsBulkEditOpen(false)} className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition cursor-pointer">Hủy</button>
                  <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer">Áp dụng cho {selectedProducts.length} SP</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Modal Nhập kho nhanh */}
      <AnimatePresence>
        {restockProduct && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5">
                  <ArrowUpRight className="w-4 h-4 text-emerald-600" /> Nhập kho bổ sung
                </h3>
                <button onClick={() => setRestockProduct(null)} className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer">✕</button>
              </div>
              <form onSubmit={handleRestockSubmit} className="p-5 space-y-4">
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-wide font-bold">TÊN SẢN PHẨM</p>
                  <p className="font-bold text-slate-800 text-sm mt-0.5 truncate">{restockProduct.name}</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">Mã SKU: {restockProduct.sku} | Hiện có: {restockProduct.stock} {restockProduct.unit}</p>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">SỐ LƯỢNG NHẬP THÊM ({restockProduct.unit})</label>
                  <input type="number" min="1" required value={restockAmount}
                    onChange={(e) => setRestockAmount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 outline-none text-base font-mono font-bold transition" />
                  <p className="text-[11px] text-slate-400 italic mt-1.5 flex justify-between">
                    <span>Tổng tồn kho sau nhập:</span>
                    <span className="font-bold text-slate-600 font-mono">{restockProduct.stock + Number(restockAmount)} {restockProduct.unit}</span>
                  </p>
                  <p className="text-[11px] text-slate-400 italic flex justify-between">
                    <span>Tổng chi phí nhập hàng:</span>
                    <span className="font-bold text-emerald-600 font-mono">{formatVND(restockProduct.costPrice * Number(restockAmount))}</span>
                  </p>
                </div>
                <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
                  <button type="button" onClick={() => setRestockProduct(null)} className="px-4 py-1.5 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition cursor-pointer">Hủy</button>
                  <button type="submit" className="px-5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer">Xác nhận nhập kho</button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
