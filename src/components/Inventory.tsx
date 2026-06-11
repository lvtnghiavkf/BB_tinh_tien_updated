/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Product } from '../types';
import {
  Plus, Search, Edit2, Trash2, Box, ArrowUpRight,
  AlertTriangle, RotateCcw, PackageCheck, PackageX, DollarSign,
  Eye, EyeOff, Download, Upload, FileSpreadsheet, Tag, Pencil
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface InventoryProps {
  products: Product[];
  onAddProduct: (product: Product) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
  onRestockProduct: (id: string, amount: number) => void;
}

// Tiêu đề cột dùng cho file Excel (xuất / nhập đều khớp các tên này)
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
};

export default function Inventory({
  products,
  onAddProduct,
  onUpdateProduct,
  onDeleteProduct,
  onRestockProduct
}: InventoryProps) {
  // Danh sách danh mục
  const categories = Array.from(new Set(products.map((p) => p.category)));

  // Bộ lọc
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [stockFilter, setStockFilter] = useState<'all' | 'out' | 'low'>('all');
  // Hidden products are always visible in inventory; "hidden" only affects Sales screen

  // Chọn nhiều
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal / form
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [restockProduct, setRestockProduct] = useState<Product | null>(null);
  const [restockAmount, setRestockAmount] = useState<number>(10);
  const [isBulkEditOpen, setIsBulkEditOpen] = useState(false);

  // Trường nhập của form sản phẩm
  const [sku, setSku] = useState('');
  const [name, setName] = useState('');
  const [brand, setBrand] = useState('');
  const [category, setCategory] = useState('');
  const [unit, setUnit] = useState('Cái');
  const [costPrice, setCostPrice] = useState<number>(0);
  const [sellingPrice, setSellingPrice] = useState<number>(0);
  const [stock, setStock] = useState<number>(0);
  const [minStock, setMinStock] = useState<number>(10);
  const [customCategory, setCustomCategory] = useState('');
  const [formError, setFormError] = useState('');

  // Trường của form "Sửa nhóm"
  const [bulkBrand, setBulkBrand] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkPricePercent, setBulkPricePercent] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Thống kê nhanh
  const totalProducts = products.length;
  const outOfStockProducts = products.filter((p) => p.stock === 0).length;
  const lowStockProducts = products.filter((p) => p.stock > 0 && p.stock <= p.minStock).length;
  const hiddenCount = products.filter((p) => p.hidden).length;
  const totalInventoryValue = products.reduce((acc, p) => acc + (p.stock * p.costPrice), 0);

  // Lọc danh sách hiển thị
  const filteredProducts = products.filter((p) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.brand || '').toLowerCase().includes(q);
    const matchesCategory = selectedCategory === '' || p.category === selectedCategory;

    let matchesStock = true;
    if (stockFilter === 'out') {
      matchesStock = p.stock === 0;
    } else if (stockFilter === 'low') {
      matchesStock = p.stock > 0 && p.stock <= p.minStock;
    }

    return matchesSearch && matchesCategory && matchesStock;
  });

  const selectedProducts = products.filter((p) => selectedIds.has(p.id));
  const allFilteredSelected =
    filteredProducts.length > 0 && filteredProducts.every((p) => selectedIds.has(p.id));

  const formatVND = (val: number) => val.toLocaleString('vi-VN') + ' ₫';

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
      if (allFilteredSelected) {
        filteredProducts.forEach((p) => next.delete(p.id));
      } else {
        filteredProducts.forEach((p) => next.add(p.id));
      }
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
    setBulkBrand('');
    setBulkCategory('');
    setBulkPricePercent(0);
    setIsBulkEditOpen(true);
  };

  const handleBulkEditSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    selectedProducts.forEach((p) => {
      let selling = p.sellingPrice;
      if (bulkPricePercent !== 0) {
        selling = Math.max(0, Math.round(p.sellingPrice * (1 + bulkPricePercent / 100)));
      }
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

  // ── Form thêm / sửa 1 sản phẩm ──────────────────────────────────────────────
  const nextAutoSku = (offset = 0) => {
    const lastNum = products.reduce((max, p) => {
      const match = p.sku.match(/SP(\d+)/);
      if (match) {
        const num = parseInt(match[1], 10);
        return num > max ? num : max;
      }
      return max;
    }, 0);
    return `SP${String(lastNum + 1 + offset).padStart(5, '0')}`;
  };

  const handleOpenAddForm = () => {
    setEditingProduct(null);
    setSku(nextAutoSku());
    setName('');
    setBrand('');
    setCategory(categories[0] || 'Nước giải khát');
    setUnit('Cái');
    setCostPrice(0);
    setSellingPrice(0);
    setStock(0);
    setMinStock(5);
    setCustomCategory('');
    setFormError('');
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (p: Product) => {
    setEditingProduct(p);
    setSku(p.sku);
    setName(p.name);
    setBrand(p.brand || '');
    setCategory(p.category);
    setUnit(p.unit);
    setCostPrice(p.costPrice);
    setSellingPrice(p.sellingPrice);
    setStock(p.stock);
    setMinStock(p.minStock);
    setCustomCategory('');
    setFormError('');
    setIsFormOpen(true);
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Vui lòng nhập tên sản phẩm.');
      return;
    }
    if (costPrice < 0 || sellingPrice < 0) {
      setFormError('Giá nhập và giá bán không được là số âm.');
      return;
    }
    if (costPrice > sellingPrice && sellingPrice > 0) {
      setFormError('Cảnh báo: Giá nhập cao hơn giá bán (Bán lỗ!).');
    }

    const finalCategory = category === 'new-cat' ? (customCategory.trim() || 'Khác') : category;

    const productPayload: Product = {
      id: editingProduct ? editingProduct.id : `prod-${Date.now()}`,
      sku,
      name,
      brand: brand.trim(),
      category: finalCategory,
      unit,
      costPrice: Number(costPrice),
      sellingPrice: Number(sellingPrice),
      stock: Number(stock),
      minStock: Number(minStock),
      hidden: editingProduct ? editingProduct.hidden : false,
    };

    if (editingProduct) {
      onUpdateProduct(productPayload);
    } else {
      onAddProduct(productPayload);
    }

    setIsFormOpen(false);
  };

  const handleRestockSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!restockProduct) return;
    onRestockProduct(restockProduct.id, Number(restockAmount));
    setRestockProduct(null);
  };

  // ── Excel: Xuất / Nhập / Tải mẫu ────────────────────────────────────────────
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
    }));

  const downloadSheet = (rows: any[], filename: string) => {
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 }, { wch: 34 }, { wch: 16 }, { wch: 20 },
      { wch: 12 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 8 }, { wch: 16 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sản phẩm');
    XLSX.writeFile(wb, filename);
  };

  const handleExport = () => {
    const today = new Date().toISOString().slice(0, 10);
    // Xuất đúng danh sách đang lọc/hiển thị để bạn chủ động chọn
    downloadSheet(buildRows(filteredProducts.length ? filteredProducts : products), `danh-sach-san-pham-${today}.xlsx`);
  };

  const handleDownloadTemplate = () => {
    const sample = [{
      [COL.sku]: 'SP00099',
      [COL.name]: 'Tên sản phẩm ví dụ',
      [COL.brand]: 'Nhãn hiệu',
      [COL.category]: 'Nước giải khát',
      [COL.cost]: 6500,
      [COL.price]: 10000,
      [COL.stock]: 100,
      [COL.min]: 20,
      [COL.unit]: 'Chai',
      [COL.hidden]: '',
    }];
    downloadSheet(sample, 'mau-nhap-san-pham.xlsx');
  };

  const num = (v: any) => {
    const n = Number(String(v ?? '').replace(/[^\d.-]/g, ''));
    return isNaN(n) ? 0 : n;
  };
  const pick = (row: Record<string, any>, ...keys: string[]) => {
    for (const k of keys) {
      if (row[k] !== undefined && row[k] !== '') return row[k];
    }
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

      let added = 0;
      let updated = 0;
      let skipped = 0;

      rows.forEach((row, i) => {
        const nm = String(pick(row, COL.name, 'name', 'Tên')).trim();
        if (!nm) { skipped++; return; }

        const rawSku = String(pick(row, COL.sku, 'sku', 'SKU')).trim();
        const existing = rawSku
          ? products.find((p) => p.sku.toLowerCase() === rawSku.toLowerCase())
          : undefined;

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
        };

        if (existing) {
          onUpdateProduct(payload);
          updated++;
        } else {
          onAddProduct(payload);
          added++;
        }
      });

      alert(
        `Nhập Excel hoàn tất!\n` +
        `• Thêm mới: ${added}\n` +
        `• Cập nhật (trùng mã SKU): ${updated}\n` +
        (skipped ? `• Bỏ qua (thiếu tên): ${skipped}` : '')
      );
    } catch (err) {
      console.error(err);
      alert('Không đọc được file. Hãy dùng file .xlsx đúng định dạng (tải mẫu để tham khảo).');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-6">
      {/* Thanh tiêu đề + công cụ */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Quản lý kho hàng</h1>
          <p className="text-slate-500 text-sm mt-1">Cập nhật hàng hóa, chỉnh sửa đơn giá, nhập hàng kho và theo dõi định mức tồn kho an toàn.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold px-3 py-2.5 rounded-lg text-xs transition cursor-pointer"
            title="Tải file Excel mẫu để nhập"
          >
            <FileSpreadsheet className="w-4 h-4" /> Tải mẫu
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-1.5 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 text-emerald-700 font-bold px-3 py-2.5 rounded-lg text-xs transition cursor-pointer"
          >
            <Upload className="w-4 h-4" /> Nhập Excel
          </button>
          <button
            onClick={handleExport}
            className="flex items-center justify-center gap-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 font-bold px-3 py-2.5 rounded-lg text-xs transition cursor-pointer"
          >
            <Download className="w-4 h-4" /> Xuất Excel
          </button>
          <button
            onClick={handleOpenAddForm}
            className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-lg text-sm transition-all shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Thêm sản phẩm
          </button>
        </div>
      </div>

      {/* Thẻ thống kê */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">TỔNG SẢN PHẨM</p>
            <p className="text-2xl font-extrabold text-slate-800">{totalProducts}</p>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl">
            <Box className="w-6 h-6 text-slate-500" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs">
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
          <div className={`p-3 rounded-xl ${outOfStockProducts > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'}`}>
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">DƯỚI ĐỊNH MỨC</p>
            <p className="text-2xl font-extrabold text-slate-800">{lowStockProducts}</p>
          </div>
          <div className={`p-3 rounded-xl ${lowStockProducts > 0 ? 'bg-amber-50 text-amber-600' : 'bg-slate-50 text-slate-400'}`}>
            <PackageCheck className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 flex items-center justify-between shadow-xs">
          <div className="space-y-1">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">TỔNG GIÁ TRỊ TỒN KHO</p>
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
        <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
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
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>

            {hiddenCount > 0 && (
              <span className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium border border-amber-200 bg-amber-50 text-amber-700">
                <EyeOff className="w-3.5 h-3.5" />
                {hiddenCount} SP đang ẩn khỏi bán hàng
              </span>
            )}
          </div>

          {/* Lọc theo tồn kho */}
          <div className="flex border border-slate-200 rounded-lg p-1 bg-white shrink-0 self-start sm:self-auto">
            <button
              onClick={() => setStockFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${stockFilter === 'all' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              Tất cả ({totalProducts})
            </button>
            <button
              onClick={() => setStockFilter('out')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${stockFilter === 'out' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-500 hover:text-rose-600'}`}
            >
              Hết hàng ({outOfStockProducts})
            </button>
            <button
              onClick={() => setStockFilter('low')}
              className={`px-3 py-1.5 text-xs font-bold rounded-md transition cursor-pointer ${stockFilter === 'low' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-500 hover:text-amber-600'}`}
            >
              Sắp hết ({lowStockProducts})
            </button>
          </div>
        </div>

        {/* Thanh hành động hàng loạt */}
        <AnimatePresence>
          {selectedProducts.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-blue-50 border-b border-blue-100 overflow-hidden"
            >
              <div className="px-4 py-3 flex flex-wrap items-center gap-3">
                <span className="text-sm font-bold text-blue-800">
                  Đã chọn {selectedProducts.length} sản phẩm
                </span>
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
          {filteredProducts.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              <Box className="w-12 h-12 mx-auto stroke-1 text-slate-300 mb-3" />
              <p className="text-sm font-semibold">Không tìm thấy sản phẩm nào</p>
              <p className="text-xs mt-1">Vui lòng kiểm tra lại từ khóa tìm kiếm hoặc đổi điều kiện lọc.</p>
              {(searchTerm || selectedCategory || stockFilter !== 'all') && (
                <button
                  onClick={() => { setSearchTerm(''); setSelectedCategory(''); setStockFilter('all'); }}
                  className="mt-4 inline-flex items-center gap-1 bg-slate-100 hover:bg-slate-200 text-slate-600 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Khôi phục điều kiện
                </button>
              )}
            </div>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                  <th className="px-4 py-3.5 w-10">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 accent-blue-600 cursor-pointer align-middle"
                      title="Chọn tất cả"
                    />
                  </th>
                  <th className="px-4 py-3.5 font-mono">Mã SP</th>
                  <th className="px-4 py-3.5">Tên / Nhãn hiệu</th>
                  <th className="px-4 py-3.5">Danh mục</th>
                  <th className="px-4 py-3.5 text-right font-mono">Giá Vốn</th>
                  <th className="px-4 py-3.5 text-right font-mono">Giá Bán</th>
                  <th className="px-4 py-3.5 text-center">Tồn Kho</th>
                  <th className="px-4 py-3.5 text-center">ĐVT</th>
                  <th className="px-4 py-3.5 text-right">Thao Tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => {
                  let stockColor = 'text-green-700 bg-green-50 border-green-150';
                  let stockLevel = 'Đủ hàng';
                  if (p.stock === 0) {
                    stockColor = 'text-rose-600 bg-rose-50 border-rose-150';
                    stockLevel = 'Hết hàng';
                  } else if (p.stock <= p.minStock) {
                    stockColor = 'text-amber-600 bg-amber-50 border-amber-200';
                    stockLevel = 'Mức thấp';
                  }

                  const margin = p.sellingPrice > 0
                    ? Math.round(((p.sellingPrice - p.costPrice) / p.sellingPrice) * 100)
                    : 0;

                  const isSelected = selectedIds.has(p.id);

                  return (
                    <tr
                      key={p.id}
                      className={`transition text-sm ${isSelected ? 'bg-blue-50/60' : 'hover:bg-slate-50/55'} ${p.hidden ? 'opacity-55' : ''}`}
                    >
                      <td className="px-4 py-3.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(p.id)}
                          className="w-4 h-4 accent-blue-600 cursor-pointer align-middle"
                        />
                      </td>
                      <td className="px-4 py-3.5 font-mono font-medium text-slate-500 whitespace-nowrap">
                        {p.sku}
                      </td>
                      <td className="px-4 py-3.5 max-w-xs">
                        <div className="font-bold text-slate-800 truncate flex items-center gap-1.5">
                          {p.name}
                          {p.hidden && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 font-bold rounded border border-amber-300 bg-amber-50 text-amber-700">
                              <EyeOff className="w-3 h-3" /> Ẩn khỏi bán hàng
                            </span>
                          )}
                          {!p.hidden && p.stock <= p.minStock && (
                            <span className={`inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 font-bold rounded border ${stockColor}`}>
                              {stockLevel}
                            </span>
                          )}
                        </div>
                        {p.brand && (
                          <span className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-slate-500 font-medium">
                            <Tag className="w-3 h-3 text-slate-400" /> {p.brand}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">
                        <span className="bg-slate-100 text-slate-700 px-2.5 py-1 rounded-lg text-xs font-semibold">
                          {p.category}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-500">
                        {formatVND(p.costPrice)}
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono font-bold text-slate-800">
                        {formatVND(p.sellingPrice)}
                        <span className="block text-[10px] text-slate-400 mt-0.5 italic font-sans font-normal">Lãi: ~{margin}%</span>
                      </td>
                      <td className="px-4 py-3.5 text-center font-semibold text-slate-700">
                        <span className={`px-2.5 py-1 rounded-lg border font-mono ${
                          p.stock === 0 ? 'bg-rose-50 border-rose-100 text-rose-600' : p.stock <= p.minStock ? 'bg-amber-50 border-amber-100 text-amber-600' : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}>
                          {p.stock}
                        </span>
                        <span className="block text-[10px] text-slate-400 mt-1 font-normal">Định mức: {p.minStock}</span>
                      </td>
                      <td className="px-4 py-3.5 text-center text-slate-500 font-medium">
                        {p.unit}
                      </td>
                      <td className="px-4 py-3.5 text-right space-x-1 whitespace-nowrap">
                        <button
                          onClick={() => { setRestockProduct(p); setRestockAmount(10); }}
                          className="px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-lg transition inline-flex items-center gap-1 cursor-pointer"
                          title="Nhập hàng nhanh"
                        >
                          <ArrowUpRight className="w-3.5 h-3.5" /> Nhập kho
                        </button>
                        <button
                          onClick={() => onUpdateProduct({ ...p, hidden: !p.hidden })}
                          className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition inline-flex items-center cursor-pointer"
                          title={p.hidden ? 'Hiện lại trên màn Bán hàng' : 'Ẩn khỏi màn Bán hàng'}
                        >
                          {p.hidden ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleOpenEditForm(p)}
                          className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition inline-flex items-center cursor-pointer"
                          title="Chỉnh sửa sản phẩm"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Bạn chắc chắn muốn xóa sản phẩm "${p.name}" khỏi danh mục kinh doanh không?`)) {
                              onDeleteProduct(p.id);
                            }
                          }}
                          className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition inline-flex items-center cursor-pointer"
                          title="Xóa sản phẩm"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Modal Thêm / Sửa sản phẩm */}
      <AnimatePresence>
        {isFormOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-xl overflow-hidden flex flex-col"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-800 text-base">
                  {editingProduct ? 'Chỉnh sửa sản phẩm' : 'Thêm mới hàng hóa'}
                </h3>
                <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer">✕</button>
              </div>

              <form onSubmit={handleSaveProduct} className="p-5 space-y-4 overflow-y-auto max-h-[80vh]">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-1">MÃ SKU / MÃ SP</label>
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

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1 flex items-center gap-1"><Tag className="w-3 h-3" /> NHÃN HIỆU / THƯƠNG HIỆU</label>
                  <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="VD: Coca-Cola, Hảo Hảo, TH..."
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-slate-500/10 focus:border-slate-400 outline-none transition" />
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
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden flex flex-col"
            >
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
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden"
            >
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
