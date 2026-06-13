import React, { useState, useMemo, useRef } from 'react';
import { Product, Partner, PurchaseOrder, PaymentLog } from '../types';
import { Plus, Trash2, X, ArrowDownToLine, ArrowUpFromLine, ChevronsUpDown, Search, Download, ChevronDown, GitBranch, History, Banknote, Building2 } from 'lucide-react';
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
type DraftItem = { productId: string; productName: string; sku: string; quantity: number; unitCost: number };

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
  const [draftItems, setDraftItems] = useState<DraftItem[]>([{ productId: '', productName: '', sku: '', quantity: 1, unitCost: 0 }]);

  // Revision system state
  const [revisingOrder, setRevisingOrder] = useState<PurchaseOrder | null>(null);
  const [reviseNotes, setReviseNotes] = useState('');

  // History detail modal
  const [viewingHistoryOrder, setViewingHistoryOrder] = useState<PurchaseOrder | null>(null);

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

  // Detect revision: ID contains "." (e.g. PO123.1) OR has parentId from legacy DB
  function getParentId(o: PurchaseOrder): string | null {
    if (o.parentId) return o.parentId;
    const dot = o.id.lastIndexOf('.');
    if (dot > 0) return o.id.slice(0, dot);
    return null;
  }

  // Group: for each root+revisions family, show only the LATEST revision as main row.
  // Original + older revisions appear in the expanded panel "Lịch sử điều chỉnh".
  // Build a map: rootId → { representative: PurchaseOrder; history: PurchaseOrder[] }
  const orderFamilies = useMemo(() => {
    // Collect ALL orders (not just filtered) to build revision map across families
    const revisionMap = new Map<string, PurchaseOrder[]>(); // rootId → [rev1, rev2, ...]
    const rootMap = new Map<string, PurchaseOrder>();        // rootId → root order

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

    // For each root, pick representative = latest revision (or root if no revisions)
    const families: Array<{
      representative: PurchaseOrder;
      root: PurchaseOrder;
      revisions: PurchaseOrder[]; // sorted oldest→newest
    }> = [];

    rootMap.forEach((root) => {
      const revs = (revisionMap.get(root.id) ?? []).sort((a, b) => a.id.localeCompare(b.id));
      const representative = revs.length > 0 ? revs[revs.length - 1] : root;
      families.push({ representative, root, revisions: revs });
    });

    // Sort families by representative timestamp descending
    families.sort((a, b) => b.representative.timestamp.localeCompare(a.representative.timestamp));

    return families;
  }, [orders]);

  // Apply filter on top of families
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
    setDraftItems([{ productId: '', productName: '', sku: '', quantity: 1, unitCost: 0 }]);
    setRevisingOrder(null);
    setReviseNotes('');
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
    })));
    setReviseNotes('');
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
    } : it));
  }

  async function handleCreate() {
    const validItems = draftItems.filter(it => it.productId && it.quantity > 0);
    if (validItems.length === 0) return;
    const partner = partners.find(p => p.id === draftPartnerId);

    let newOrderId: string;
    let finalNotes: string | undefined;

    if (revisingOrder) {
      // Root ID = strip any existing revision suffix
      const rootId = getParentId(revisingOrder) ?? revisingOrder.id;
      const revCount = orders.filter(o => {
        const pid = getParentId(o);
        return pid === rootId;
      }).length;
      newOrderId = `${rootId}.${revCount + 1}`;
      // Encode revision info in notes (no DB column needed)
      const noteLines = [`[DC: ${revisingOrder.id}]`];
      if (reviseNotes.trim()) noteLines.push(reviseNotes.trim());
      if (draftNotes.trim()) noteLines.push(draftNotes.trim());
      finalNotes = noteLines.join(' — ');
    } else {
      const rnd = Math.floor(10000 + Math.random() * 90000);
      newOrderId = draftType === 'import' ? `NH${rnd}` : `XH${rnd}`;
      finalNotes = draftNotes.trim() || undefined;
    }

    const order: PurchaseOrder = {
      id: newOrderId,
      type: draftType,
      partnerId: draftPartnerId,
      partnerName: partner?.fullName ?? (revisingOrder?.partnerName ?? ''),
      timestamp: new Date(draftDate).toISOString(),
      items: validItems.map(it => ({ productId: it.productId, productName: it.productName, sku: it.sku, quantity: it.quantity, unitCost: it.unitCost })),
      totalAmount: validItems.reduce((s, it) => s + it.quantity * it.unitCost, 0),
      paidAmount: 0,
      notes: finalNotes,
      // parentId/revisionNote intentionally omitted — no DB columns needed
    };

    setSaving(true);
    try {
      await onAdd(order);
      if (draftType === 'import') {
        onUpdateProductsStock(validItems.map(it => ({ id: it.productId, delta: it.quantity })));
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
                                <th className="px-3 pb-2 pt-1 text-left">Mã hàng</th>
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
                                    <td className="px-3 py-2 font-mono text-slate-500">{it.sku}</td>
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
                                <td colSpan={11} className="px-3 pt-2 pb-1 text-right">Tổng cộng:</td>
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
                          {/* Payment logs */}
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
                          {/* Revision history */}
                          {hasRevisions && (
                            <div>
                              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Lịch sử điều chỉnh</p>
                              <div className="space-y-2">
                                {/* Show root first */}
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
                                {/* Current (latest) revision */}
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

      {/* Create / Revise Modal */}
      <AnimatePresence>
        {showCreate && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-5xl my-4">
              <div className={`flex items-center justify-between p-5 border-b ${revisingOrder ? 'bg-amber-900/20 border-amber-700' : 'border-zinc-700'}`}>
                <div>
                  <h3 className="font-bold text-zinc-100">
                    {revisingOrder ? `Điều chỉnh phiếu ${revisingOrder.id}` : 'Tạo phiếu xuất nhập hàng'}
                  </h3>
                  {revisingOrder && (
                    <p className="text-xs text-amber-400 mt-0.5">Phiếu gốc sẽ được giữ nguyên. Phiếu điều chỉnh mới sẽ được tạo.</p>
                  )}
                </div>
                <button onClick={() => { setShowCreate(false); resetCreate(); }} className="text-zinc-400 hover:text-zinc-100 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>

              <div className="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
                {/* Revise notes (only when revising) */}
                {revisingOrder && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                    <label className="text-xs font-bold text-amber-800 mb-1.5 block flex items-center gap-1">
                      <GitBranch className="w-3.5 h-3.5" /> Lý do điều chỉnh
                    </label>
                    <input value={reviseNotes} onChange={e => setReviseNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-amber-200 bg-white rounded-lg text-sm focus:outline-none focus:border-amber-500"
                      placeholder="VD: Cập nhật số lượng thực nhận, sửa đơn giá..." />
                  </div>
                )}

                {/* Type & Partner */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-2 block">Loại phiếu</label>
                    <div className="flex gap-2">
                      {(['import', 'export'] as const).map(t => (
                        <button key={t} onClick={() => setDraftType(t)}
                          className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 text-sm font-bold transition cursor-pointer ${draftType === t ? (t === 'import' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-amber-500 bg-amber-50 text-amber-700') : 'border-slate-200 text-slate-500 hover:border-slate-300'}`}>
                          {t === 'import' ? <><ArrowDownToLine className="w-4 h-4" /> Nhập hàng</> : <><ArrowUpFromLine className="w-4 h-4" /> Xuất hàng</>}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="relative" ref={partnerDropdownRef}>
                    <label className="text-xs font-bold text-slate-600 mb-2 block">
                      Đối tác {draftType === 'import' ? <span className="text-rose-500">*</span> : <span className="text-slate-400">(tùy chọn)</span>}
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        value={partnerSearch}
                        onChange={e => { setPartnerSearch(e.target.value); setDraftPartnerId(''); setShowPartnerDropdown(true); }}
                        onFocus={() => setShowPartnerDropdown(true)}
                        placeholder="Tìm tên hoặc thương hiệu..."
                        className="w-full pl-9 pr-3 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                      />
                    </div>
                    {showPartnerDropdown && filteredPartners.length > 0 && (
                      <div className="absolute z-30 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
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
                    {showPartnerDropdown && (
                      <div className="fixed inset-0 z-20" onClick={() => setShowPartnerDropdown(false)} />
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-2 block">Ngày giờ</label>
                    <input type="datetime-local" value={draftDate} onChange={e => setDraftDate(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-2 block">Ghi chú</label>
                    <input value={draftNotes} onChange={e => setDraftNotes(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
                      placeholder="Ghi chú phiếu..." />
                  </div>
                </div>

                {/* Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-600">Danh sách hàng hóa</label>
                    <button onClick={() => setDraftItems(prev => [...prev, { productId: '', productName: '', sku: '', quantity: 1, unitCost: 0 }])}
                      className="text-xs text-blue-600 hover:text-blue-700 font-bold cursor-pointer flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Thêm dòng
                    </button>
                  </div>
                  <div className="overflow-x-auto -mx-5 px-5">
                    <table className="w-full text-xs min-w-[700px]">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
                          <th className="px-2 py-2 text-left w-6">#</th>
                          <th className="px-2 py-2 text-left">Sản phẩm</th>
                          <th className="px-2 py-2 text-center">Thương Hiệu</th>
                          <th className="px-2 py-2 text-center">ĐVT</th>
                          <th className="px-2 py-2 text-right">Tồn kho</th>
                          <th className="px-2 py-2 text-right">Giá nhập cũ</th>
                          <th className="px-2 py-2 text-right">Giá bán</th>
                          <th className="px-2 py-2 text-right w-20">SL</th>
                          <th className="px-2 py-2 text-right w-28">Giá nhập</th>
                          <th className="px-2 py-2 text-right">T.Tiền</th>
                          <th className="px-2 py-2 w-6"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {draftItems.map((item, idx) => {
                          const prod = item.productId ? products.find(p => p.id === item.productId) : null;
                          return (
                            <tr key={idx} className="hover:bg-zinc-800/40">
                              <td className="px-2 py-1.5 text-slate-400 text-center">{idx + 1}</td>
                              <td className="px-2 py-1.5">
                                <select value={item.productId} onChange={e => setItemProduct(idx, e.target.value)}
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:border-blue-500 cursor-pointer min-w-[160px]">
                                  <option value="">— Chọn sản phẩm —</option>
                                  {products.map(p => (
                                    <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-2 py-1.5 text-center text-slate-500">{prod?.brand || '—'}</td>
                              <td className="px-2 py-1.5 text-center text-slate-500">{prod?.unit || '—'}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-500">{prod ? prod.stock : '—'}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-slate-400">{prod ? (prod.costPrice / 1000).toFixed(0) + 'k' : '—'}</td>
                              <td className="px-2 py-1.5 text-right font-mono text-emerald-600">{prod ? (prod.sellingPrice / 1000).toFixed(0) + 'k' : '—'}</td>
                              <td className="px-2 py-1.5">
                                <input type="number" min={0.001} step={0.001} value={item.quantity} onChange={e => setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Number(e.target.value) || 1 } : it))}
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-right focus:outline-none focus:border-blue-500" />
                              </td>
                              <td className="px-2 py-1.5">
                                <input type="number" min={0} value={item.unitCost} onChange={e => setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, unitCost: Number(e.target.value) || 0 } : it))}
                                  className="w-full px-2 py-1.5 border border-slate-200 rounded-lg text-xs text-right font-mono focus:outline-none focus:border-blue-500" />
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono font-bold text-blue-700">
                                {item.quantity * item.unitCost > 0 ? (item.quantity * item.unitCost / 1000).toFixed(0) + 'k' : '—'}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                {draftItems.length > 1 && (
                                  <button onClick={() => setDraftItems(prev => prev.filter((_, i) => i !== idx))}
                                    className="text-slate-400 hover:text-rose-600 cursor-pointer transition">
                                    <X className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end mt-3 pt-3 border-t border-slate-200">
                    <div className="text-sm font-bold text-slate-800">
                      Tổng cộng: <span className="font-mono text-blue-700">{formatVND(draftTotal)}</span>
                    </div>
                  </div>
                </div>

                {draftType === 'import' && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700 flex items-center gap-2">
                    <ArrowDownToLine className="w-4 h-4 shrink-0" />
                    {revisingOrder
                      ? 'Phiếu điều chỉnh nhập hàng sẽ cộng thêm vào tồn kho sau khi tạo.'
                      : 'Phiếu nhập hàng sẽ tự động cộng vào tồn kho sau khi tạo.'}
                  </div>
                )}
              </div>

              <div className="flex gap-3 p-5 border-t border-zinc-700">
                <button onClick={() => { setShowCreate(false); resetCreate(); }} className="flex-1 px-4 py-2 border border-zinc-600 text-zinc-300 hover:bg-zinc-800 rounded-lg text-sm font-bold transition cursor-pointer">Hủy</button>
                <button onClick={handleCreate} disabled={saving || (draftItems.filter(it => it.productId).length === 0)}
                  className={`flex-1 px-4 py-2 disabled:!opacity-60 text-white rounded-lg text-sm font-bold shadow-sm transition cursor-pointer ${revisingOrder ? 'bg-amber-600 hover:bg-amber-500' : 'bg-blue-600 hover:bg-blue-700'}`}>
                  {saving ? 'Đang lưu...' : revisingOrder ? 'Tạo phiếu điều chỉnh' : 'Tạo phiếu'}
                </button>
              </div>
            </motion.div>
          </div>
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
