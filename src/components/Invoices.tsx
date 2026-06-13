import React, { useState, useMemo } from 'react';
import { Invoice, Product, ReturnOrder, ReturnItem } from '../types';
import {
  Search, FileText, X, Printer,
  ChevronDown, CreditCard, Banknote, QrCode,
  CheckCircle2, AlertTriangle, Pencil, Check,
  Receipt, ReceiptX, FilePenLine, RotateCcw, Minus, Plus,
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

interface InvoicesProps {
  invoices: Invoice[];
  products: Product[];
  returnOrders: ReturnOrder[];
  onUpdateInvoice: (inv: Invoice) => Promise<void>;
  onPrintInvoice: (inv: Invoice) => void;
  onAddReturnOrder: (ro: ReturnOrder) => Promise<void>;
  onUpdateProductsStock?: (updates: { id: string; delta: number }[]) => Promise<void> | void;
}

const fmt = (v: number) => v.toLocaleString('vi-VN') + ' ₫';
const PM_LABEL: Record<string, string> = { CASH: 'Tiền mặt', QR: 'VietQR CK', CARD: 'Quẹt thẻ' };
const PM_COLOR: Record<string, string> = {
  CASH: 'bg-emerald-900/40 text-emerald-300 border border-emerald-700',
  QR:   'bg-blue-900/40 text-blue-300 border border-blue-700',
  CARD: 'bg-amber-900/40 text-amber-300 border border-amber-700',
};

type EditItem = { productId: string; name: string; sku: string; price: number; cost: number; qty: number };

export default function Invoices({
  invoices, products, returnOrders, onUpdateInvoice, onPrintInvoice, onAddReturnOrder, onUpdateProductsStock,
}: InvoicesProps) {
  const [search, setSearch] = useState('');
  const [pmFilter, setPmFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Inline notes edit
  const [noteEditId, setNoteEditId] = useState<string | null>(null);
  const [noteVal, setNoteVal] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  // Return order modal
  const [returnInv, setReturnInv] = useState<Invoice | null>(null);
  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const [returnNote, setReturnNote] = useState('');
  const [returnSaving, setReturnSaving] = useState(false);
  const [returnError, setReturnError] = useState('');

  // Inline error
  const [rowError, setRowError] = useState('');

  // Edit modal
  const [editInv, setEditInv] = useState<Invoice | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editPm, setEditPm] = useState('CASH');
  const [editDisc, setEditDisc] = useState(0);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');

  const [showReturnOrders, setShowReturnOrders] = useState(false);

  const [timeFilter, setTimeFilter] = useState<'1' | '3' | '7' | '30' | 'custom'>('30');
  const [customDateFrom, setCustomDateFrom] = useState('');
  const [customDateTo, setCustomDateTo] = useState('');
  const [showAdjustedOnly, setShowAdjustedOnly] = useState(false);

  const sorted = useMemo(
    () => [...invoices].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [invoices],
  );

  const { dateFrom, dateTo } = useMemo(() => {
    const now = new Date();
    now.setHours(23, 59, 59, 999);
    let df: Date | null = null;
    let dt: Date | null = now;
    if (timeFilter === '1') { df = new Date(now); df.setHours(0, 0, 0, 0); }
    else if (timeFilter === '3') { df = new Date(now); df.setDate(df.getDate() - 2); df.setHours(0, 0, 0, 0); }
    else if (timeFilter === '7') { df = new Date(now); df.setDate(df.getDate() - 6); df.setHours(0, 0, 0, 0); }
    else if (timeFilter === '30') { df = new Date(now); df.setDate(df.getDate() - 29); df.setHours(0, 0, 0, 0); }
    else if (timeFilter === 'custom' && customDateFrom) {
      df = new Date(customDateFrom + 'T00:00:00');
      dt = customDateTo ? new Date(customDateTo + 'T23:59:59') : now;
    }
    return { dateFrom: df, dateTo: dt };
  }, [timeFilter, customDateFrom, customDateTo]);

  const inRange = (inv: Invoice) => {
    if (!dateFrom) return true;
    const t = new Date(inv.timestamp).getTime();
    return t >= dateFrom.getTime() && t <= (dateTo ?? new Date()).getTime();
  };

  const rangeList = useMemo(() => sorted.filter(inRange), [sorted, dateFrom, dateTo]);

  const returnsInRange = useMemo(() => returnOrders.filter(ro => {
    if (!dateFrom) return true;
    const t = new Date(ro.timestamp).getTime();
    return t >= dateFrom.getTime() && t <= (dateTo ?? new Date()).getTime();
  }), [returnOrders, dateFrom, dateTo]);

  const stats = useMemo(() => {
    const all      = rangeList.filter(i => (i.status ?? 'completed') !== 'cancelled' && !i.isAdjusted);
    const adjusted = rangeList.filter(i => i.isAdjusted);
    return {
      all:     { count: all.length,              amount: all.reduce((s, i) => s + i.finalAmount, 0) },
      returns: { count: returnsInRange.length,   amount: returnsInRange.reduce((s, ro) => s + ro.totalRefund, 0) },
      adjusted:{ count: adjusted.length,         amount: adjusted.reduce((s, i) => s + i.finalAmount, 0) },
    };
  }, [rangeList, returnsInRange]);

  const filtered = useMemo(() => {
    let list = rangeList;
    if (pmFilter) list = list.filter(i => i.paymentMethod === pmFilter);
    if (statusFilter) list = list.filter(i => (i.status ?? 'completed') === statusFilter);
    if (showAdjustedOnly) list = list.filter(i => i.isAdjusted);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.id.toLowerCase().includes(q) ||
        (i.customerName ?? '').toLowerCase().includes(q) ||
        (i.customerPhone ?? '').includes(q),
      );
    }
    return list;
  }, [rangeList, search, pmFilter, statusFilter, showAdjustedOnly]);

  const isCancelled = (inv: Invoice) => (inv.status ?? 'completed') === 'cancelled';

  async function saveNote(inv: Invoice) {
    setNoteSaving(true); setRowError('');
    try {
      await onUpdateInvoice({ ...inv, notes: noteVal.trim() || undefined });
      setNoteEditId(null);
    } catch (e: any) {
      setRowError(e?.message ?? 'Lỗi lưu ghi chú');
    } finally {
      setNoteSaving(false);
    }
  }

  function openReturn(inv: Invoice) {
    const qtys: Record<string, number> = {};
    inv.items.forEach(it => { qtys[it.product.id] = 0; });
    setReturnQtys(qtys);
    setReturnNote('');
    setReturnError('');
    setReturnInv(inv);
  }

  function getAlreadyReturned(inv: Invoice, productId: string): number {
    return returnOrders
      .filter(ro => ro.invoiceId === inv.id)
      .reduce((s, ro) => {
        const item = ro.items.find(i => i.productId === productId);
        return s + (item?.quantity ?? 0);
      }, 0);
  }

  async function doReturn() {
    if (!returnInv) return;
    const items: ReturnItem[] = returnInv.items
      .map(it => ({
        productId: it.product.id,
        productName: it.product.name,
        sku: it.product.sku,
        quantity: returnQtys[it.product.id] ?? 0,
        unitPrice: it.product.sellingPrice,
      }))
      .filter(it => it.quantity > 0);

    if (items.length === 0) {
      setReturnError('Vui lòng chọn ít nhất 1 sản phẩm để trả hàng');
      return;
    }

    const totalRefund = items.reduce((s, it) => s + it.quantity * it.unitPrice, 0);
    const randomSuffix = Math.floor(10000 + Math.random() * 90000);
    const ro: ReturnOrder = {
      id: `TH${randomSuffix}`,
      invoiceId: returnInv.id,
      timestamp: new Date().toISOString(),
      items,
      totalRefund,
      notes: returnNote.trim() || undefined,
    };

    setReturnSaving(true); setReturnError('');
    try {
      await onAddReturnOrder(ro);
      setReturnInv(null);
    } catch (e: any) {
      setReturnError(e?.message ?? 'Lỗi tạo phiếu trả hàng');
    } finally {
      setReturnSaving(false);
    }
  }

  function openEdit(inv: Invoice) {
    setEditInv(inv);
    setEditName(inv.customerName ?? '');
    setEditPhone(inv.customerPhone ?? '');
    setEditPm(inv.paymentMethod);
    setEditDisc(inv.discountPercent);
    setEditItems(inv.items.map(it => ({
      productId: it.product.id, name: it.product.name, sku: it.product.sku,
      price: it.product.sellingPrice, cost: it.product.costPrice, qty: it.quantity,
    })));
    setEditError('');
  }

  const editTotal = editItems.reduce((s, it) => s + it.price * it.qty, 0);
  const editDiscAmt = Math.round(editTotal * editDisc / 100);
  const editFinal = editTotal - editDiscAmt;

  async function saveEdit() {
    if (!editInv) return;
    const valid = editItems.filter(it => it.qty > 0);
    if (!valid.length) { setEditError('Cần ít nhất 1 sản phẩm'); return; }
    setEditSaving(true); setEditError('');
    try {
      if (onUpdateProductsStock) {
        const oldMap = new Map(editInv.items.map(it => [it.product.id, it.quantity]));
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
      const updated: Invoice = {
        ...editInv,
        customerName: editName.trim() || undefined,
        customerPhone: editPhone.trim() || undefined,
        paymentMethod: editPm as any,
        discountPercent: editDisc,
        discountAmount: editDiscAmt,
        totalAmount: editTotal,
        finalAmount: editFinal,
        isAdjusted: true,
        items: valid.map(it => {
          const orig = editInv.items.find(x => x.product.id === it.productId);
          if (orig) return { ...orig, quantity: it.qty };
          const prod = products.find(p => p.id === it.productId)!;
          return { product: prod, quantity: it.qty };
        }),
      };
      await onUpdateInvoice(updated);
      setEditInv(null);
    } catch (e: any) {
      setEditError(e?.message ?? 'Lỗi khi lưu');
    } finally {
      setEditSaving(false);
    }
  }

  function addEditProduct(productId: string) {
    const prod = products.find(p => p.id === productId);
    if (!prod) return;
    const idx = editItems.findIndex(it => it.productId === productId);
    if (idx >= 0) {
      setEditItems(prev => prev.map((it, i) => i === idx ? { ...it, qty: it.qty + 1 } : it));
    } else {
      setEditItems(prev => [...prev, {
        productId: prod.id, name: prod.name, sku: prod.sku,
        price: prod.sellingPrice, cost: prod.costPrice, qty: 1,
      }]);
    }
  }

  const fmtShort = (v: number) => v >= 1_000_000
    ? (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + ' tr'
    : v >= 1_000 ? (v / 1_000).toFixed(0) + ' k' : String(v);

  const activeCard = showAdjustedOnly ? 'adjusted' : 'all';

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {/* Tổng hóa đơn */}
        <button type="button" onClick={() => { setStatusFilter(''); setShowAdjustedOnly(false); }}
          className={`text-left p-4 rounded-xl border transition cursor-pointer ${activeCard === 'all' ? 'border-blue-500 bg-blue-900/20' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'}`}>
          <div className="flex items-center gap-2 mb-2">
            <Receipt className={`w-4 h-4 ${activeCard === 'all' ? 'text-blue-400' : 'text-zinc-500'}`} />
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Tổng hóa đơn</span>
          </div>
          <p className={`text-2xl font-extrabold font-mono ${activeCard === 'all' ? 'text-blue-300' : 'text-zinc-100'}`}>{stats.all.count}</p>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">{fmtShort(stats.all.amount)} ₫</p>
        </button>

        {/* Phiếu trả hàng */}
        <button type="button" onClick={() => setShowReturnOrders(true)}
          className="text-left p-4 rounded-xl border border-zinc-700 bg-zinc-900 hover:border-teal-600 transition cursor-pointer">
          <div className="flex items-center gap-2 mb-2">
            <RotateCcw className="w-4 h-4 text-teal-400" />
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Phiếu trả hàng</span>
          </div>
          <p className="text-2xl font-extrabold font-mono text-teal-300">{stats.returns.count}</p>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">{fmtShort(stats.returns.amount)} ₫</p>
        </button>

        {/* Hóa đơn điều chỉnh */}
        <button type="button" onClick={() => { setStatusFilter(''); setShowAdjustedOnly(true); }}
          className={`text-left p-4 rounded-xl border transition cursor-pointer ${activeCard === 'adjusted' ? 'border-amber-500 bg-amber-900/20' : 'border-zinc-700 bg-zinc-900 hover:border-zinc-500'}`}>
          <div className="flex items-center gap-2 mb-2">
            <FilePenLine className={`w-4 h-4 ${activeCard === 'adjusted' ? 'text-amber-400' : 'text-zinc-500'}`} />
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wide">Đã điều chỉnh</span>
          </div>
          <p className={`text-2xl font-extrabold font-mono ${activeCard === 'adjusted' ? 'text-amber-300' : 'text-zinc-100'}`}>{stats.adjusted.count}</p>
          <p className="text-xs text-zinc-500 font-mono mt-0.5">{fmtShort(stats.adjusted.amount)} ₫</p>
        </button>
      </div>

      {/* Time filter */}
      <div className="flex flex-wrap items-center gap-2">
        {(['1', '3', '7', '30', 'custom'] as const).map(t => (
          <button key={t} onClick={() => setTimeFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${timeFilter === t ? 'bg-blue-600 text-white' : 'bg-zinc-800 border border-zinc-700 text-zinc-400 hover:text-zinc-100'}`}>
            {t === '1' ? 'Hôm nay' : t === 'custom' ? 'Tùy chọn' : `${t} ngày`}
          </button>
        ))}
        {timeFilter === 'custom' && (
          <div className="flex items-center gap-2">
            <input type="date" value={customDateFrom} onChange={e => setCustomDateFrom(e.target.value)}
              className="px-2 py-1 bg-zinc-800 border border-zinc-700 text-amber-400 rounded-lg text-xs focus:outline-none" />
            <span className="text-zinc-500 text-xs">→</span>
            <input type="date" value={customDateTo} onChange={e => setCustomDateTo(e.target.value)}
              className="px-2 py-1 bg-zinc-800 border border-zinc-700 text-amber-400 rounded-lg text-xs focus:outline-none" />
          </div>
        )}
      </div>
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm mã HD, tên khách, SĐT..."
            className="w-full pl-9 pr-3 py-2 bg-zinc-800 border border-zinc-600 text-amber-400 placeholder:text-zinc-500 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500" />
        </div>
        <select value={pmFilter} onChange={e => setPmFilter(e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-600 text-amber-400 rounded-lg text-sm focus:outline-none cursor-pointer">
          <option value="">Tất cả hình thức</option>
          <option value="CASH">Tiền mặt</option>
          <option value="QR">VietQR CK</option>
          <option value="CARD">Quẹt thẻ</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 bg-zinc-800 border border-zinc-600 text-amber-400 rounded-lg text-sm focus:outline-none cursor-pointer">
          <option value="">Tất cả trạng thái</option>
          <option value="completed">Hoàn thành</option>
          <option value="cancelled">Đã hủy</option>
        </select>
      </div>

      {/* Invoice table */}
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-zinc-500">
            <FileText className="w-10 h-10 mx-auto stroke-1 mb-2" />
            <p className="text-xs font-semibold">Không tìm thấy hóa đơn</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-zinc-800 border-b border-zinc-700 text-zinc-400 text-xs font-bold uppercase tracking-wider">
                  <th className="px-3 py-3 w-10 text-center">#</th>
                  <th className="px-4 py-3 font-mono">Mã HD</th>
                  <th className="px-4 py-3">Thời gian</th>
                  <th className="px-4 py-3">Khách hàng</th>
                  <th className="px-4 py-3 text-right">Tổng tiền</th>
                  <th className="px-4 py-3 text-center">Hình thức</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                  <th className="px-4 py-3 text-center">T.Toán</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(inv => {
                  const isOpen = expandedId === inv.id;
                  const cancelled = isCancelled(inv);
                  return (
                    <React.Fragment key={inv.id}>
                      <tr
                        onClick={() => {
                          setExpandedId(isOpen ? null : inv.id);
                          setRowError(''); setNoteEditId(null);
                        }}
                        className={`border-b border-zinc-800 cursor-pointer transition-colors
                          ${isOpen ? 'bg-amber-950/20' : 'hover:bg-zinc-800/60'}
                          ${cancelled ? 'opacity-50' : ''}`}
                      >
                        <td className="px-3 py-3 text-center text-zinc-500 text-xs font-mono">{filtered.indexOf(inv) + 1}</td>
                        <td className="px-4 py-3 font-mono font-bold text-amber-400">{inv.id}</td>
                        <td className="px-4 py-3 text-zinc-400 text-xs font-mono whitespace-nowrap">
                          {new Date(inv.timestamp).toLocaleDateString('vi-VN')}{' '}
                          {new Date(inv.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="px-4 py-3">
                          {inv.customerName
                            ? <><p className="font-semibold text-amber-300">{inv.customerName}</p>
                                {inv.customerPhone && <p className="text-[10px] text-zinc-500 font-mono">{inv.customerPhone}</p>}</>
                            : <span className="text-zinc-500 text-xs">Khách lẻ</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-amber-400 whitespace-nowrap">
                          {fmt(inv.finalAmount)}
                          {inv.discountAmount > 0 && (
                            <span className="block text-[10px] text-emerald-400 font-normal">-{fmt(inv.discountAmount)}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${PM_COLOR[inv.paymentMethod] ?? ''}`}>
                            {PM_LABEL[inv.paymentMethod] ?? inv.paymentMethod}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {cancelled
                            ? <span className="px-2 py-0.5 bg-rose-900/40 text-rose-300 border border-rose-700 rounded-md text-[10px] font-bold">Đã hủy</span>
                            : <span className="px-2 py-0.5 bg-emerald-900/40 text-emerald-300 border border-emerald-700 rounded-md text-[10px] font-bold">Hoàn thành</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {!cancelled && (
                            <button
                              onClick={e => { e.stopPropagation(); onUpdateInvoice({ ...inv, paymentStatus: (inv.paymentStatus ?? 'paid') === 'paid' ? 'unpaid' : 'paid' }); }}
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border cursor-pointer transition ${
                                (inv.paymentStatus ?? 'paid') === 'paid'
                                  ? 'bg-emerald-900/40 text-emerald-300 border-emerald-700'
                                  : 'bg-amber-900/40 text-amber-300 border-amber-700'
                              }`}>
                              {(inv.paymentStatus ?? 'paid') === 'paid' ? 'Đã TT' : 'Chưa TT'}
                            </button>
                          )}
                          {cancelled && <span className="text-zinc-600 text-xs">—</span>}
                        </td>
                        <td className="px-4 py-3">
                          <ChevronDown className={`w-4 h-4 text-zinc-500 transition-transform duration-200 ${isOpen ? 'rotate-180 text-amber-400' : ''}`} />
                        </td>
                      </tr>

                      {isOpen && (
                        <tr className="bg-amber-950/10 border-b border-zinc-800">
                          <td colSpan={9} className="px-5 py-4">
                            <div className="space-y-4" onClick={e => e.stopPropagation()}>

                              {/* Items table */}
                              <div className="overflow-x-auto rounded-xl border border-zinc-700">
                                <table className="w-full text-sm text-left">
                                  <thead className="bg-zinc-800 border-b border-zinc-700 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                                    <tr>
                                      <th className="px-3 py-2">Mã hàng</th>
                                      <th className="px-3 py-2">Tên hàng</th>
                                      <th className="px-3 py-2 text-center">SL</th>
                                      <th className="px-3 py-2 text-right">Đơn giá</th>
                                      <th className="px-3 py-2 text-right">Thành tiền</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-zinc-800">
                                    {inv.items.map((it, i) => (
                                      <tr key={i} className="bg-zinc-900">
                                        <td className="px-3 py-2 font-mono text-xs text-blue-400 font-bold">{it.product.sku}</td>
                                        <td className="px-3 py-2">
                                          <p className="font-semibold text-amber-400">{it.product.name}</p>
                                          {it.product.brand && <p className="text-[10px] text-zinc-500">{it.product.brand}</p>}
                                        </td>
                                        <td className="px-3 py-2 text-center font-bold text-amber-300">{it.quantity}</td>
                                        <td className="px-3 py-2 text-right font-mono text-zinc-400">{fmt(it.product.sellingPrice)}</td>
                                        <td className="px-3 py-2 text-right font-mono font-bold text-amber-400">{fmt(it.product.sellingPrice * it.quantity)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>

                              {/* Totals */}
                              <div className="bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 space-y-1.5 text-sm">
                                <div className="flex justify-between text-zinc-400">
                                  <span>Tổng tiền hàng</span>
                                  <span className="font-mono font-bold text-amber-400">{fmt(inv.totalAmount)}</span>
                                </div>
                                {inv.discountAmount > 0 && (
                                  <div className="flex justify-between text-zinc-400">
                                    <span>Giảm giá ({inv.discountPercent}%)</span>
                                    <span className="font-mono text-emerald-400 font-bold">-{fmt(inv.discountAmount)}</span>
                                  </div>
                                )}
                                <div className="flex justify-between border-t border-zinc-700 pt-1.5">
                                  <span className="font-bold text-amber-300">Khách trả</span>
                                  <span className="font-mono font-extrabold text-blue-400 text-base">{fmt(inv.finalAmount)}</span>
                                </div>
                                <div className="flex items-center gap-2 text-xs text-zinc-400">
                                  {inv.paymentMethod === 'CASH'
                                    ? <Banknote className="w-3.5 h-3.5 text-emerald-400" />
                                    : inv.paymentMethod === 'QR'
                                    ? <QrCode className="w-3.5 h-3.5 text-blue-400" />
                                    : <CreditCard className="w-3.5 h-3.5 text-amber-400" />}
                                  <span>{PM_LABEL[inv.paymentMethod]}</span>
                                  <CheckCircle2 className="w-3 h-3 text-emerald-400 ml-auto" />
                                  <span className="text-emerald-400 font-semibold">Đã thanh toán</span>
                                </div>
                              </div>

                              {/* Notes */}
                              {noteEditId === inv.id ? (
                                <div className="space-y-2">
                                  <textarea rows={2} value={noteVal} onChange={e => setNoteVal(e.target.value)}
                                    className="w-full px-3 py-2 bg-zinc-800 border border-zinc-600 text-amber-400 placeholder:text-zinc-500 rounded-lg text-sm focus:outline-none focus:border-amber-500 resize-none"
                                    placeholder="Ghi chú..." />
                                  {rowError && <p className="text-xs text-rose-400">{rowError}</p>}
                                  <div className="flex gap-2">
                                    <button onClick={() => setNoteEditId(null)}
                                      className="px-3 py-1 border border-zinc-600 text-zinc-400 hover:text-amber-400 rounded-lg text-xs font-bold cursor-pointer">Hủy</button>
                                    <button onClick={() => saveNote(inv)} disabled={noteSaving}
                                      className="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-60 text-black rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1">
                                      <Check className="w-3 h-3" /> {noteSaving ? 'Lưu...' : 'Lưu ghi chú'}
                                    </button>
                                  </div>
                                </div>
                              ) : inv.notes ? (
                                <div className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 flex items-start justify-between gap-2">
                                  <span className="text-xs text-zinc-400 italic">{inv.notes}</span>
                                  {!cancelled && (
                                    <button onClick={() => { setNoteEditId(inv.id); setNoteVal(inv.notes ?? ''); setRowError(''); }}
                                      className="text-zinc-500 hover:text-amber-400 cursor-pointer shrink-0">
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              ) : !cancelled ? (
                                <button onClick={() => { setNoteEditId(inv.id); setNoteVal(''); setRowError(''); }}
                                  className="text-xs text-zinc-500 hover:text-amber-400 cursor-pointer flex items-center gap-1">
                                  <Pencil className="w-3 h-3" /> Thêm ghi chú
                                </button>
                              ) : null}


                              {/* Actions */}
                              <div className="flex flex-wrap gap-2 pt-2 border-t border-zinc-800">
                                {!cancelled && (
                                  <>
                                    <button onClick={() => openEdit(inv)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-black text-xs font-bold rounded-lg cursor-pointer transition">
                                      <Pencil className="w-3.5 h-3.5" /> Sửa hóa đơn
                                    </button>
                                    <button onClick={() => openReturn(inv)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-900/40 hover:bg-teal-900/60 text-teal-400 border border-teal-700 text-xs font-bold rounded-lg cursor-pointer transition">
                                      <RotateCcw className="w-3.5 h-3.5" /> Trả hàng
                                    </button>
                                  </>
                                )}
                                <button onClick={() => onPrintInvoice(inv)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-700 hover:bg-blue-600 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                                  <Printer className="w-3.5 h-3.5" /> In hóa đơn
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
          </div>
        )}
      </div>

      {/* Edit Invoice Modal */}
      <AnimatePresence>
        {editInv && (
          <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto"
            onClick={() => setEditInv(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-800 border border-zinc-600 rounded-2xl shadow-2xl w-full max-w-5xl my-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
                <div>
                  <h3 className="font-bold text-amber-400">Sửa hóa đơn — {editInv.id}</h3>
                  <p className="text-xs text-amber-500/70 mt-0.5">⚠ Thay đổi số lượng sẽ ảnh hưởng tồn kho</p>
                </div>
                <button onClick={() => setEditInv(null)} className="text-zinc-500 hover:text-amber-400 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4 overflow-y-auto max-h-[60vh]">
                {/* Customer */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-400 mb-1 block">Tên khách hàng</label>
                    <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Khách lẻ"
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 text-amber-400 placeholder:text-zinc-600 rounded-lg text-sm focus:outline-none focus:border-amber-500" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-400 mb-1 block">Số điện thoại</label>
                    <input value={editPhone} onChange={e => setEditPhone(e.target.value)} placeholder="0912..."
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 text-amber-400 placeholder:text-zinc-600 rounded-lg text-sm font-mono focus:outline-none focus:border-amber-500" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-400 mb-1 block">Hình thức thanh toán</label>
                    <select value={editPm} onChange={e => setEditPm(e.target.value)}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 text-amber-400 rounded-lg text-sm focus:outline-none cursor-pointer">
                      <option value="CASH">Tiền mặt</option>
                      <option value="QR">VietQR Chuyển khoản</option>
                      <option value="CARD">Quẹt thẻ</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-400 mb-1 block">Giảm giá (%)</label>
                    <input type="number" min={0} max={100} value={editDisc}
                      onChange={e => setEditDisc(Number(e.target.value))}
                      className="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 text-amber-400 rounded-lg text-sm font-mono focus:outline-none focus:border-amber-500" />
                  </div>
                </div>

                {/* Items */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-zinc-400">Sản phẩm</label>
                    <select
                      onChange={e => { if (e.target.value) { addEditProduct(e.target.value); e.target.value = ''; } }}
                      className="px-2 py-1 bg-zinc-900 border border-zinc-600 text-amber-400 rounded-lg text-xs cursor-pointer focus:outline-none">
                      <option value="">+ Thêm sản phẩm</option>
                      {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                    </select>
                  </div>
                  <div className="rounded-xl border border-zinc-700 overflow-hidden">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-zinc-900 border-b border-zinc-700 text-zinc-500 font-bold uppercase tracking-wider">
                        <tr>
                          <th className="px-3 py-2">Sản phẩm</th>
                          <th className="px-3 py-2 text-right">Đơn giá</th>
                          <th className="px-3 py-2 text-center w-20">SL</th>
                          <th className="px-3 py-2 text-right">T.Tiền</th>
                          <th className="px-3 py-2 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800">
                        {editItems.map((it, idx) => (
                          <tr key={idx} className="bg-zinc-800">
                            <td className="px-3 py-2">
                              <p className="font-semibold text-amber-400">{it.name}</p>
                              <p className="text-[10px] font-mono text-zinc-500">{it.sku}</p>
                            </td>
                            <td className="px-3 py-2 text-right font-mono text-zinc-400">{fmt(it.price)}</td>
                            <td className="px-3 py-2">
                              <input type="number" min={0.001} step={0.001} value={it.qty}
                                onChange={e => setEditItems(prev => prev.map((x, i) => i === idx ? { ...x, qty: Number(e.target.value) || 0 } : x))}
                                className="w-full px-2 py-1 bg-zinc-900 border border-zinc-600 text-amber-400 rounded-lg text-xs text-center font-mono focus:outline-none focus:border-amber-500" />
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-bold text-amber-400">{fmt(it.price * it.qty)}</td>
                            <td className="px-3 py-2 text-center">
                              <button onClick={() => setEditItems(prev => prev.filter((_, i) => i !== idx))}
                                className="text-zinc-600 hover:text-rose-400 cursor-pointer">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {editItems.length === 0 && (
                          <tr><td colSpan={5} className="px-3 py-4 text-center text-zinc-600 text-xs">Chưa có sản phẩm</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Totals */}
                <div className="bg-zinc-900 border border-zinc-700 rounded-xl px-4 py-3 space-y-1.5 text-sm">
                  <div className="flex justify-between text-zinc-400">
                    <span>Tổng tiền hàng</span>
                    <span className="font-mono font-bold text-amber-400">{fmt(editTotal)}</span>
                  </div>
                  {editDisc > 0 && (
                    <div className="flex justify-between text-zinc-400">
                      <span>Giảm giá ({editDisc}%)</span>
                      <span className="font-mono text-emerald-400 font-bold">-{fmt(editDiscAmt)}</span>
                    </div>
                  )}
                  <div className="flex justify-between border-t border-zinc-700 pt-1.5 font-bold text-amber-300">
                    <span>Khách trả</span>
                    <span className="font-mono text-blue-400 text-base">{fmt(editFinal)}</span>
                  </div>
                </div>

                {editError && (
                  <div className="bg-rose-950/40 border border-rose-700 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-rose-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {editError}
                  </div>
                )}
              </div>

              <div className="flex gap-3 px-5 py-4 border-t border-zinc-700">
                <button onClick={() => setEditInv(null)}
                  className="flex-1 px-4 py-2 border border-zinc-600 text-zinc-400 hover:text-amber-400 hover:border-zinc-500 rounded-lg text-sm font-bold cursor-pointer">
                  Hủy
                </button>
                <button onClick={saveEdit}
                  disabled={editSaving || editItems.filter(it => it.qty > 0).length === 0}
                  className="flex-1 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-black rounded-lg text-sm font-bold cursor-pointer">
                  {editSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Return Orders List Modal */}
      <AnimatePresence>
        {showReturnOrders && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            onClick={() => setShowReturnOrders(false)}>
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-800 border border-zinc-600 rounded-2xl shadow-2xl w-full max-w-5xl my-4"
              onClick={e => e.stopPropagation()}
            >
              <div className="flex items-center justify-between p-5 border-b border-zinc-700">
                <h3 className="font-bold text-teal-400 flex items-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  Danh sách phiếu trả hàng ({returnsInRange.length})
                </h3>
                <button onClick={() => setShowReturnOrders(false)} className="text-zinc-500 hover:text-amber-400 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="overflow-auto max-h-[70vh]">
                {returnsInRange.length === 0 ? (
                  <div className="p-12 text-center text-zinc-500">
                    <RotateCcw className="w-10 h-10 mx-auto stroke-1 mb-2" />
                    <p className="text-xs font-semibold">Không có phiếu trả hàng</p>
                  </div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-900 border-b border-zinc-700 text-zinc-400 text-xs font-bold uppercase tracking-wider sticky top-0">
                      <tr>
                        <th className="px-3 py-3 w-10 text-center">STT</th>
                        <th className="px-4 py-3 font-mono">Mã phiếu TH</th>
                        <th className="px-4 py-3">Thời gian</th>
                        <th className="px-4 py-3">Hóa đơn gốc</th>
                        <th className="px-4 py-3">Sản phẩm</th>
                        <th className="px-4 py-3 text-right">Tổng hoàn</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800">
                      {[...returnsInRange].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map((ro, i) => (
                        <tr key={ro.id} className="hover:bg-zinc-700/30 transition-colors">
                          <td className="px-3 py-3 text-center text-zinc-500 text-xs font-mono">{i + 1}</td>
                          <td className="px-4 py-3 font-mono font-bold text-teal-400">{ro.id}</td>
                          <td className="px-4 py-3 text-zinc-400 text-xs font-mono whitespace-nowrap">
                            {new Date(ro.timestamp).toLocaleString('vi-VN')}
                          </td>
                          <td className="px-4 py-3 font-mono text-zinc-400 text-xs">{ro.invoiceId}</td>
                          <td className="px-4 py-3 text-zinc-300 text-xs">{ro.items.length} sản phẩm</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-rose-400">{fmt(ro.totalRefund)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Return Order Modal */}
      <AnimatePresence>
        {returnInv && (
          <div
            className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 overflow-y-auto"
            onClick={() => setReturnInv(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-800 border border-zinc-600 rounded-2xl shadow-2xl w-full max-w-3xl my-4"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-700">
                <div>
                  <h3 className="font-bold text-teal-400 flex items-center gap-2">
                    <RotateCcw className="w-4 h-4" /> Tạo phiếu trả hàng
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Tham chiếu: <span className="font-mono text-amber-400">{returnInv.id}</span>
                    {' · '}{new Date(returnInv.timestamp).toLocaleDateString('vi-VN')}
                  </p>
                </div>
                <button onClick={() => setReturnInv(null)} className="text-zinc-500 hover:text-amber-400 cursor-pointer">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 space-y-4">
                {/* Items */}
                <div className="overflow-x-auto rounded-xl border border-zinc-700">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-900 text-zinc-400 uppercase tracking-wider">
                      <tr>
                        <th className="px-3 py-2 text-left">Sản phẩm</th>
                        <th className="px-3 py-2 text-right">Đơn giá</th>
                        <th className="px-3 py-2 text-right">Đã mua</th>
                        <th className="px-3 py-2 text-right">Đã trả trước</th>
                        <th className="px-3 py-2 text-right">Còn trả được</th>
                        <th className="px-3 py-2 text-center w-36">Số lượng trả</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-700">
                      {returnInv.items.map(it => {
                        const alreadyReturned = getAlreadyReturned(returnInv, it.product.id);
                        const maxReturn = it.quantity - alreadyReturned;
                        const current = returnQtys[it.product.id] ?? 0;
                        const depleted = maxReturn <= 0;
                        return (
                          <tr key={it.product.id} className={depleted ? 'opacity-40' : 'hover:bg-zinc-700/30'}>
                            <td className="px-3 py-2.5">
                              <p className="font-bold text-amber-400">{it.product.name}</p>
                              <p className="text-zinc-500 font-mono">{it.product.sku}</p>
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-amber-300">{fmt(it.product.sellingPrice)}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-zinc-300">{it.quantity}</td>
                            <td className="px-3 py-2.5 text-right font-mono text-rose-400">{alreadyReturned > 0 ? alreadyReturned : '—'}</td>
                            <td className="px-3 py-2.5 text-right font-mono font-bold text-teal-400">{maxReturn}</td>
                            <td className="px-3 py-2.5">
                              {depleted ? (
                                <span className="block text-center text-zinc-600 text-xs">Đã trả hết</span>
                              ) : (
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    onClick={() => setReturnQtys(prev => ({ ...prev, [it.product.id]: Math.max(0, (prev[it.product.id] ?? 0) - 1) }))}
                                    className="w-6 h-6 flex items-center justify-center bg-zinc-700 hover:bg-zinc-600 rounded text-amber-400 cursor-pointer">
                                    <Minus className="w-3 h-3" />
                                  </button>
                                  <input
                                    type="number" min={0} max={maxReturn}
                                    value={current}
                                    onChange={e => {
                                      const v = Math.min(maxReturn, Math.max(0, Number(e.target.value)));
                                      setReturnQtys(prev => ({ ...prev, [it.product.id]: v }));
                                    }}
                                    className="w-14 text-center bg-zinc-900 border border-zinc-600 text-amber-400 rounded text-xs py-1 font-mono focus:outline-none focus:border-teal-500"
                                  />
                                  <button
                                    onClick={() => setReturnQtys(prev => ({ ...prev, [it.product.id]: Math.min(maxReturn, (prev[it.product.id] ?? 0) + 1) }))}
                                    className="w-6 h-6 flex items-center justify-center bg-zinc-700 hover:bg-zinc-600 rounded text-amber-400 cursor-pointer">
                                    <Plus className="w-3 h-3" />
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Notes */}
                <div>
                  <label className="text-xs font-bold text-zinc-400 mb-1 block">Ghi chú</label>
                  <input
                    value={returnNote} onChange={e => setReturnNote(e.target.value)}
                    placeholder="Lý do trả hàng..."
                    className="w-full px-3 py-2 bg-zinc-900 border border-zinc-600 text-amber-400 placeholder:text-zinc-600 rounded-lg text-sm focus:outline-none focus:border-teal-500"
                  />
                </div>

                {/* Total */}
                {(() => {
                  const total = returnInv.items.reduce((s, it) => {
                    const qty = returnQtys[it.product.id] ?? 0;
                    return s + qty * it.product.sellingPrice;
                  }, 0);
                  return total > 0 ? (
                    <div className="bg-teal-900/20 border border-teal-800 rounded-xl px-4 py-3 flex items-center justify-between">
                      <span className="text-xs font-bold text-teal-400">Tổng tiền hoàn trả</span>
                      <span className="text-lg font-extrabold font-mono text-teal-300">{fmt(total)}</span>
                    </div>
                  ) : null;
                })()}

                {returnError && (
                  <div className="bg-rose-950/40 border border-rose-700 rounded-lg px-3 py-2 flex items-center gap-2 text-xs text-rose-400">
                    <AlertTriangle className="w-4 h-4 shrink-0" /> {returnError}
                  </div>
                )}
              </div>

              <div className="flex gap-3 px-5 py-4 border-t border-zinc-700">
                <button onClick={() => setReturnInv(null)}
                  className="flex-1 px-4 py-2 border border-zinc-600 text-zinc-400 hover:text-amber-400 hover:border-zinc-500 rounded-lg text-sm font-bold cursor-pointer">
                  Hủy
                </button>
                <button onClick={doReturn} disabled={returnSaving}
                  className="flex-1 px-4 py-2 bg-teal-700 hover:bg-teal-600 disabled:opacity-50 text-white rounded-lg text-sm font-bold cursor-pointer flex items-center justify-center gap-2">
                  <RotateCcw className="w-4 h-4" />
                  {returnSaving ? 'Đang tạo...' : 'Tạo phiếu trả hàng'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
