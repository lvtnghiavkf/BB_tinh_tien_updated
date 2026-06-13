import React, { useState, useMemo, useRef } from 'react';
import { Product, Partner, PurchaseOrder, PaymentLog } from '../types';
import { Plus, Trash2, X, ArrowDownToLine, ArrowUpFromLine, ChevronsUpDown, Search, Download, ChevronDown, GitBranch, History, Banknote, Building2, Scan, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { insertPaymentLog } from '../lib/db';

interface PurchaseOrdersProps {
  products: Product[];
  partners: Partner[];
  orders: PurchaseOrder[];
  onAdd: (o: PurchaseOrder) => void;
  onUpdate: (o: PurchaseOrder) => void;
  onDelete: (id: string) => void;
  onUpdateProductsStock: (updates: { id: string; delta: number }[]) => void;
  paymentLogs?: PaymentLog[];
  onPaymentLogAdded?: (log: PaymentLog) => void;
}

const formatVND = (v: number) => v.toLocaleString('vi-VN') + ' ₫';

type OrderType = 'all' | 'import' | 'export';
type DraftItem = { productId: string; productName: string; sku: string; quantity: number; unitCost: number; barcodeInput: string };

export default function PurchaseOrders({ products, partners, orders, onAdd, onUpdate, onDelete, onUpdateProductsStock, paymentLogs = [], onPaymentLogAdded }: PurchaseOrdersProps) {
  const [typeFilter, setTypeFilter] = useState<OrderType>('all');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [payingOrder, setPayingOrder] = useState<PurchaseOrder | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payFull, setPayFull] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedTab, setExpandedTab] = useState<Record<string, 'info' | 'history'>>({});
  const [payMethod, setPayMethod] = useState<'bank' | 'cash'>('bank');

  // Create / revise form state
  const [draftType, setDraftType] = useState<'import' | 'export'>('import');
  const [draftPartnerId, setDraftPartnerId] = useState('');
  const [partnerSearch, setPartnerSearch] = useState('');
  const [showPartnerDropdown, setShowPartnerDropdown] = useState(false);
  const [draftDate, setDraftDate] = useState(new Date().toISOString().slice(0, 16));
  const [draftNotes, setDraftNotes] = useState('');
  const [draftItems, setDraftItems] = useState<DraftItem[]>([]);

  // Revision system state
  const [revisingOrder, setRevisingOrder] = useState<PurchaseOrder | null>(null);
  const [reviseNotes, setReviseNotes] = useState('');

  // History detail modal
  const [viewingHistoryOrder, setViewingHistoryOrder] = useState<PurchaseOrder | null>(null);

  const [activeDropdown, setActiveDropdown] = useState<{ idx: number; field: 'name' | 'sku' | 'barcode' } | null>(null);

  // Full-screen create form extras
  const [topSearch, setTopSearch] = useState('');
  const [showTopSearch, setShowTopSearch] = useState(false);
  const [draftDiscount, setDraftDiscount] = useState(0);
  const [draftInitialPay, setDraftInitialPay] = useState(0);
  const [draftInitialPayFull, setDraftInitialPayFull] = useState(false);
  const [draftInitialPayMethod, setDraftInitialPayMethod] = useState<'bank' | 'cash'>('bank');

  const partnerDropdownRef = useRef<HTMLDivElement>(null);

  const filteredPartners = useMemo(() => {
    if (!partnerSearch) return partners;
    const q = partnerSearch.toLowerCase();
    return partners.filter(p =>
      p.fullName.toLowerCase().includes(q) ||
      p.brands.some(b => b.toLowerCase().includes(q))
    );
  }, [partners, partnerSearch]);

  function selectPartner(p: Partner) {
    setDraftPartnerId(p.id);
    setPartnerSearch(`${p.fullName}${p.brands.length ? ' — ' + p.brands.join(', ') : ''}`);
    setShowPartnerDropdown(false);
  }

  const topSearchSuggestions = useMemo(() => {
    const q = topSearch.toLowerCase().trim();
    if (!q) return [];
    return products.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.sku.toLowerCase().includes(q) ||
      (p.barcode && p.barcode.includes(q))
    ).slice(0, 15);
  }, [topSearch, products]);

  function addProductToDraft(productId: string) {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    setDraftItems(prev => {
      const existing = prev.findIndex(it => it.productId === productId);
      if (existing >= 0) {
        return prev.map((it, i) => i === existing ? { ...it, quantity: it.quantity + 1 } : it);
      }
      return [...prev, {
        productId: prod.id, productName: prod.name, sku: prod.sku,
        quantity: 1, unitCost: prod.costPrice, barcodeInput: prod.barcode ?? '',
      }];
    });
    setTopSearch('');
    setShowTopSearch(false);
  }

  function exportExcel() {
    const rows: any[] = [];
    orders.forEach(o => {
      o.items.forEach(it => {
        rows.push({
          'Mã phiếu': o.id, 'Loại': o.type === 'import' ? 'Nhập' : 'Xuất',
          'Đối tác': o.partnerName, 'Ngày': new Date(o.timestamp).toLocaleDateString('vi-VN'),
          'Sản phẩm': it.productName, 'SKU': it.sku, 'Số lượng': it.quantity,
          'Đơn giá': it.unitCost, 'Thành tiền': it.unitCost * it.quantity,
          'Tổng phiếu': o.totalAmount, 'Đã trả': o.paidAmount,
          'Còn nợ': o.totalAmount - o.paidAmount, 'Ghi chú': o.notes ?? '',
          'Phiếu gốc': o.parentId ?? getParentId(o) ?? '',
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Xuất nhập hàng');
    XLSX.writeFile(wb, `xuat_nhap_hang_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  function getParentId(o: PurchaseOrder): string | null {
    if (o.parentId) return o.parentId;
    const dot = o.id.lastIndexOf('.');
    if (dot > 0) return o.id.slice(0, dot);
    return null;
  }

  const orderFamilies = useMemo(() => {
    const revisionMap = new Map<string, PurchaseOrder[]>();
    const rootMap = new Map<string, PurchaseOrder>();
    orders.forEach(o => {
      const pid = getParentId(o);
      if (pid) {
        const arr = revisionMap.get(pid) ?? [];
        arr.push(o);
        revisionMap.set(pid, arr);
      } else {
        rootMap.set(o.id, o);
      }
    });
    const families: Array<{ representative: PurchaseOrder; root: PurchaseOrder; revisions: PurchaseOrder[] }> = [];
    rootMap.forEach((root) => {
      const revs = (revisionMap.get(root.id) ?? []).sort((a, b) => a.id.localeCompare(b.id));
      const representative = revs.length > 0 ? revs[revs.length - 1] : root;
      families.push({ representative, root, revisions: revs });
    });
    families.sort((a, b) => b.representative.timestamp.localeCompare(a.representative.timestamp));
    return families;
  }, [orders]);

  const filteredFamilies = useMemo(() => {
    return orderFamilies.filter(f => {
      const rep = f.representative;
      if (typeFilter !== 'all' && rep.type !== typeFilter) return false;
      if (partnerFilter && rep.partnerId !== partnerFilter) return false;
      return true;
    });
  }, [orderFamilies, typeFilter, partnerFilter]);

  const draftTotal = useMemo(() =>
    draftItems.reduce((s, it) => s + it.quantity * it.unitCost, 0), [draftItems]);

  function resetCreate() {
    setDraftType('import');
    setDraftPartnerId('');
    setPartnerSearch('');
    setShowPartnerDropdown(false);
    setDraftDate(new Date().toISOString().slice(0, 16));
    setDraftNotes('');
    setDraftItems([]);
    setRevisingOrder(null);
    setReviseNotes('');
    setTopSearch('');
    setShowTopSearch(false);
    setDraftDiscount(0);
    setDraftInitialPay(0);
    setDraftInitialPayFull(false);
    setDraftInitialPayMethod('bank');
  }

  function openRevise(o: PurchaseOrder) {
    setRevisingOrder(o);
    setDraftType(o.type);
    const partner = partners.find(p => p.id === o.partnerId);
    if (partner) {
      setDraftPartnerId(partner.id);
      setPartnerSearch(`${partner.fullName}${partner.brands.length ? ' — ' + partner.brands.join(', ') : ''}`);
    } else {
      setDraftPartnerId(o.partnerId);
      setPartnerSearch(o.partnerName);
    }
    setDraftDate(new Date().toISOString().slice(0, 16));
    setDraftNotes(o.notes ?? '');
    setDraftItems(o.items.map(it => ({
      productId: it.productId,
      productName: it.productName,
      sku: it.sku,
      quantity: it.quantity,
      unitCost: it.unitCost,
      barcodeInput: products.find(p => p.id === it.productId)?.barcode ?? '',
    })));
    setReviseNotes('');
    setTopSearch('');
    setShowTopSearch(false);
    setDraftDiscount(0);
    setDraftInitialPay(0);
    setDraftInitialPayFull(false);
    setDraftInitialPayMethod('bank');
    setShowCreate(true);
  }

  function setItemProduct(idx: number, productId: string) {
    const prod = products.find(p => p.id === productId);
    setDraftItems(prev => prev.map((it, i) => i === idx ? {
      ...it,
      productId,
      productName: prod?.name ?? '',
      sku: prod?.sku ?? '',
      unitCost: prod?.costPrice ?? 0,
      barcodeInput: prod?.barcode ?? '',
    } : it));
    setActiveDropdown(null);
  }

  function handleProductNameInput(idx: number, value: string) {
    setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, productName: value, productId: '', sku: '', barcodeInput: '' } : it));
    setActiveDropdown({ idx, field: 'name' });
  }

  function handleSkuInput(idx: number, value: string) {
    setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, sku: value, productId: '', productName: '', barcodeInput: '' } : it));
    setActiveDropdown({ idx, field: 'sku' });
  }

  function handleBarcodeInput(idx: number, value: string) {
    setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, barcodeInput: value, productId: '', productName: '', sku: '' } : it));
    setActiveDropdown({ idx, field: 'barcode' });
  }

  function closeDropdown() { setTimeout(() => setActiveDropdown(null), 160); }

  async function handleCreate() {
    const validItems = draftItems.filter(it => it.productId && it.quantity > 0);
    if (validItems.length === 0) return;
    const partner = partners.find(p => p.id === draftPartnerId);

    let newOrderId: string;
    let finalNotes: string | undefined;

    if (revisingOrder) {
      const rootId = getParentId(revisingOrder) ?? revisingOrder.id;
      const revCount = orders.filter(o => {
        const pid = getParentId(o);
        return pid === rootId;
      }).length;
      newOrderId = `${rootId}.${revCount + 1}`;
      const noteLines = [`[DC: ${revisingOrder.id}]`];
      if (reviseNotes.trim()) noteLines.push(reviseNotes.trim());
      if (draftNotes.trim()) noteLines.push(draftNotes.trim());
      finalNotes = noteLines.join(' — ');
    } else {
      const rnd = Math.floor(10000 + Math.random() * 90000);
      newOrderId = draftType === 'import' ? `NH${rnd}` : `XH${rnd}`;
      finalNotes = draftNotes.trim() || undefined;
    }

    const grossAmount = validItems.reduce((s, it) => s + it.quantity * it.unitCost, 0);
    const netAmount = Math.max(0, grossAmount - draftDiscount);
    const paidAtCreation = draftType === 'import'
      ? (draftInitialPayFull ? netAmount : Math.min(draftInitialPay, netAmount))
      : 0;

    const order: PurchaseOrder = {
      id: newOrderId,
      type: draftType,
      partnerId: draftPartnerId,
      partnerName: partner?.fullName ?? (revisingOrder?.partnerName ?? ''),
      timestamp: new Date(draftDate).toISOString(),
      items: validItems.map(it => ({ productId: it.productId, productName: it.productName, sku: it.sku, quantity: it.quantity, unitCost: it.unitCost })),
      totalAmount: netAmount,
      paidAmount: paidAtCreation,
      notes: finalNotes,
    };

    setSaving(true);
    try {
      await onAdd(order);
      onUpdateProductsStock(validItems.map(it => ({
        id: it.productId,
        delta: draftType === 'import' ? it.quantity : -it.quantity,
      })));
      if (paidAtCreation > 0 && onPaymentLogAdded) {
        const log: PaymentLog = {
          id: `PL${Date.now()}`,
          createdAt: new Date().toISOString(),
          type: 'debt',
          referenceId: newOrderId,
          referenceName: partner?.fullName ?? '',
          amount: paidAtCreation,
          paymentMethod: draftInitialPayMethod,
          remaining: netAmount - paidAtCreation,
        };
        try { await insertPaymentLog(log); onPaymentLogAdded(log); } catch (_) {}
      }
      setShowCreate(false);
      resetCreate();
    } finally {
      setSaving(false);
    }
  }

  function openPay(o: PurchaseOrder) {
    setPayingOrder(o);
    setPayAmount(String(o.totalAmount - o.paidAmount));
    setPayFull(false);
  }

  async function confirmPay() {
    if (!payingOrder) return;
    const remaining = payingOrder.totalAmount - payingOrder.paidAmount;
    const amount = payFull ? remaining : Math.min(Number(payAmount) || 0, remaining);
    if (amount <= 0) return;
    setSaving(true);
    try {
      const newPaid = payingOrder.paidAmount + amount;
      const newRemaining = payingOrder.totalAmount - newPaid;
      await onUpdate({ ...payingOrder, paidAmount: newPaid });
      const log: PaymentLog = {
        id: `PL${Date.now()}`,
        createdAt: new Date().toISOString(),
        type: 'debt',
        referenceId: payingOrder.id,
        referenceName: payingOrder.partnerName,
        amount,
        paymentMethod: payMethod,
        remaining: newRemaining,
      };
      try { await insertPaymentLog(log); if (onPaymentLogAdded) onPaymentLogAdded(log); } catch (_) {}
      setPayingOrder(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch gap-3">
        <div className="flex items-center gap-2 bg-zinc-800 rounded-lg p-1 border border-zinc-700">
          {(['all', 'import', 'export'] as OrderType[]).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${typeFilter === t ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-100'}`}>
              {t === 'all' ? 'Tất cả' : t === 'import' ? '↓ Nhập hàng' : '↑ Xuất hàng'}
            </button>
          ))}
        </div>
        <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}
          className="px-3 py-2 border border-zinc-700 rounded-lg text-sm bg-zinc-800 text-amber-400 focus:outline-none focus:border-blue-500 cursor-pointer">
          <option value="">Tất cả đối tác</option>
          {partners.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
        </select>
        <button onClick={exportExcel}
          className="flex items-center gap-1.5 px-3 py-2 border border-zinc-700 text-zinc-300 hover:bg-zinc-800 rounded-lg text-sm font-bold cursor-pointer transition whitespace-nowrap">
          <Download className="w-4 h-4" /> Xuất Excel
        </button>
        <button onClick={() => { resetCreate(); setShowCreate(true); }}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition cursor-pointer whitespace-nowrap">
          <Plus className="w-4 h-4" /> Tạo phiếu
        </button>
      </div>

      {/* List */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
        {filteredFamilies.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">
            <ChevronsUpDown className="w-10 h-10 mx-auto stroke-1 mb-2 text-zinc-600" />
            <p className="text-sm font-semibold">Chưa có phiếu nào</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-800 border-b border-zinc-700 text-zinc-400 text-xs font-bold uppercase tracking-wider">
                  <th className="px-3 py-3 w-10 text-center">#</th>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Mã phiếu</th>
                  <th className="px-4 py-3 text-center">Loại phiếu</th>
                  <th className="px-4 py-3 text-right">Công nợ</th>
                  <th className="px-4 py-3 text-center">Tình trạng</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filteredFamilies.map(({ representative: o, root, revisions }, familyIdx) => {
          const hasRevisions = revisions.length > 0;
          const remaining = o.totalAmount - o.paidAmount;
          const isOpen = expandedId === o.id;
          const activeTab = expandedTab[o.id] ?? 'info';
          const orderLogs = paymentLogs.filter(l => l.referenceId === o.id || l.referenceId === root.id || revisions.some(r => l.referenceId === r.id));
          return (
            <React.Fragment key={o.id}>
              <tr
                className={`border-b border-zinc-800 cursor-pointer transition-colors ${isOpen ? 'bg-amber-950/20' : 'hover:bg-zinc-800/60'}`}
                onClick={() => setExpandedId(isOpen ? null : o.id)}
              >
                <td className="px-3 py-3 text-center text-zinc-500 text-xs">{familyIdx + 1}</td>
                <td className="px-4 py-3 text-zinc-400 text-xs font-mono whitespace-nowrap">
                  {new Date(o.timestamp).toLocaleDateString('vi-VN')}{' '}
                  {new Date(o.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                </td>
                <td className="px-4 py-3">
                  <p className="font-mono font-bold text-amber-400 text-sm">{o.id}</p>
                  {o.partnerName && <p className="text-[11px] text-zinc-500 mt-0.5">{o.partnerName}</p>}
                  {hasRevisions && <span className="text-[10px] bg-amber-900/40 text-amber-300 border border-amber-700 font-bold px-1.5 py-0.5 rounded mt-0.5 inline-block">Đã điều chỉnh</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${o.type === 'import' ? 'bg-blue-900/40 text-blue-300 border-blue-700' : 'bg-amber-900/40 text-amber-300 border-amber-700'}`}>
                    {o.type === 'import' ? <><ArrowDownToLine className="w-3 h-3" /> Nhập hàng</> : <><ArrowUpFromLine className="w-3 h-3" /> Xuất hàng</>}
                  </span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm">
                  {o.type === 'import' ? (
                    <div>
                      <p className="font-bold text-zinc-100">{formatVND(o.totalAmount)}</p>
                      {remaining > 0 && <p className="text-[11px] text-rose-400 font-bold">Còn: {formatVND(remaining)}</p>}
                    </div>
                  ) : <span className="text-zinc-500">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  {o.type === 'import' ? (
                    remaining > 0
                      ? <span className="px-2 py-0.5 bg-rose-900/40 text-rose-300 border border-rose-700 rounded-md text-[10px] font-bold">Còn nợ</span>
                      : <span className="px-2 py-0.5 bg-emerald-900/40 text-emerald-300 border border-emerald-700 rounded-md text-[10px] font-bold">Đã TT</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-zinc-700/60 text-zinc-300 border border-zinc-600 rounded-md text-[10px] font-bold">Hoàn thành</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-180 text-amber-400' : ''}`} />
                </td>
              </tr>

              <AnimatePresence>
                {isOpen && (
                  <tr className="bg-amber-950/10 border-b border-zinc-800">
                    <td colSpan={7} className="p-0">
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden">
                    <div className="border-t border-zinc-700/50">
                      {/* Tabs */}
                      <div className="flex border-b border-zinc-700 bg-zinc-800/50">
                        {(['info', 'history'] as const).map(tab => (
                          <button key={tab}
                            onClick={e => { e.stopPropagation(); setExpandedTab(prev => ({ ...prev, [o.id]: tab })); }}
                            className={`px-4 py-2 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${activeTab === tab ? 'text-amber-400 border-b-2 border-amber-400 bg-zinc-900/50' : 'text-zinc-400 hover:text-zinc-100'}`}>
                            {tab === 'info' ? <><ChevronsUpDown className="w-3.5 h-3.5" /> Thông tin</> : <><History className="w-3.5 h-3.5" /> Lịch sử ({orderLogs.length + (hasRevisions ? revisions.length : 0)})</>}
                          </button>
                        ))}
                      </div>

                      {activeTab === 'info' && (
                        <div className="px-4 pb-4 pt-3">
                          {o.notes?.startsWith('[DC:') && (
                            <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                              <GitBranch className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                              <span>{o.notes.replace(/^\[DC:[^\]]+\]\s*—?\s*/, '') || 'Phiếu điều chỉnh'}</span>
                            </div>
                          )}
                          <div className="overflow-x-auto -mx-4">
                          <table className="w-full text-xs min-w-[680px] px-4">
                            <thead>
                              <tr className="text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100 bg-slate-50">
                                <th className="px-3 pb-2 pt-1 text-center w-8">STT</th>
                                <th className="px-2 pb-2 pt-1 text-center w-10">Ảnh</th>
                                <th className="px-3 pb-2 pt-1 text-left">Mã SKU</th>
                                <th className="px-3 pb-2 pt-1 text-left">Barcode</th>
                                <th className="px-3 pb-2 pt-1 text-left">Tên hàng</th>
                                <th className="px-3 pb-2 pt-1 text-left">Thương Hiệu</th>
                                <th className="px-3 pb-2 pt-1 text-center">ĐVT</th>
                                <th className="px-3 pb-2 pt-1 text-right">Tồn kho</th>
                                <th className="px-3 pb-2 pt-1 text-right">Giá nhập cũ</th>
                                <th className="px-3 pb-2 pt-1 text-right">Giá bán</th>
                                <th className="px-3 pb-2 pt-1 text-right">SL</th>
                                <th className="px-3 pb-2 pt-1 text-right">Giá nhập</th>
                                <th className="px-3 pb-2 pt-1 text-right">Thành tiền</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                              {o.items.map((it, i) => {
                                const prod = products.find(p => p.id === it.productId);
                                return (
                                  <tr key={i} className="text-slate-700 hover:bg-zinc-800/40">
                                    <td className="px-3 py-2 text-center text-slate-400">{i + 1}</td>
                                    <td className="px-2 py-1.5 text-center">
                                      {prod?.imageUrl ? (
                                        <img src={prod.imageUrl} alt={it.productName} className="w-8 h-8 object-cover rounded-md border border-slate-200 mx-auto" />
                                      ) : (
                                        <div className="w-8 h-8 rounded-md border border-dashed border-slate-300 bg-slate-50 mx-auto" />
                                      )}
                                    </td>
                                    <td className="px-3 py-2">
                                      {it.sku
                                        ? <span className="px-1.5 py-0.5 bg-zinc-800 border border-zinc-600 text-amber-400 font-mono text-[11px] rounded font-bold">{it.sku}</span>
                                        : <span className="text-slate-400">—</span>}
                                    </td>
                                    <td className="px-3 py-2 font-mono text-slate-500 text-xs">
                                      {prod?.barcode
                                        ? <span className="flex items-center gap-1"><Scan className="w-3 h-3 text-slate-400 shrink-0" />{prod.barcode}</span>
                                        : <span className="text-slate-400">—</span>}
                                    </td>
                                    <td className="px-3 py-2 font-medium">{it.productName}</td>
                                    <td className="px-3 py-2 text-slate-500">{prod?.brand || '—'}</td>
                                    <td className="px-3 py-2 text-center text-slate-500">{prod?.unit || '—'}</td>
                                    <td className="px-3 py-2 text-right font-mono text-slate-500">{prod ? prod.stock : '—'}</td>
                                    <td className="px-3 py-2 text-right font-mono text-slate-400">{prod ? formatVND(prod.costPrice) : '—'}</td>
                                    <td className="px-3 py-2 text-right font-mono text-emerald-600">{prod ? formatVND(prod.sellingPrice) : '—'}</td>
                                    <td className="px-3 py-2 text-right font-bold">{it.quantity}</td>
                                    <td className="px-3 py-2 text-right font-mono">{formatVND(it.unitCost)}</td>
                                    <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">{formatVND(it.unitCost * it.quantity)}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot>
                              <tr className="border-t-2 border-slate-200 font-bold text-slate-800 bg-slate-50">
                                <td colSpan={13} className="px-3 pt-2 pb-1 text-right">Tổng cộng:</td>
                                <td className="px-3 pt-2 pb-1 text-right font-mono text-blue-700">{formatVND(o.totalAmount)}</td>
                              </tr>
                            </tfoot>
                          </table>
                          </div>
                          {o.notes && !o.notes.startsWith('[DC:') && <p className="text-xs text-slate-400 mt-2 italic">{o.notes}</p>}
                          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-slate-100">
                            {o.type === 'import' && remaining > 0 && (
                              <button onClick={e => { e.stopPropagation(); openPay(o); }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                                Trả nợ
                              </button>
                            )}
                            <button onClick={e => { e.stopPropagation(); openRevise(o); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                              <GitBranch className="w-3.5 h-3.5" /> Điều chỉnh phiếu
                            </button>
                            <button onClick={e => { e.stopPropagation(); setDeleteConfirm(o.id); }}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                              <Trash2 className="w-3.5 h-3.5" /> Xóa
                            </button>
                          </div>
                        </div>
                      )}

                      {activeTab === 'history' && (
                        <div className="px-4 pb-4 pt-3 space-y-3">
                          {orderLogs.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Lịch sử thanh toán</p>
                              <div className="space-y-1.5">
                                {orderLogs.map(log => (
                                  <div key={log.id} className="flex items-center justify-between bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-2 text-xs">
                                    <div className="flex items-center gap-2">
                                      {log.paymentMethod === 'bank' ? <Building2 className="w-3.5 h-3.5 text-emerald-600" /> : <Banknote className="w-3.5 h-3.5 text-emerald-600" />}
                                      <div>
                                        <p className="font-bold text-slate-700">{log.paymentMethod === 'bank' ? 'Chuyển khoản' : 'Tiền mặt'}</p>
                                        <p className="text-slate-400">{new Date(log.createdAt).toLocaleString('vi-VN')}</p>
                                      </div>
                                    </div>
                                    <div className="text-right">
                                      <p className="font-bold text-emerald-700 font-mono">+{formatVND(log.amount)}</p>
                                      <p className="text-slate-400 font-mono">Còn: {formatVND(log.remaining)}</p>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          {hasRevisions && (
                            <div>
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Lịch sử điều chỉnh</p>
                              <div className="space-y-2">
                                <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs cursor-pointer hover:border-slate-300 transition"
                                  onClick={e => { e.stopPropagation(); setViewingHistoryOrder(root); }}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-bold text-slate-700 font-mono">{root.id}</span>
                                    <span className="text-slate-400">{new Date(root.timestamp).toLocaleDateString('vi-VN')} · Phiếu gốc</span>
                                  </div>
                                  <p className="text-slate-500">{formatVND(root.totalAmount)}{root.notes && !root.notes.startsWith('[DC:') ? ` · ${root.notes}` : ''}</p>
                                  <p className="text-blue-500 mt-0.5 font-semibold">Nhấn để xem chi tiết →</p>
                                </div>
                                {revisions.slice(0, -1).map(rev => (
                                  <div key={rev.id} className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs cursor-pointer hover:border-amber-300 transition"
                                    onClick={e => { e.stopPropagation(); setViewingHistoryOrder(rev); }}>
                                    <div className="flex items-center justify-between mb-1">
                                      <span className="font-bold text-amber-800 font-mono flex items-center gap-1"><GitBranch className="w-3 h-3" />{rev.id}</span>
                                      <span className="text-amber-600">{new Date(rev.timestamp).toLocaleDateString('vi-VN')}</span>
                                    </div>
                                    <p className="text-amber-700">{formatVND(rev.totalAmount)}</p>
                                    {rev.notes?.startsWith('[DC:') && <p className="text-amber-600 mt-0.5">{rev.notes.replace(/^\[DC:[^\]]+\]\s*—?\s*/, '')}</p>}
                                    <p className="text-blue-500 mt-0.5 font-semibold">Nhấn để xem chi tiết →</p>
                                  </div>
                                ))}
                                <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs cursor-pointer hover:border-blue-300 transition"
                                  onClick={e => { e.stopPropagation(); setViewingHistoryOrder(o); }}>
                                  <div className="flex items-center justify-between mb-1">
                                    <span className="font-bold text-blue-800 font-mono flex items-center gap-1"><GitBranch className="w-3 h-3" />{o.id}</span>
                                    <span className="text-blue-600">{new Date(o.timestamp).toLocaleDateString('vi-VN')} · Hiện tại</span>
                                  </div>
                                  <p className="text-blue-700">{formatVND(o.totalAmount)}</p>
                                  {o.notes?.startsWith('[DC:') && <p className="text-blue-600 mt-0.5">{o.notes.replace(/^\[DC:[^\]]+\]\s*—?\s*/, '')}</p>}
                                  <p className="text-blue-500 mt-0.5 font-semibold">Nhấn để xem chi tiết →</p>
                                </div>
                              </div>
                            </div>
                          )}
                          {orderLogs.length === 0 && !hasRevisions && (
                            <p className="text-xs text-zinc-500 text-center py-4">Chưa có lịch sử</p>
                          )}
                        </div>
                      )}
                    </div>
                  </motion.div>
                    </td>
                  </tr>
                )}
              </AnimatePresence>
            </React.Fragment>
          );
        })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Revise Modal — Full Screen */}
      <AnimatePresence>
        {showCreate && (
          <motion.div
            initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
            className="fixed inset-0 bg-zinc-950 z-[200] flex flex-col"
          >
            {/* Header */}
            <div className={`flex items-center gap-3 px-4 py-3 border-b shrink-0 ${revisingOrder ? 'bg-amber-950/30 border-amber-700' : 'bg-zinc-900 border-zinc-700'}`}>
              <button onClick={() => { setShowCreate(false); resetCreate(); }}
                className="flex items-center gap-1 text-zinc-400 hover:text-zinc-100 cursor-pointer transition shrink-0">
                <ArrowLeft className="w-5 h-5" />
              </button>
              <h3 className={`font-bold text-base ${revisingOrder ? 'text-amber-300' : 'text-zinc-100'}`}>
                {revisingOrder ? `Điều chỉnh phiếu ${revisingOrder.id}` : (draftType === 'import' ? 'Nhập hàng' : 'Xuất hàng')}
              </h3>
              {!revisingOrder && (
                <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5 ml-2">
                  {(['import', 'export'] as const).map(t => (
                    <button key={t} onClick={() => setDraftType(t)}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer flex items-center gap-1 ${draftType === t ? (t === 'import' ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white') : 'text-zinc-400 hover:text-zinc-200'}`}>
                      {t === 'import' ? <><ArrowDownToLine className="w-3 h-3" /> Nhập hàng</> : <><ArrowUpFromLine className="w-3 h-3" /> Xuất hàng</>}
                    </button>
                  ))}
                </div>
              )}
              {revisingOrder && <p className="text-xs text-amber-400/70 ml-2">Phiếu gốc giữ nguyên — phiếu điều chỉnh mới sẽ được tạo</p>}
            </div>

            {/* Body — split left/right */}
            <div className="flex flex-1 overflow-hidden">

              {/* LEFT: product search + list */}
              <div className="flex flex-col flex-1 overflow-hidden bg-white">

                {/* Top search */}
                <div className="px-4 pt-6 pb-4 border-b border-slate-200 bg-slate-50 relative z-20 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      value={topSearch}
                      onChange={e => { setTopSearch(e.target.value); setShowTopSearch(true); }}
                      onFocus={() => setShowTopSearch(true)}
                      onBlur={() => setTimeout(() => setShowTopSearch(false), 160)}
                      onKeyDown={e => { if (e.key === 'Enter' && topSearchSuggestions.length > 0) addProductToDraft(topSearchSuggestions[0].id); }}
                      placeholder="Tìm hàng hóa theo mã hoặc tên (Enter để thêm nhanh)"
                      className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-300 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                  {showTopSearch && topSearchSuggestions.length > 0 && (
                    <div className="absolute left-4 right-4 top-full mt-0.5 bg-white border border-slate-200 rounded-xl shadow-xl max-h-72 overflow-y-auto z-30">
                      {topSearchSuggestions.map((p, i) => (
                        <button key={p.id} type="button" onMouseDown={() => addProductToDraft(p.id)}
                          className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition flex items-center gap-3 border-b border-slate-50 last:border-0 ${i === 0 ? 'bg-blue-50/60' : ''}`}>
                          {p.imageUrl
                            ? <img src={p.imageUrl} className="w-9 h-9 rounded object-cover shrink-0 border border-slate-100" />
                            : <div className="w-9 h-9 rounded bg-slate-100 shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{p.name}</p>
                            <p className="text-xs text-slate-400 font-mono">{p.sku}{p.barcode ? ` · ${p.barcode}` : ''}</p>
                          </div>
                          <div className="text-right shrink-0 text-xs">
                            <p className="text-slate-400">Tồn: <span className="font-bold text-slate-700">{p.stock}</span></p>
                            <p className="text-emerald-600 font-mono font-bold">{formatVND(p.sellingPrice)}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Items table */}
                <div className="flex-1 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-100 border-b border-slate-200 z-10">
                      <tr className="text-slate-500 font-bold text-xs uppercase tracking-wider">
                        <th className="px-3 py-2.5 w-10"></th>
                        <th className="px-3 py-2.5 text-center w-10">STT</th>
                        <th className="px-3 py-2.5 text-left">Mã hàng</th>
                        <th className="px-3 py-2.5 text-left">Tên hàng</th>
                        <th className="px-3 py-2.5 text-center">ĐVT</th>
                        <th className="px-3 py-2.5 text-right">Tồn kho</th>
                        <th className="px-3 py-2.5 text-right">Giá vốn</th>
                        <th className="px-3 py-2.5 text-right">Giá bán</th>
                        <th className="px-3 py-2.5 text-right w-28">Số lượng</th>
                        <th className="px-3 py-2.5 text-right w-36">Đơn giá</th>
                        <th className="px-3 py-2.5 text-right w-28">SL cuối</th>
                        <th className="px-3 py-2.5 text-right">Thành tiền</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {draftItems.map((item, idx) => {
                        const prod = products.find(p => p.id === item.productId);
                        return (
                          <tr key={idx} className="hover:bg-blue-50/40 group">
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => setDraftItems(prev => prev.filter((_, i) => i !== idx))}
                                className="text-slate-300 hover:text-rose-500 cursor-pointer opacity-0 group-hover:opacity-100 transition">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                            <td className="px-3 py-2 text-center text-slate-400 text-xs">{idx + 1}</td>
                            <td className="px-3 py-2 font-mono text-blue-600 font-bold text-xs">{item.sku || '—'}</td>
                            <td className="px-3 py-2 text-slate-800 font-medium">{item.productName}</td>
                            <td className="px-3 py-2 text-center text-slate-400 text-xs">{prod?.unit || '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-400 text-xs">{prod ? prod.stock : '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-slate-400 text-xs">{prod ? formatVND(prod.costPrice) : '—'}</td>
                            <td className="px-3 py-2 text-right font-mono text-emerald-600 text-xs">{prod ? formatVND(prod.sellingPrice) : '—'}</td>
                            <td className="px-3 py-2">
                              <input type="number" min={1} step={1} value={item.quantity}
                                onChange={e => setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Math.max(1, Number(e.target.value) || 1) } : it))}
                                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-right focus:outline-none focus:border-blue-500 bg-white font-bold" />
                            </td>
                            <td className="px-3 py-2">
                              <input type="number" min={0} value={item.unitCost}
                                onChange={e => setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, unitCost: Number(e.target.value) || 0 } : it))}
                                className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm text-right font-mono focus:outline-none focus:border-blue-500 bg-white" />
                            </td>
                            <td className="px-3 py-2 text-right">
                              {prod ? (
                                <span className={`font-mono font-bold text-sm ${draftType === 'import' ? 'text-emerald-600' : 'text-rose-500'}`}>
                                  {draftType === 'import' ? prod.stock + item.quantity : prod.stock - item.quantity}
                                </span>
                              ) : <span className="text-slate-400">—</span>}
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">{formatVND(item.quantity * item.unitCost)}</td>
                          </tr>
                        );
                      })}
                      {draftItems.length === 0 && (
                        <tr>
                          <td colSpan={12} className="px-3 py-16 text-center text-slate-400">
                            <Search className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p className="text-sm">Tìm kiếm và chọn sản phẩm ở thanh tìm kiếm phía trên</p>
                            <p className="text-xs text-slate-300 mt-1">Nhấn Enter để thêm nhanh sản phẩm đầu tiên trong gợi ý</p>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Left footer */}
                <div className="border-t border-slate-200 px-4 py-2.5 bg-slate-50 flex items-center justify-between shrink-0">
                  <span className="text-xs text-slate-500">{draftItems.length} sản phẩm</span>
                  <span className="text-sm font-bold text-slate-700">Tổng tiền hàng: <span className="font-mono text-blue-700">{formatVND(draftTotal)}</span></span>
                </div>
              </div>

              {/* RIGHT: order info */}
              <div className="w-80 shrink-0 border-l border-zinc-700 bg-zinc-900 flex flex-col">

                {/* Import/Export selector — aligned with left search bar */}
                <div className="px-4 pt-6 pb-4 border-b border-zinc-700 shrink-0">
                  {!revisingOrder ? (
                    <div className="flex gap-1 bg-zinc-800 rounded-lg p-0.5">
                      {(['import', 'export'] as const).map(t => (
                        <button key={t} onClick={() => setDraftType(t)}
                          className={`flex-1 py-2 rounded-md text-xs font-bold transition cursor-pointer flex items-center justify-center gap-1.5 ${draftType === t ? (t === 'import' ? 'bg-blue-600 text-white' : 'bg-amber-500 text-white') : 'text-zinc-400 hover:text-zinc-200'}`}>
                          {t === 'import' ? <><ArrowDownToLine className="w-3.5 h-3.5" />Nhập hàng</> : <><ArrowUpFromLine className="w-3.5 h-3.5" />Xuất hàng</>}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 bg-amber-950/30 border border-amber-700/50 rounded-lg px-3 py-2">
                      <GitBranch className="w-4 h-4 text-amber-400 shrink-0" />
                      <span className="text-xs text-amber-300 font-bold">Điều chỉnh phiếu {revisingOrder.id}</span>
                    </div>
                  )}
                </div>

                <div className="p-4 space-y-4 flex-1 overflow-y-auto">

                  {/* Partner search */}
                  <div className="relative" ref={partnerDropdownRef}>
                    <label className="text-xs font-bold text-zinc-400 mb-1.5 block">
                      {draftType === 'import' ? 'Nhà cung cấp' : 'Đối tác'} <span className="text-zinc-600">(tùy chọn)</span>
                    </label>
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400 pointer-events-none" />
                      <input
                        value={partnerSearch}
                        onChange={e => { setPartnerSearch(e.target.value); setDraftPartnerId(''); setShowPartnerDropdown(true); }}
                        onFocus={() => setShowPartnerDropdown(true)}
                        placeholder="Tìm nhà cung cấp..."
                        className="w-full pl-8 pr-3 py-2 border border-zinc-600 rounded-lg text-sm bg-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    {showPartnerDropdown && filteredPartners.length > 0 && (
                      <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-52 overflow-y-auto">
                        <div className="p-1">
                          <button type="button" onClick={() => { setDraftPartnerId(''); setPartnerSearch(''); setShowPartnerDropdown(false); }}
                            className="w-full text-left px-3 py-2 text-xs text-slate-400 hover:bg-slate-50 rounded-lg cursor-pointer">
                            — Không chọn đối tác —
                          </button>
                          {filteredPartners.map(p => (
                            <button type="button" key={p.id} onClick={() => selectPartner(p)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 rounded-lg cursor-pointer transition">
                              <span className="font-semibold text-slate-800">{p.fullName}</span>
                              {p.brands.length > 0 && <span className="text-slate-400 text-xs ml-1">— {p.brands.join(', ')}</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {showPartnerDropdown && <div className="fixed inset-0 z-20" onClick={() => setShowPartnerDropdown(false)} />}
                  </div>

                  {/* Mã phiếu */}
                  <div>
                    <label className="text-xs font-bold text-zinc-400 mb-1.5 block">Mã phiếu</label>
                    <p className="px-3 py-2 border border-zinc-700 rounded-lg text-sm bg-zinc-800/50 text-zinc-500 font-mono">
                      {revisingOrder ? revisingOrder.id : 'Tự động'}
                    </p>
                  </div>

                  {/* Ngày giờ */}
                  <div>
                    <label className="text-xs font-bold text-zinc-400 mb-1.5 block">Ngày giờ</label>
                    <input type="datetime-local" value={draftDate} onChange={e => setDraftDate(e.target.value)}
                      className="w-full px-3 py-2 border border-zinc-600 rounded-lg text-sm bg-zinc-800 text-zinc-100 focus:outline-none focus:border-blue-500" />
                  </div>

                  {/* Revise reason */}
                  {revisingOrder && (
                    <div>
                      <label className="text-xs font-bold text-amber-400 mb-1.5 flex items-center gap-1 block">
                        <GitBranch className="w-3.5 h-3.5" /> Lý do điều chỉnh
                      </label>
                      <input value={reviseNotes} onChange={e => setReviseNotes(e.target.value)}
                        className="w-full px-3 py-2 border border-amber-600/50 bg-amber-950/20 rounded-lg text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                        placeholder="VD: Cập nhật số lượng thực nhận..." />
                    </div>
                  )}

                  {/* Summary */}
                  <div className="border-t border-zinc-700 pt-4 space-y-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-zinc-400">Tổng tiền hàng</span>
                      <span className="font-mono font-bold text-zinc-100">{formatVND(draftTotal)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-zinc-400">Giảm giá</span>
                      <input type="number" min={0} value={draftDiscount}
                        onChange={e => { setDraftDiscount(Number(e.target.value) || 0); setDraftInitialPayFull(false); }}
                        className="w-28 px-2 py-1 border border-zinc-600 rounded text-right text-sm font-mono bg-zinc-800 text-zinc-100 focus:outline-none focus:border-blue-500" />
                    </div>
                    {draftType === 'import' && (
                      <>
                        <div className="flex justify-between items-center text-sm border-t border-zinc-700 pt-2">
                          <span className="font-bold text-blue-400">Cần trả NCC</span>
                          <span className="font-mono font-bold text-blue-400">{formatVND(Math.max(0, draftTotal - draftDiscount))}</span>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs text-zinc-400">Tiền trả nhà cung cấp</label>
                          <div className="flex gap-2">
                            {(['bank', 'cash'] as const).map(m => (
                              <button key={m} onClick={() => setDraftInitialPayMethod(m)}
                                className={`flex-1 py-1.5 rounded text-xs font-bold border transition cursor-pointer ${draftInitialPayMethod === m ? 'bg-emerald-700 border-emerald-600 text-white' : 'bg-zinc-800 border-zinc-600 text-zinc-400 hover:border-zinc-500'}`}>
                                {m === 'bank' ? 'Chuyển khoản' : 'Tiền mặt'}
                              </button>
                            ))}
                          </div>
                          <input type="number" min={0} value={draftInitialPay}
                            onChange={e => { setDraftInitialPay(Number(e.target.value) || 0); setDraftInitialPayFull(false); }}
                            className="w-full px-3 py-2 border border-zinc-600 rounded-lg text-sm font-mono text-right bg-zinc-800 text-zinc-100 focus:outline-none focus:border-emerald-500" />
                          <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" checked={draftInitialPayFull}
                              onChange={e => { setDraftInitialPayFull(e.target.checked); if (e.target.checked) setDraftInitialPay(Math.max(0, draftTotal - draftDiscount)); }}
                              className="w-3.5 h-3.5 accent-emerald-500 cursor-pointer" />
                            <span className="text-xs text-zinc-400">Thanh toán đủ ngay</span>
                          </label>
                        </div>
                        <div className="flex justify-between items-center text-sm border-t border-zinc-700 pt-2">
                          <span className="text-zinc-400">Tính vào công nợ</span>
                          <span className={`font-mono font-bold ${Math.max(0, draftTotal - draftDiscount - draftInitialPay) > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {formatVND(Math.max(0, draftTotal - draftDiscount - draftInitialPay))}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Ghi chú */}
                  <div>
                    <label className="text-xs font-bold text-zinc-400 mb-1.5 block">Ghi chú</label>
                    <textarea value={draftNotes} onChange={e => setDraftNotes(e.target.value)} rows={3}
                      className="w-full px-3 py-2 border border-zinc-600 rounded-lg text-sm bg-zinc-800 text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-blue-500 resize-none"
                      placeholder="Ghi chú phiếu..." />
                  </div>
                </div>

                {/* Action buttons */}
                <div className="p-4 border-t border-zinc-700 space-y-2 shrink-0">
                  <button onClick={handleCreate} disabled={saving || draftItems.length === 0}
                    className={`w-full px-4 py-2.5 disabled:!opacity-50 text-white rounded-lg text-sm font-bold shadow-sm transition cursor-pointer ${revisingOrder ? 'bg-amber-600 hover:bg-amber-500' : draftType === 'import' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-amber-500 hover:bg-amber-400'}`}>
                    {saving ? 'Đang lưu...' : revisingOrder ? 'Tạo phiếu điều chỉnh' : draftType === 'import' ? 'Nhập hàng' : 'Xuất hàng'}
                  </button>
                  <button onClick={() => { setShowCreate(false); resetCreate(); }}
                    className="w-full px-4 py-2 border border-zinc-600 text-zinc-300 hover:bg-zinc-800 rounded-lg text-sm font-bold transition cursor-pointer">
                    Hủy
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Confirm */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
              <div className="w-12 h-12 bg-rose-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-rose-400" />
              </div>
              <h3 className="font-bold text-zinc-100 mb-2">Xóa phiếu?</h3>
              <p className="text-sm text-zinc-400 mb-1">Phiếu sẽ bị xóa vĩnh viễn.</p>
              <p className="text-xs text-amber-400 mb-5">Lưu ý: Tồn kho sẽ không tự động điều chỉnh lại.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 border border-zinc-600 text-zinc-300 rounded-lg text-sm font-bold cursor-pointer hover:bg-zinc-800">Hủy</button>
                <button onClick={async () => { await onDelete(deleteConfirm); setDeleteConfirm(null); }}
                  className="flex-1 px-4 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-sm font-bold cursor-pointer">Xóa</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* History Detail Modal */}
      <AnimatePresence>
        {viewingHistoryOrder && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[70] overflow-y-auto">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-5xl my-4">
              <div className="flex items-center justify-between p-5 border-b border-zinc-700">
                <div>
                  <h3 className="font-bold text-zinc-100 flex items-center gap-2">
                    <GitBranch className="w-4 h-4 text-amber-400" />
                    Chi tiết phiếu: {viewingHistoryOrder.id}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    {viewingHistoryOrder.type === 'import' ? 'Nhập hàng' : 'Xuất hàng'} · {new Date(viewingHistoryOrder.timestamp).toLocaleString('vi-VN')}
                    {viewingHistoryOrder.partnerName && ` · ${viewingHistoryOrder.partnerName}`}
                  </p>
                </div>
                <button onClick={() => setViewingHistoryOrder(null)} className="text-zinc-400 hover:text-zinc-100 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 overflow-x-auto">
                {viewingHistoryOrder.notes?.startsWith('[DC:') && (
                  <div className="mb-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                    <GitBranch className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <span>{viewingHistoryOrder.notes.replace(/^\[DC:[^\]]+\]\s*—?\s*/, '') || 'Phiếu điều chỉnh'}</span>
                  </div>
                )}
                <table className="w-full text-xs min-w-[600px]">
                  <thead>
                    <tr className="text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100 bg-slate-50">
                      <th className="px-3 pb-2 pt-1 text-center w-8">STT</th>
                      <th className="px-3 pb-2 pt-1 text-left">Mã hàng</th>
                      <th className="px-3 pb-2 pt-1 text-left">Tên hàng</th>
                      <th className="px-3 pb-2 pt-1 text-left">Thương Hiệu</th>
                      <th className="px-3 pb-2 pt-1 text-center">ĐVT</th>
                      <th className="px-3 pb-2 pt-1 text-right">SL</th>
                      <th className="px-3 pb-2 pt-1 text-right">Giá nhập</th>
                      <th className="px-3 pb-2 pt-1 text-right">Thành tiền</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {viewingHistoryOrder.items.map((it, i) => {
                      const prod = products.find(p => p.id === it.productId);
                      return (
                        <tr key={i} className="text-slate-700 hover:bg-zinc-800/40">
                          <td className="px-3 py-2 text-center text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">{it.sku}</td>
                          <td className="px-3 py-2 font-medium">{it.productName}</td>
                          <td className="px-3 py-2 text-slate-500">{prod?.brand || '—'}</td>
                          <td className="px-3 py-2 text-center text-slate-500">{prod?.unit || '—'}</td>
                          <td className="px-3 py-2 text-right font-bold">{it.quantity}</td>
                          <td className="px-3 py-2 text-right font-mono">{formatVND(it.unitCost)}</td>
                          <td className="px-3 py-2 text-right font-mono font-bold text-blue-700">{formatVND(it.unitCost * it.quantity)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-slate-200 font-bold bg-slate-50">
                      <td colSpan={7} className="px-3 pt-2 pb-1 text-right">Tổng cộng:</td>
                      <td className="px-3 pt-2 pb-1 text-right font-mono text-blue-700">{formatVND(viewingHistoryOrder.totalAmount)}</td>
                    </tr>
                    {viewingHistoryOrder.type === 'import' && (
                      <tr className="text-xs text-slate-500">
                        <td colSpan={6} className="px-3 py-1 text-right">Đã thanh toán:</td>
                        <td colSpan={2} className="px-3 py-1 text-right font-mono text-emerald-600">{formatVND(viewingHistoryOrder.paidAmount)}</td>
                      </tr>
                    )}
                  </tfoot>
                </table>
                {viewingHistoryOrder.notes && !viewingHistoryOrder.notes.startsWith('[DC:') && (
                  <p className="text-xs text-slate-400 mt-3 italic">{viewingHistoryOrder.notes}</p>
                )}
              </div>
              <div className="p-5 border-t border-zinc-700 flex justify-end">
                <button onClick={() => setViewingHistoryOrder(null)} className="px-4 py-2 border border-zinc-600 text-zinc-300 hover:bg-zinc-800 rounded-lg text-sm font-bold cursor-pointer">Đóng</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {payingOrder && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-2xl p-6">
              <h3 className="font-bold text-zinc-100 mb-1">Thanh toán phiếu nhập</h3>
              <p className="text-xs text-zinc-400 font-mono mb-4">{payingOrder.id} · {payingOrder.partnerName}</p>
              <div className="space-y-3 mb-5">
                <div className="flex justify-between text-sm"><span className="text-zinc-400">Tổng phiếu:</span><span className="font-mono font-bold text-zinc-100">{formatVND(payingOrder.totalAmount)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-zinc-400">Đã trả:</span><span className="font-mono text-emerald-400">{formatVND(payingOrder.paidAmount)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-zinc-300 font-bold">Còn nợ:</span><span className="font-mono font-bold text-rose-400">{formatVND(payingOrder.totalAmount - payingOrder.paidAmount)}</span></div>
                <div className="border-t border-zinc-700 pt-3 space-y-2">
                  <div>
                    <label className="text-xs font-bold text-zinc-400 mb-1.5 block">Hình thức thanh toán</label>
                    <div className="flex gap-2">
                      {(['bank', 'cash'] as const).map(m => (
                        <button key={m} onClick={() => setPayMethod(m)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border text-xs font-bold transition cursor-pointer ${payMethod === m ? 'bg-emerald-700 border-emerald-600 text-white' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:border-zinc-500'}`}>
                          {m === 'bank' ? <><Building2 className="w-3.5 h-3.5" /> Chuyển khoản</> : <><Banknote className="w-3.5 h-3.5" /> Tiền mặt</>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={payFull} onChange={e => { setPayFull(e.target.checked); if (e.target.checked) setPayAmount(String(payingOrder.totalAmount - payingOrder.paidAmount)); }} className="w-4 h-4 cursor-pointer accent-emerald-500" />
                    <span className="text-sm font-medium text-zinc-300">Thanh toán toàn bộ</span>
                  </label>
                  {!payFull && (
                    <div>
                      <label className="text-xs font-bold text-zinc-400 mb-1 block">Số tiền</label>
                      <input type="number" min={0} value={payAmount} onChange={e => setPayAmount(e.target.value)}
                        className="w-full px-3 py-2 border border-zinc-700 rounded-lg text-sm font-mono focus:outline-none focus:border-emerald-500 bg-zinc-800 text-zinc-100" />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPayingOrder(null)} className="flex-1 px-4 py-2 border border-zinc-600 text-zinc-300 rounded-lg text-sm font-bold cursor-pointer hover:bg-zinc-800">Hủy</button>
                <button onClick={confirmPay} disabled={saving}
                  className="flex-1 px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:!opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
                  {saving ? 'Đang lưu...' : 'Xác nhận'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
