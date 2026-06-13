/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { Product, Invoice } from '../types';
import { uploadProductImage } from '../lib/db';
import {
  Plus, Search, Edit2, Trash2, Box, ArrowUpRight,
  AlertTriangle, RotateCcw, PackageCheck, PackageX, DollarSign,
  Eye, EyeOff, Download, Upload, FileSpreadsheet, Tag, Pencil,
  ChevronDown, Copy, ArrowUpDown, ChevronUp,
  X, Ban, Printer, BookOpen, ImageIcon,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type LedgerEditItem = { productId: string; name: string; sku: string; price: number; cost: number; qty: number };

interface InventoryProps {
  products: Product[];
  onAddProduct: (product: Product) => void;
  onUpdateProduct: (product: Product) => void;
  onDeleteProduct: (id: string) => void;
  onRestockProduct: (id: string, amount: number) => void;
  invoices?: Invoice[];
  onUpdateInvoice?: (inv: Invoice) => Promise<void>;
  onPrintInvoice?: (inv: Invoice) => void;
  onUpdateProductsStock?: (updates: { id: string; delta: number }[]) => Promise<void> | void;
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
  onRestockProduct,
  invoices = [],
  onUpdateInvoice,
  onPrintInvoice,
  onUpdateProductsStock,
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

  // Thẻ kho
  const [expandedTab, setExpandedTab] = useState<'info' | 'ledger'>('info');
  const [ledgerInvoice, setLedgerInvoice] = useState<Invoice | null>(null);
  const [ledgerMode, setLedgerMode] = useState<'view' | 'edit' | 'confirming-cancel'>('view');
  const [ledgerSaving, setLedgerSaving] = useState(false);
  const [ledgerError, setLedgerError] = useState('');
  const [lEditName, setLEditName] = useState('');
  const [lEditPhone, setLEditPhone] = useState('');
  const [lEditPm, setLEditPm] = useState('CASH');
  const [lEditDisc, setLEditDisc] = useState(0);
  const [lEditItems, setLEditItems] = useState<LedgerEditItem[]>([]);

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
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [imageUploading, setImageUploading] = useState(false);

  // Trường form "Sửa nhóm"
  const [bulkBrand, setBulkBrand] = useState('');
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkPricePercent, setBulkPricePercent] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

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
  const PM_LABEL_INV: Record<string, string> = { CASH: 'Tiền mặt', QR: 'VietQR CK', CARD: 'Quẹt thẻ' };

  // ── Thẻ kho — tính tồn cuối cho sản phẩm đang mở rộng ───────────────────────
  const ledgerEntries = useMemo(() => {
    if (!expandedId) return [];
    const ep = products.find(pr => pr.id === expandedId);
    if (!ep) return [];
    // Lấy TẤT CẢ giao dịch kể cả đã hủy
    const allEntries: { inv: Invoice; qty: number; unitPrice: number; cancelled: boolean }[] = [];
    invoices.forEach(inv => {
      const isCancelled = (inv.status ?? 'completed') === 'cancelled';
      const item = inv.items.find(it => it.product.id === expandedId);
      if (item) allEntries.push({ inv, qty: item.quantity, unitPrice: item.product.sellingPrice, cancelled: isCancelled });
    });
    allEntries.sort((a, b) => new Date(b.inv.timestamp).getTime() - new Date(a.inv.timestamp).getTime());
    // Đi ngược từ tồn kho hiện tại, chỉ tính tồn cuối cho giao dịch KHÔNG hủy
    let running = ep.stock;
    const result = allEntries.map(e => {
      if (e.cancelled) return { ...e, tonCuoi: null as number | null };
      const tonCuoi: number | null = running;
      running += e.qty;
      return { ...e, tonCuoi };
    });
    return result.reverse();
  }, [invoices, expandedId, products]);

  function openLedgerInvoice(inv: Invoice) {
    setLedgerInvoice(inv); setLedgerMode('view'); setLedgerError('');
  }

  function openLedgerEdit() {
    if (!ledgerInvoice) return;
    setLEditName(ledgerInvoice.customerName ?? '');
    setLEditPhone(ledgerInvoice.customerPhone ?? '');
    setLEditPm(ledgerInvoice.paymentMethod);
    setLEditDisc(ledgerInvoice.discountPercent);
    setLEditItems(ledgerInvoice.items.map(it => ({
      productId: it.product.id, name: it.product.name, sku: it.product.sku,
      price: it.product.sellingPrice, cost: it.product.costPrice, qty: it.quantity,
    })));
    setLedgerError('');
    setLedgerMode('edit');
  }

  function addLedgerEditProduct(productId: string) {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    const idx = lEditItems.findIndex(it => it.productId === productId);
    if (idx >= 0) {
      setLEditItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: it.qty + 1 } : it));
    } else {
      setLEditItems(prev => [...prev, { productId: prod.id, name: prod.name, sku: prod.sku, price: prod.sellingPrice, cost: prod.costPrice, qty: 1 }]);
    }
  }

  async function doLedgerCancel() {
    if (!ledgerInvoice || !onUpdateInvoice) return;
    setLedgerSaving(true); setLedgerError('');
    try {
      const updated = { ...ledgerInvoice, status: 'cancelled' as const };
      await onUpdateInvoice(updated);
      setLedgerInvoice(updated);
      setLedgerMode('view');
    } catch (e: any) {
      setLedgerError(e?.message ?? 'Lỗi khi hủy hóa đơn');
    } finally {
      setLedgerSaving(false);
    }
  }

  async function saveLedgerEdit() {
    if (!ledgerInvoice || !onUpdateInvoice) return;
    const valid = lEditItems.filter(it => it.qty > 0);
    if (!valid.length) { setLedgerError('Cần ít nhất 1 sản phẩm'); return; }
    setLedgerSaving(true); setLedgerError('');
    try {
      if (onUpdateProductsStock) {
        const oldMap = new Map(ledgerInvoice.items.map(it => [it.product.id, it.quantity]));
        const newMap = new Map(valid.map(it => [it.productId, it.qty]));
        const deltas: { id: string; delta: number }[] = [];
        oldMap.forEach((oldQty, id) => {
          const newQty = newMap.get(id) ?? 0;
          if (oldQty !== newQty) deltas.push({ id, delta: oldQty - newQty });
        });
        newMap.forEach((newQty, id) => {
          if (!oldMap.has(id)) deltas.push({ id, delta: -newQty });
        });
        if (deltas.length) await onUpdateProductsStock(deltas);
      }
      const lTotal = valid.reduce((s, it) => s + it.price * it.qty, 0);
      const lDiscAmt = Math.round(lTotal * lEditDisc / 100);
      const updated: Invoice = {
        ...ledgerInvoice,
        customerName: lEditName.trim() || undefined,
        customerPhone: lEditPhone.trim() || undefined,
        paymentMethod: lEditPm as 'CASH' | 'QR' | 'CARD',
        discountPercent: lEditDisc,
        discountAmount: lDiscAmt,
        totalAmount: lTotal,
        finalAmount: lTotal - lDiscAmt,
        isAdjusted: true,
        items: valid.map(it => {
          const orig = ledgerInvoice.items.find(x => x.product.id === it.productId);
          if (orig) return { ...orig, quantity: it.qty };
          const prod = products.find(p => p.id === it.productId)!;
          return { product: prod, quantity: it.qty };
        }),
      };
      await onUpdateInvoice(updated);
      setLedgerInvoice(updated);
      setLedgerMode('view');
    } catch (e: any) {
      setLedgerError(e?.message ?? 'Lỗi khi lưu');
    } finally {
      setLedgerSaving(false);
    }
  }

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
    setImageFile(null); setImagePreview('');
    setIsFormOpen(true);
  };

  const handleOpenEditForm = (p: Product) => {
    setEditingProduct(p);
    setSku(p.sku); setName(p.name); setBrand(p.brand || ''); setBarcode(p.barcode || '');
    setCategory(p.category); setUnit(p.unit); setCostPrice(p.costPrice);
    setSellingPrice(p.sellingPrice); setStock(p.stock); setMinStock(p.minStock);
    setCustomCategory(''); setFormError('');
    setImageFile(null); setImagePreview(p.imageUrl ?? '');
    setIsFormOpen(true);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    if (!name.trim()) { setFormError('Vui lòng nhập tên sản phẩm.'); return; }
    if (costPrice < 0 || sellingPrice < 0) { setFormError('Giá nhập và giá bán không được là số âm.'); return; }
    if (costPrice > sellingPrice && sellingPrice > 0) setFormError('Cảnh báo: Giá nhập cao hơn giá bán (Bán lỗ!).');

    const finalCategory = category === 'new-cat' ? (customCategory.trim() || 'Khác') : category;
    const productId = editingProduct ? editingProduct.id : `prod-${Date.now()}`;

    let imageUrl: string | undefined = editingProduct?.imageUrl;
    if (imageFile) {
      try {
        setImageUploading(true);
        imageUrl = await uploadProductImage(imageFile, productId);
      } catch {
        setFormError('Lỗi tải ảnh lên. Vui lòng thử lại.');
        setImageUploading(false);
        return;
      } finally {
        setImageUploading(false);
      }
    }

    const productPayload: Product = {
      id: productId,
      sku, name, brand: brand.trim(), barcode: barcode.trim() || undefined,
      category: finalCategory, unit,
      costPrice: Number(costPrice), sellingPrice: Number(sellingPrice),
      stock: Number(stock), minStock: Number(minStock),
      hidden: editingProduct ? editingProduct.hidden : false,
      imageUrl,
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
        <div className="p-4 border-b border-slate-200 bg-zinc-800/20 flex flex-col md:flex-row md:items-center justify-between gap-3">
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
                  <th className="px-3 py-3 w-10 text-center text-zinc-400 text-xs font-bold uppercase tracking-wider">#</th>
                  <th className="px-2 py-3.5 w-12 text-center text-zinc-400 text-xs font-bold uppercase">Ảnh</th>
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
                {sortedProducts.map((p, idx) => {
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
                        className={`transition text-sm cursor-pointer ${isSelected ? 'bg-blue-900/20' : isExpanded ? 'bg-amber-950/30' : 'hover:bg-zinc-800/40'} ${p.hidden ? 'opacity-55' : ''}`}
                        onClick={() => { if (isExpanded) { setExpandedId(null); } else { setExpandedId(p.id); setExpandedTab('info'); } }}
                      >
                        <td className="px-4 py-3.5" onClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={isSelected} onChange={() => toggleSelect(p.id)}
                            className="w-4 h-4 accent-blue-600 cursor-pointer align-middle" />
                        </td>
                        <td className="px-3 py-3 text-center text-zinc-500 text-xs">{idx + 1}</td>
                        <td className="px-2 py-2 text-center">
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name} className="w-9 h-9 object-cover rounded-md border border-slate-200 mx-auto" />
                          ) : (
                            <div className="w-9 h-9 rounded-md border border-dashed border-slate-300 bg-slate-50 flex items-center justify-center mx-auto">
                              <ImageIcon className="w-4 h-4 text-slate-300" />
                            </div>
                          )}
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
                        <tr className="bg-zinc-900">
                          <td colSpan={11} className="px-5 py-4 border-t border-zinc-700" onClick={e => e.stopPropagation()}>
                            {/* Tab bar */}
                            <div className="flex border-b border-zinc-700 mb-4">
                              <button onClick={() => setExpandedTab('info')} className={`px-4 py-2 text-xs font-bold transition border-b-2 -mb-px ${expandedTab === 'info' ? 'border-amber-400 text-amber-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}>Thông tin</button>
                              <button onClick={() => setExpandedTab('ledger')} className={`px-4 py-2 text-xs font-bold transition border-b-2 -mb-px flex items-center gap-1.5 ${expandedTab === 'ledger' ? 'border-amber-400 text-amber-400' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}><BookOpen className="w-3.5 h-3.5" /> Thẻ kho</button>
                            </div>
                            {expandedTab === 'info' && (
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
                            )}
                            {expandedTab === 'ledger' && (
                              <div>
                                {ledgerEntries.length === 0 ? (
                                  <div className="text-center py-10 text-zinc-500">
                                    <BookOpen className="w-8 h-8 mx-auto stroke-1 mb-3" />
                                    <p className="text-xs font-semibold">Chưa có giao dịch bán nào cho sản phẩm này</p>
                                  </div>
                                ) : (
                                  <div className="overflow-x-auto rounded-xl border border-zinc-700">
                                    <table className="w-full text-xs text-left">
                                      <thead className="bg-zinc-800 border-b border-zinc-700 text-zinc-400 uppercase tracking-wider font-bold">
                                        <tr>
                                          <th className="px-3 py-2">Chứng từ</th>
                                          <th className="px-3 py-2">Thời gian</th>
                                          <th className="px-3 py-2">Khách hàng</th>
                                          <th className="px-3 py-2 text-center">HTTT</th>
                                          <th className="px-3 py-2 text-right">Giá GD</th>
                                          <th className="px-3 py-2 text-right">Giảm giá</th>
                                          <th className="px-3 py-2 text-right">Số lượng</th>
                                          <th className="px-3 py-2 text-right">Tồn cuối</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-zinc-800">
                                        {ledgerEntries.map(({ inv, qty, unitPrice, tonCuoi, cancelled }) => (
                                            <tr key={inv.id} className={`transition ${cancelled ? 'opacity-40 bg-rose-950/10' : 'hover:bg-zinc-800/40'}`}>
                                              <td className="px-3 py-2.5">
                                                <button onClick={() => openLedgerInvoice(inv)}
                                                  className={`font-mono font-bold hover:underline cursor-pointer ${cancelled ? 'text-rose-400 line-through' : 'text-amber-400 hover:text-amber-300'}`}>
                                                  {inv.id}
                                                </button>
                                                {cancelled && <span className="ml-1.5 text-[9px] text-rose-400 font-bold border border-rose-700/60 rounded px-1 py-0.5 bg-rose-950/40">ĐÃ HỦY</span>}
                                              </td>
                                              <td className="px-3 py-2.5 text-zinc-400 whitespace-nowrap font-mono">
                                                {new Date(inv.timestamp).toLocaleDateString('vi-VN')} {new Date(inv.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                                              </td>
                                              <td className="px-3 py-2.5 text-zinc-300">
                                                {inv.customerName || <span className="text-zinc-500 italic">Khách lẻ</span>}
                                              </td>
                                              <td className="px-3 py-2.5 text-center text-zinc-400 whitespace-nowrap">
                                                {PM_LABEL_INV[inv.paymentMethod] ?? inv.paymentMethod}
                                              </td>
                                              <td className={`px-3 py-2.5 text-right font-mono ${cancelled ? 'text-zinc-600 line-through' : 'text-amber-400'}`}>{formatVND(unitPrice)}</td>
                                              <td className="px-3 py-2.5 text-right font-mono text-zinc-400">
                                                {inv.discountPercent > 0 ? `${inv.discountPercent}%` : inv.discountAmount > 0 ? formatVND(inv.discountAmount) : '—'}
                                              </td>
                                              <td className={`px-3 py-2.5 text-right font-mono font-bold ${cancelled ? 'text-zinc-600 line-through' : 'text-rose-400'}`}>−{qty}</td>
                                              <td className="px-3 py-2.5 text-right font-mono font-bold text-emerald-400">
                                                {tonCuoi !== null ? tonCuoi : <span className="text-zinc-600">—</span>}
                                              </td>
                                            </tr>
                                          ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}
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
              className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-4xl overflow-hidden flex flex-col">
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

                {/* Hình ảnh sản phẩm */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">HÌNH ẢNH SẢN PHẨM</label>
                  <div className="flex items-center gap-4">
                    {imagePreview ? (
                      <div className="relative w-20 h-20 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 flex-shrink-0">
                        <img src={imagePreview} alt="preview" className="w-full h-full object-cover" />
                        <button type="button"
                          onClick={() => { setImageFile(null); setImagePreview(''); if (imageInputRef.current) imageInputRef.current.value = ''; }}
                          className="absolute top-0.5 right-0.5 bg-rose-500 hover:bg-rose-600 text-white rounded-full p-0.5 cursor-pointer transition">
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center flex-shrink-0 text-slate-300">
                        <ImageIcon className="w-7 h-7" />
                        <span className="text-[10px] mt-1">Chưa có ảnh</span>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <button type="button" onClick={() => imageInputRef.current?.click()}
                        className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 rounded-lg text-xs text-slate-600 hover:bg-slate-50 cursor-pointer transition font-medium">
                        <Upload className="w-3.5 h-3.5" /> {imagePreview ? 'Đổi ảnh' : 'Tải ảnh lên'}
                      </button>
                      <p className="text-[10px] text-slate-400">JPG, PNG, WEBP · Tối đa 5 MB</p>
                    </div>
                    <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) { setImageFile(f); setImagePreview(URL.createObjectURL(f)); }
                      }} />
                  </div>
                </div>

                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 text-xs font-medium">{formError}</div>
                )}

                <div className="pt-4 border-t border-slate-200 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsFormOpen(false)} className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition cursor-pointer">Hủy</button>
                  <button type="submit" disabled={imageUploading} className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold transition cursor-pointer">
                    {imageUploading ? 'Đang tải ảnh...' : 'Lưu sản phẩm'}
                  </button>
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
              className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-3xl overflow-hidden flex flex-col">
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

      {/* Modal xem hóa đơn từ Thẻ kho */}
      <AnimatePresence>
        {ledgerInvoice && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]"
            onClick={() => { if (!ledgerSaving) { setLedgerInvoice(null); setLedgerMode('view'); } }}>
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto shadow-2xl"
              onClick={e => e.stopPropagation()}>

              {ledgerMode !== 'edit' ? (
                // VIEW / CANCEL CONFIRM
                <>
                  <div className="sticky top-0 bg-zinc-900 px-5 py-4 border-b border-zinc-700 flex items-center justify-between z-10">
                    <div>
                      <p className="text-[10px] text-zinc-500 uppercase font-bold tracking-wider mb-0.5">Hóa đơn</p>
                      <h3 className="font-mono font-bold text-amber-400 text-lg">{ledgerInvoice.id}</h3>
                      <p className="text-xs text-zinc-500 font-mono">{new Date(ledgerInvoice.timestamp).toLocaleString('vi-VN')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {(ledgerInvoice.status ?? 'completed') === 'cancelled'
                        ? <span className="text-xs font-bold text-rose-400 border border-rose-700 rounded-lg px-2.5 py-1">Đã hủy</span>
                        : <span className="text-xs font-bold text-emerald-400 border border-emerald-700 rounded-lg px-2.5 py-1">Hoàn thành</span>}
                      <button onClick={() => { setLedgerInvoice(null); setLedgerMode('view'); }}
                        className="text-zinc-500 hover:text-zinc-300 p-1.5 rounded-lg hover:bg-zinc-800 transition cursor-pointer">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold mb-0.5">Khách hàng</p>
                        <p className="font-semibold text-amber-300 text-sm">{ledgerInvoice.customerName || 'Khách lẻ'}</p>
                        {ledgerInvoice.customerPhone && <p className="text-xs text-zinc-500 font-mono">{ledgerInvoice.customerPhone}</p>}
                      </div>
                      <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold mb-0.5">Hình thức TT</p>
                        <p className="font-semibold text-amber-300 text-sm">{PM_LABEL_INV[ledgerInvoice.paymentMethod] ?? ledgerInvoice.paymentMethod}</p>
                      </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-zinc-700">
                      <table className="w-full text-xs text-left">
                        <thead className="bg-zinc-800 border-b border-zinc-700 text-zinc-400 uppercase font-bold tracking-wider">
                          <tr>
                            <th className="px-3 py-2">Hàng hóa</th>
                            <th className="px-3 py-2 text-center">SL</th>
                            <th className="px-3 py-2 text-right">Đơn giá</th>
                            <th className="px-3 py-2 text-right">Thành tiền</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800">
                          {ledgerInvoice.items.map((it, i) => (
                            <tr key={i} className={`${it.product.id === expandedId ? 'bg-amber-950/20' : 'bg-zinc-900'}`}>
                              <td className="px-3 py-2">
                                <p className="font-semibold text-amber-400">{it.product.name}</p>
                                <p className="text-[10px] text-zinc-500 font-mono">{it.product.sku}</p>
                              </td>
                              <td className="px-3 py-2 text-center font-bold text-amber-300">{it.quantity}</td>
                              <td className="px-3 py-2 text-right font-mono text-zinc-400">{formatVND(it.product.sellingPrice)}</td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-amber-400">{formatVND(it.product.sellingPrice * it.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 space-y-1.5">
                      <div className="flex justify-between text-zinc-400 text-xs">
                        <span>Tổng tiền hàng</span>
                        <span className="font-mono">{formatVND(ledgerInvoice.totalAmount)}</span>
                      </div>
                      {ledgerInvoice.discountAmount > 0 && (
                        <div className="flex justify-between text-emerald-400 text-xs">
                          <span>Giảm giá {ledgerInvoice.discountPercent > 0 ? `(${ledgerInvoice.discountPercent}%)` : ''}</span>
                          <span className="font-mono">−{formatVND(ledgerInvoice.discountAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-amber-400 font-bold border-t border-zinc-700 pt-1.5">
                        <span className="text-sm">Thành tiền</span>
                        <span className="font-mono text-base">{formatVND(ledgerInvoice.finalAmount)}</span>
                      </div>
                    </div>

                    {ledgerInvoice.notes && (
                      <div className="bg-zinc-800 border border-zinc-600 rounded-xl px-4 py-2.5">
                        <p className="text-[10px] text-zinc-500 uppercase font-bold mb-0.5">Ghi chú</p>
                        <p className="text-sm text-zinc-300">{ledgerInvoice.notes}</p>
                      </div>
                    )}

                    {ledgerMode === 'confirming-cancel' && (
                      <div className="bg-rose-950/30 border border-rose-800 rounded-xl px-4 py-3 space-y-3">
                        <p className="text-sm font-bold text-rose-300">Xác nhận hủy hóa đơn {ledgerInvoice.id}?</p>
                        <p className="text-xs text-rose-400/70">Lưu ý: Tồn kho sẽ KHÔNG được cộng lại tự động khi hủy.</p>
                        {ledgerError && <p className="text-xs text-rose-400 font-medium">{ledgerError}</p>}
                        <div className="flex gap-2 justify-end">
                          <button onClick={() => setLedgerMode('view')} disabled={ledgerSaving}
                            className="px-3 py-1.5 border border-zinc-600 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs font-bold transition cursor-pointer">
                            Quay lại
                          </button>
                          <button onClick={doLedgerCancel} disabled={ledgerSaving}
                            className="px-4 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-xs font-bold transition cursor-pointer flex items-center gap-1.5">
                            {ledgerSaving ? 'Đang xử lý...' : <><Ban className="w-3.5 h-3.5" /> Xác nhận hủy</>}
                          </button>
                        </div>
                      </div>
                    )}

                    {(ledgerInvoice.status ?? 'completed') !== 'cancelled' && ledgerMode === 'view' && (
                      <div className="flex flex-wrap gap-2 pt-1 border-t border-zinc-700">
                        {onPrintInvoice && (
                          <button onClick={() => onPrintInvoice(ledgerInvoice)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-bold rounded-lg transition cursor-pointer">
                            <Printer className="w-3.5 h-3.5" /> In hóa đơn
                          </button>
                        )}
                        {onUpdateInvoice && (
                          <button onClick={openLedgerEdit}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg transition cursor-pointer">
                            <Edit2 className="w-3.5 h-3.5" /> Điều chỉnh
                          </button>
                        )}
                        {onUpdateInvoice && (
                          <button onClick={() => setLedgerMode('confirming-cancel')}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold rounded-lg transition cursor-pointer">
                            <Ban className="w-3.5 h-3.5" /> Hủy hóa đơn
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                // EDIT MODE
                <div className="p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-zinc-700 pb-3">
                    <h3 className="font-bold text-amber-400">Điều chỉnh: <span className="font-mono">{ledgerInvoice.id}</span></h3>
                    <button onClick={() => setLedgerMode('view')} className="text-zinc-500 hover:text-zinc-300 p-1.5 hover:bg-zinc-800 rounded-lg transition cursor-pointer">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Khách hàng</label>
                      <input value={lEditName} onChange={e => setLEditName(e.target.value)} placeholder="Tên khách"
                        className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-amber-400 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500" />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Số điện thoại</label>
                      <input value={lEditPhone} onChange={e => setLEditPhone(e.target.value)} placeholder="SĐT"
                        className="w-full px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs text-amber-400 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-2">Hình thức thanh toán</label>
                    <div className="flex gap-2">
                      {(['CASH', 'QR', 'CARD'] as const).map(pm => (
                        <button key={pm} onClick={() => setLEditPm(pm)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition cursor-pointer ${lEditPm === pm ? 'bg-amber-500 text-zinc-900 border-amber-500' : 'bg-zinc-800 text-zinc-400 border-zinc-700 hover:border-zinc-500'}`}>
                          {PM_LABEL_INV[pm]}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-zinc-500 uppercase mb-1">Giảm giá (%)</label>
                    <input type="number" min="0" max="100" value={lEditDisc || ''} onChange={e => setLEditDisc(Number(e.target.value))}
                      placeholder="0"
                      className="w-32 px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-xs font-mono text-amber-400 focus:outline-none focus:border-amber-500" />
                  </div>

                  <div className="space-y-2">
                    <p className="text-[10px] font-bold text-zinc-500 uppercase">Hàng hóa</p>
                    {lEditItems.map((it, i) => (
                      <div key={it.productId} className="flex items-center gap-2 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-amber-400 text-xs truncate">{it.name}</p>
                          <p className="text-[10px] text-zinc-500 font-mono">{it.sku}</p>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={() => setLEditItems(prev => prev.map((x, j) => j === i ? { ...x, qty: Math.max(0, x.qty - 1) } : x))}
                            className="w-6 h-6 bg-zinc-700 hover:bg-zinc-600 rounded text-xs font-bold cursor-pointer text-zinc-300">−</button>
                          <span className="w-8 text-center font-mono font-bold text-amber-400 text-sm">{it.qty}</span>
                          <button onClick={() => setLEditItems(prev => prev.map((x, j) => j === i ? { ...x, qty: x.qty + 1 } : x))}
                            className="w-6 h-6 bg-zinc-700 hover:bg-zinc-600 rounded text-xs font-bold cursor-pointer text-zinc-300">+</button>
                          <button onClick={() => setLEditItems(prev => prev.filter((_, j) => j !== i))}
                            className="w-6 h-6 bg-rose-900/40 hover:bg-rose-900/70 text-rose-400 rounded text-xs cursor-pointer flex items-center justify-center">
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                        <p className="font-mono text-amber-400 text-xs w-24 text-right shrink-0">{formatVND(it.price * it.qty)}</p>
                      </div>
                    ))}
                    <select onChange={e => { if (e.target.value) { addLedgerEditProduct(e.target.value); (e.target as HTMLSelectElement).value = ''; } }}
                      className="w-full px-3 py-1.5 bg-zinc-800 border border-dashed border-zinc-600 rounded-lg text-xs text-zinc-400 focus:outline-none cursor-pointer">
                      <option value="">+ Thêm sản phẩm...</option>
                      {products.filter(p => !p.hidden).map(p => (
                        <option key={p.id} value={p.id}>{p.name} — {formatVND(p.sellingPrice)}</option>
                      ))}
                    </select>
                  </div>

                  {(() => {
                    const t = lEditItems.reduce((s, it) => s + it.price * it.qty, 0);
                    const d = Math.round(t * lEditDisc / 100);
                    return (
                      <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 space-y-1 text-xs">
                        <div className="flex justify-between text-zinc-400">
                          <span>Tổng hàng</span><span className="font-mono">{formatVND(t)}</span>
                        </div>
                        {d > 0 && <div className="flex justify-between text-emerald-400">
                          <span>Giảm giá ({lEditDisc}%)</span><span className="font-mono">−{formatVND(d)}</span>
                        </div>}
                        <div className="flex justify-between text-amber-400 font-bold border-t border-zinc-700 pt-1">
                          <span>Thành tiền</span><span className="font-mono">{formatVND(t - d)}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {ledgerError && <p className="text-xs text-rose-400 font-medium bg-rose-950/30 border border-rose-800/50 rounded-lg px-3 py-2">{ledgerError}</p>}

                  <div className="flex gap-2 justify-end border-t border-zinc-700 pt-3">
                    <button onClick={() => setLedgerMode('view')} disabled={ledgerSaving}
                      className="px-4 py-1.5 border border-zinc-600 text-zinc-400 hover:text-zinc-200 rounded-lg text-xs font-bold transition cursor-pointer">
                      Hủy
                    </button>
                    <button onClick={saveLedgerEdit} disabled={ledgerSaving}
                      className="px-5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer">
                      {ledgerSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                </div>
              )}
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
