import React, { useState, useMemo, useRef } from 'react';
import { Product, Partner, PurchaseOrder } from '../types';
import { Plus, Trash2, X, ArrowDownToLine, ArrowUpFromLine, ChevronsUpDown, Search, Download, ChevronDown, GitBranch } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

interface PurchaseOrdersProps {
  products: Product[];
  partners: Partner[];
  orders: PurchaseOrder[];
  onAdd: (o: PurchaseOrder) => void;
  onUpdate: (o: PurchaseOrder) => void;
  onDelete: (id: string) => void;
  onUpdateProductsStock: (updates: { id: string; delta: number }[]) => void;
}

const formatVND = (v: number) => v.toLocaleString('vi-VN') + ' ₫';

type OrderType = 'all' | 'import' | 'export';
type DraftItem = { productId: string; productName: string; sku: string; quantity: number; unitCost: number };

export default function PurchaseOrders({ products, partners, orders, onAdd, onUpdate, onDelete, onUpdateProductsStock }: PurchaseOrdersProps) {
  const [typeFilter, setTypeFilter] = useState<OrderType>('all');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [payingOrder, setPayingOrder] = useState<PurchaseOrder | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payFull, setPayFull] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

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
          'Phiếu gốc': o.parentId ?? '', 'Ghi chú điều chỉnh': o.revisionNote ?? '',
        });
      });
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Xuất nhập hàng');
    XLSX.writeFile(wb, `xuat_nhap_hang_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  const filtered = useMemo(() => {
    return orders.filter(o => {
      if (typeFilter !== 'all' && o.type !== typeFilter) return false;
      if (partnerFilter && o.partnerId !== partnerFilter) return false;
      return true;
    });
  }, [orders, typeFilter, partnerFilter]);

  // Group: root orders with their revisions displayed right after
  const ordersWithRevisions = useMemo(() => {
    const revisionMap = new Map<string, PurchaseOrder[]>();
    const roots: PurchaseOrder[] = [];
    filtered.forEach(o => {
      if (o.parentId) {
        const arr = revisionMap.get(o.parentId) ?? [];
        arr.push(o);
        revisionMap.set(o.parentId, arr);
      } else {
        roots.push(o);
      }
    });
    const result: Array<{ order: PurchaseOrder; isRevision: boolean }> = [];
    roots.forEach(root => {
      result.push({ order: root, isRevision: false });
      const revs = (revisionMap.get(root.id) ?? []).sort((a, b) => a.id.localeCompare(b.id));
      revs.forEach(r => result.push({ order: r, isRevision: true }));
    });
    return result;
  }, [filtered]);

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
    let parentId: string | undefined;
    let revisionNote: string | undefined;

    if (revisingOrder) {
      // Root ID is either the parent of the revising order, or the order itself
      const rootId = revisingOrder.parentId || revisingOrder.id;
      const revCount = orders.filter(o => o.parentId === rootId).length;
      newOrderId = `${rootId}.${revCount + 1}`;
      parentId = rootId;
      const noteLines = [`Điều chỉnh từ phiếu ${revisingOrder.id}`];
      if (reviseNotes.trim()) noteLines.push(reviseNotes.trim());
      revisionNote = noteLines.join(' — ');
    } else {
      newOrderId = `PO${Date.now()}`;
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
      notes: draftNotes.trim() || undefined,
      parentId,
      revisionNote,
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
      await onUpdate({ ...payingOrder, paidAmount: payingOrder.paidAmount + amount });
      setPayingOrder(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch gap-3">
        <div className="flex items-center gap-2 bg-slate-100 rounded-lg p-1 border border-slate-200">
          {(['all', 'import', 'export'] as OrderType[]).map(t => (
            <button key={t} onClick={() => setTypeFilter(t)}
              className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${typeFilter === t ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {t === 'all' ? 'Tất cả' : t === 'import' ? '↓ Nhập hàng' : '↑ Xuất hàng'}
            </button>
          ))}
        </div>
        <select value={partnerFilter} onChange={e => setPartnerFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:border-blue-500 cursor-pointer">
          <option value="">Tất cả đối tác</option>
          {partners.map(p => <option key={p.id} value={p.id}>{p.fullName}</option>)}
        </select>
        <button onClick={exportExcel}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-bold cursor-pointer transition whitespace-nowrap">
          <Download className="w-4 h-4" /> Xuất Excel
        </button>
        <button onClick={() => { resetCreate(); setShowCreate(true); }}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition cursor-pointer whitespace-nowrap">
          <Plus className="w-4 h-4" /> Tạo phiếu
        </button>
      </div>

      {/* List */}
      <div className="space-y-3">
        {ordersWithRevisions.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
            <ChevronsUpDown className="w-10 h-10 mx-auto stroke-1 mb-2 text-slate-300" />
            <p className="text-sm font-semibold">Chưa có phiếu nào</p>
          </div>
        ) : ordersWithRevisions.map(({ order: o, isRevision }) => {
          const remaining = o.totalAmount - o.paidAmount;
          const isOpen = expandedId === o.id;
          return (
            <div key={o.id} className={`bg-white rounded-xl border shadow-sm overflow-hidden ${isRevision ? 'ml-6 border-amber-200' : 'border-slate-200'}`}>
              <div
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 cursor-pointer hover:bg-slate-50/60 transition"
                onClick={() => setExpandedId(isOpen ? null : o.id)}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${isRevision ? 'bg-amber-50 text-amber-600' : o.type === 'import' ? 'bg-blue-50 text-blue-600' : 'bg-amber-50 text-amber-600'}`}>
                    {isRevision ? <GitBranch className="w-4 h-4" /> : o.type === 'import' ? <ArrowDownToLine className="w-4 h-4" /> : <ArrowUpFromLine className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-bold text-sm text-slate-800">
                        {isRevision ? 'Phiếu điều chỉnh' : o.type === 'import' ? 'Phiếu nhập hàng' : 'Phiếu xuất hàng'}
                      </p>
                      {isRevision && <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-1.5 py-0.5 rounded">Điều chỉnh</span>}
                    </div>
                    <p className="text-xs text-slate-500 font-mono">{o.id} · {new Date(o.timestamp).toLocaleDateString('vi-VN')}</p>
                    {o.partnerName && <p className="text-xs text-slate-500">{o.partnerName}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3 text-right shrink-0">
                  <div>
                    <p className="font-mono font-bold text-slate-800">{formatVND(o.totalAmount)}</p>
                    {o.type === 'import' && (
                      <p className={`text-xs font-mono ${remaining > 0 ? 'text-rose-600 font-bold' : 'text-emerald-600'}`}>
                        {remaining > 0 ? `Còn nợ: ${formatVND(remaining)}` : 'Đã thanh toán đủ'}
                      </p>
                    )}
                  </div>
                  <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-blue-500' : ''}`} />
                </div>
              </div>

              <AnimatePresence>
                {isOpen && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden">
                    <div className="px-4 pb-4 border-t border-slate-100">
                      {o.revisionNote && (
                        <div className="mt-3 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
                          <GitBranch className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                          <span>{o.revisionNote}</span>
                        </div>
                      )}
                      <table className="w-full text-xs mt-3">
                        <thead>
                          <tr className="text-slate-500 font-bold uppercase tracking-wider border-b border-slate-100">
                            <th className="pb-2 text-left">Sản phẩm</th>
                            <th className="pb-2 text-right">SL</th>
                            <th className="pb-2 text-right">Đơn giá</th>
                            <th className="pb-2 text-right">Thành tiền</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {o.items.map((it, i) => (
                            <tr key={i} className="text-slate-700">
                              <td className="py-1.5">{it.productName} <span className="text-slate-400 font-mono">({it.sku})</span></td>
                              <td className="py-1.5 text-right">{it.quantity}</td>
                              <td className="py-1.5 text-right font-mono">{formatVND(it.unitCost)}</td>
                              <td className="py-1.5 text-right font-mono font-bold">{formatVND(it.unitCost * it.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-slate-200 font-bold text-slate-800">
                            <td colSpan={3} className="pt-2 text-right pr-4">Tổng cộng:</td>
                            <td className="pt-2 text-right font-mono">{formatVND(o.totalAmount)}</td>
                          </tr>
                        </tfoot>
                      </table>
                      {o.notes && <p className="text-xs text-slate-400 mt-2 italic">{o.notes}</p>}

                      {/* Action buttons */}
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
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Create / Revise Modal */}
      <AnimatePresence>
        {showCreate && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl my-4">
              <div className={`flex items-center justify-between p-5 border-b ${revisingOrder ? 'bg-amber-50 border-amber-200' : 'border-slate-200'}`}>
                <div>
                  <h3 className="font-bold text-slate-800">
                    {revisingOrder ? `Điều chỉnh phiếu ${revisingOrder.id}` : 'Tạo phiếu xuất nhập hàng'}
                  </h3>
                  {revisingOrder && (
                    <p className="text-xs text-amber-700 mt-0.5">Phiếu gốc sẽ được giữ nguyên. Phiếu điều chỉnh mới sẽ được tạo.</p>
                  )}
                </div>
                <button onClick={() => { setShowCreate(false); resetCreate(); }} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-5 h-5" /></button>
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
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-xs font-bold text-slate-600">Danh sách hàng hóa</label>
                    <button onClick={() => setDraftItems(prev => [...prev, { productId: '', productName: '', sku: '', quantity: 1, unitCost: 0 }])}
                      className="text-xs text-blue-600 hover:text-blue-700 font-bold cursor-pointer flex items-center gap-1">
                      <Plus className="w-3.5 h-3.5" /> Thêm dòng
                    </button>
                  </div>
                  <div className="space-y-2">
                    {draftItems.map((item, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-5">
                          <select value={item.productId} onChange={e => setItemProduct(idx, e.target.value)}
                            className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:border-blue-500 cursor-pointer">
                            <option value="">— Chọn sản phẩm —</option>
                            {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku}){p.brand ? ' — ' + p.brand : ''}</option>)}
                          </select>
                        </div>
                        <div className="col-span-2">
                          <input type="number" min={1} value={item.quantity} onChange={e => setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, quantity: Number(e.target.value) || 1 } : it))}
                            className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs text-right focus:outline-none focus:border-blue-500" placeholder="SL" />
                        </div>
                        <div className="col-span-3">
                          <input type="number" min={0} value={item.unitCost} onChange={e => setDraftItems(prev => prev.map((it, i) => i === idx ? { ...it, unitCost: Number(e.target.value) || 0 } : it))}
                            className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs text-right font-mono focus:outline-none focus:border-blue-500" placeholder="Đơn giá" />
                        </div>
                        <div className="col-span-1 text-right text-xs font-mono text-slate-600">
                          {(item.quantity * item.unitCost > 0) ? (item.quantity * item.unitCost / 1000).toFixed(0) + 'k' : '—'}
                        </div>
                        <div className="col-span-1 flex justify-center">
                          {draftItems.length > 1 && (
                            <button onClick={() => setDraftItems(prev => prev.filter((_, i) => i !== idx))}
                              className="text-slate-400 hover:text-rose-600 cursor-pointer transition">
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
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

              <div className="flex gap-3 p-5 border-t border-slate-200">
                <button onClick={() => { setShowCreate(false); resetCreate(); }} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-bold transition cursor-pointer">Hủy</button>
                <button onClick={handleCreate} disabled={saving || (draftItems.filter(it => it.productId).length === 0)}
                  className={`flex-1 px-4 py-2 disabled:opacity-60 text-white rounded-lg text-sm font-bold shadow-sm transition cursor-pointer ${revisingOrder ? 'bg-amber-500 hover:bg-amber-600' : 'bg-blue-600 hover:bg-blue-700'}`}>
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
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
              <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <Trash2 className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="font-bold text-slate-800 mb-2">Xóa phiếu?</h3>
              <p className="text-sm text-slate-500 mb-1">Phiếu sẽ bị xóa vĩnh viễn.</p>
              <p className="text-xs text-amber-600 mb-5">Lưu ý: Tồn kho sẽ không tự động điều chỉnh lại.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold cursor-pointer">Hủy</button>
                <button onClick={async () => { await onDelete(deleteConfirm); setDeleteConfirm(null); }}
                  className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold cursor-pointer">Xóa</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal */}
      <AnimatePresence>
        {payingOrder && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
              <h3 className="font-bold text-slate-800 mb-1">Thanh toán phiếu nhập</h3>
              <p className="text-xs text-slate-500 font-mono mb-4">{payingOrder.id} · {payingOrder.partnerName}</p>
              <div className="space-y-3 mb-5">
                <div className="flex justify-between text-sm"><span className="text-slate-600">Tổng phiếu:</span><span className="font-mono font-bold">{formatVND(payingOrder.totalAmount)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-600">Đã trả:</span><span className="font-mono text-emerald-600">{formatVND(payingOrder.paidAmount)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-slate-600">Còn nợ:</span><span className="font-mono font-bold text-rose-600">{formatVND(payingOrder.totalAmount - payingOrder.paidAmount)}</span></div>
                <div className="border-t border-slate-200 pt-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={payFull} onChange={e => { setPayFull(e.target.checked); if (e.target.checked) setPayAmount(String(payingOrder.totalAmount - payingOrder.paidAmount)); }} className="w-4 h-4 cursor-pointer" />
                    <span className="text-sm font-medium text-slate-700">Thanh toán toàn bộ</span>
                  </label>
                  {!payFull && (
                    <div>
                      <label className="text-xs font-bold text-slate-600 mb-1 block">Số tiền</label>
                      <input type="number" min={0} value={payAmount} onChange={e => setPayAmount(e.target.value)}
                        className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500" />
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPayingOrder(null)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold cursor-pointer">Hủy</button>
                <button onClick={confirmPay} disabled={saving}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
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
