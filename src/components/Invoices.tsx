import React, { useState, useMemo } from 'react';
import { Invoice, Product } from '../types';
import {
  Search, FileText, X, Printer, Ban, ChevronDown,
  Receipt, CreditCard, Banknote, QrCode, CheckCircle2,
  AlertTriangle, History, Pencil, Check,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface InvoicesProps {
  invoices: Invoice[];
  products: Product[];
  onUpdateInvoice: (inv: Invoice) => Promise<void>;
  onPrintInvoice: (inv: Invoice) => void;
}

const formatVND = (v: number) => v.toLocaleString('vi-VN') + ' ₫';

const PM_LABEL: Record<string, string> = { CASH: 'Tiền mặt', QR: 'VietQR CK', CARD: 'Quẹt thẻ' };
const PM_COLOR: Record<string, string> = {
  CASH: 'bg-emerald-50 text-emerald-700 border border-emerald-100',
  QR: 'bg-blue-50 text-blue-700 border border-blue-100',
  CARD: 'bg-amber-50 text-amber-700 border border-amber-100',
};

export default function Invoices({ invoices, products: _products, onUpdateInvoice, onPrintInvoice }: InvoicesProps) {
  const [search, setSearch] = useState('');
  const [pmFilter, setPmFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedInv, setSelectedInv] = useState<Invoice | null>(null);
  const [detailTab, setDetailTab] = useState<'info' | 'payment'>('info');
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [notesSaving, setNotesSaving] = useState(false);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [saveError, setSaveError] = useState('');

  const sorted = useMemo(() =>
    [...invoices].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [invoices]);

  const filtered = useMemo(() => {
    let list = sorted;
    if (pmFilter) list = list.filter(i => i.paymentMethod === pmFilter);
    if (statusFilter) list = list.filter(i => (i.status ?? 'completed') === statusFilter);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(i =>
        i.id.toLowerCase().includes(q) ||
        (i.customerName ?? '').toLowerCase().includes(q) ||
        (i.customerPhone ?? '').includes(q)
      );
    }
    return list;
  }, [sorted, search, pmFilter, statusFilter]);

  function openDetail(inv: Invoice) {
    setSelectedInv(inv);
    setDetailTab('info');
    setEditingNotes(false);
    setNotesValue(inv.notes ?? '');
    setSaveError('');
    setCancelConfirm(false);
  }

  async function handleSaveNotes() {
    if (!selectedInv) return;
    setNotesSaving(true);
    setSaveError('');
    try {
      const updated = { ...selectedInv, notes: notesValue.trim() || undefined };
      await onUpdateInvoice(updated);
      setSelectedInv(updated);
      setEditingNotes(false);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Lỗi lưu ghi chú');
    } finally {
      setNotesSaving(false);
    }
  }

  async function handleCancel() {
    if (!selectedInv) return;
    setCancelling(true);
    setSaveError('');
    try {
      const updated = { ...selectedInv, status: 'cancelled' as const };
      await onUpdateInvoice(updated);
      setSelectedInv(updated);
      setCancelConfirm(false);
    } catch (e: any) {
      setSaveError(e?.message ?? 'Lỗi hủy hóa đơn');
    } finally {
      setCancelling(false);
    }
  }

  const isCancelled = (inv: Invoice) => (inv.status ?? 'completed') === 'cancelled';

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm mã HD, tên khách, SĐT..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>
        <select value={pmFilter} onChange={e => setPmFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none cursor-pointer">
          <option value="">Tất cả hình thức</option>
          <option value="CASH">Tiền mặt</option>
          <option value="QR">VietQR CK</option>
          <option value="CARD">Quẹt thẻ</option>
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none cursor-pointer">
          <option value="">Tất cả trạng thái</option>
          <option value="completed">Hoàn thành</option>
          <option value="cancelled">Đã hủy</option>
        </select>
      </div>

      {/* Invoice list */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <FileText className="w-10 h-10 mx-auto stroke-1 text-slate-300 mb-2" />
            <p className="text-xs font-semibold">Không tìm thấy hóa đơn</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                  <th className="px-4 py-3 font-mono">Mã Hóa Đơn</th>
                  <th className="px-4 py-3">Thời Gian</th>
                  <th className="px-4 py-3">Khách Hàng</th>
                  <th className="px-4 py-3 text-right">Tổng Tiền</th>
                  <th className="px-4 py-3 text-center">Hình thức</th>
                  <th className="px-4 py-3 text-center">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filtered.map(inv => (
                  <tr key={inv.id} className={`hover:bg-slate-50/60 transition ${isCancelled(inv) ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3 font-mono font-bold text-slate-800">{inv.id}</td>
                    <td className="px-4 py-3 text-slate-500 whitespace-nowrap text-xs font-mono">
                      {new Date(inv.timestamp).toLocaleDateString('vi-VN')}{' '}
                      {new Date(inv.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-3">
                      {inv.customerName
                        ? <div><p className="font-semibold text-slate-800">{inv.customerName}</p>{inv.customerPhone && <p className="text-[10px] text-slate-400 font-mono">{inv.customerPhone}</p>}</div>
                        : <span className="text-slate-400 text-xs">Khách lẻ</span>}
                    </td>
                    <td className="px-4 py-3 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                      {formatVND(inv.finalAmount)}
                      {inv.discountAmount > 0 && <span className="block text-[10px] text-emerald-600 font-normal">-{formatVND(inv.discountAmount)}</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${PM_COLOR[inv.paymentMethod] ?? ''}`}>
                        {PM_LABEL[inv.paymentMethod] ?? inv.paymentMethod}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isCancelled(inv)
                        ? <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-100 rounded-md text-[10px] font-bold">Đã hủy</span>
                        : <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-md text-[10px] font-bold">Hoàn thành</span>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => openDetail(inv)}
                        className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer">
                        <ChevronDown className="w-3.5 h-3.5" /> Xem
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invoice Detail Modal */}
      <AnimatePresence>
        {selectedInv && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-3xl my-4 flex flex-col max-h-[90vh]">

              {/* Modal header */}
              <div className="flex items-center justify-between p-5 border-b border-slate-200">
                <div className="flex items-center gap-3 flex-wrap">
                  <div>
                    <span className="text-sm font-semibold text-slate-500">
                      {selectedInv.customerName ?? 'Khách lẻ'}
                    </span>
                    <span className="mx-2 text-slate-300">|</span>
                    <span className="font-mono font-bold text-slate-800">{selectedInv.id}</span>
                    <span className="mx-2 text-slate-300">|</span>
                    {isCancelled(selectedInv)
                      ? <span className="text-xs font-bold text-rose-600 bg-rose-50 border border-rose-200 px-2 py-0.5 rounded-md">Đã hủy</span>
                      : <span className="text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">Hoàn thành</span>}
                  </div>
                  <span className="text-xs text-slate-400 ml-auto sm:ml-0">Chi nhánh trung tâm</span>
                </div>
                <button onClick={() => setSelectedInv(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer ml-4"><X className="w-5 h-5" /></button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-slate-200 bg-slate-50">
                {([['info', 'Thông tin'], ['payment', 'Lịch sử thanh toán']] as const).map(([id, label]) => (
                  <button key={id} onClick={() => setDetailTab(id)}
                    className={`px-5 py-2.5 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 ${detailTab === id ? 'text-blue-600 border-b-2 border-blue-600 bg-white' : 'text-slate-500 hover:text-slate-700'}`}>
                    {id === 'info' ? <FileText className="w-3.5 h-3.5" /> : <History className="w-3.5 h-3.5" />}
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto">
                {detailTab === 'info' && (
                  <div className="p-5 space-y-5">
                    {/* Invoice meta */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <div><span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block mb-0.5">Ngày bán</span><span className="font-semibold text-slate-700">{new Date(selectedInv.timestamp).toLocaleString('vi-VN')}</span></div>
                      <div><span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block mb-0.5">Hình thức TT</span><span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${PM_COLOR[selectedInv.paymentMethod] ?? ''}`}>{PM_LABEL[selectedInv.paymentMethod]}</span></div>
                      {selectedInv.customerPhone && <div><span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] block mb-0.5">SĐT</span><span className="font-mono text-slate-700">{selectedInv.customerPhone}</span></div>}
                    </div>

                    {/* Product table */}
                    <div className="overflow-x-auto rounded-xl border border-slate-200">
                      <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                          <tr>
                            <th className="px-3 py-2.5">Mã hàng</th>
                            <th className="px-3 py-2.5">Tên hàng</th>
                            <th className="px-3 py-2.5 text-center">SL</th>
                            <th className="px-3 py-2.5 text-right">Đơn giá</th>
                            <th className="px-3 py-2.5 text-right">Thành tiền</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedInv.items.map((it, i) => (
                            <tr key={i} className="hover:bg-slate-50/50">
                              <td className="px-3 py-2 font-mono text-xs text-blue-600 font-bold">{it.product.sku}</td>
                              <td className="px-3 py-2">
                                <p className="font-semibold text-slate-800">{it.product.name}</p>
                                {it.product.brand && <p className="text-[10px] text-slate-400">{it.product.brand}</p>}
                              </td>
                              <td className="px-3 py-2 text-center font-bold text-slate-700">{it.quantity}</td>
                              <td className="px-3 py-2 text-right font-mono text-slate-600">{formatVND(it.product.sellingPrice)}</td>
                              <td className="px-3 py-2 text-right font-mono font-bold text-slate-800">{formatVND(it.product.sellingPrice * it.quantity)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Totals */}
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-1.5 text-sm">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Tổng tiền hàng ({selectedInv.items.length} SP)</span>
                        <span className="font-mono font-bold text-slate-800">{formatVND(selectedInv.totalAmount)}</span>
                      </div>
                      {selectedInv.discountAmount > 0 && (
                        <div className="flex justify-between">
                          <span className="text-slate-500">Giảm giá hóa đơn ({selectedInv.discountPercent}%)</span>
                          <span className="font-mono text-emerald-600 font-bold">-{formatVND(selectedInv.discountAmount)}</span>
                        </div>
                      )}
                      <div className="flex justify-between border-t border-slate-200 pt-1.5 mt-1.5">
                        <span className="font-bold text-slate-700">Khách cần trả</span>
                        <span className="font-mono font-extrabold text-blue-700 text-base">{formatVND(selectedInv.finalAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="font-bold text-slate-700">Khách đã trả</span>
                        <span className="font-mono font-bold text-emerald-700">{formatVND(selectedInv.finalAmount)}</span>
                      </div>
                    </div>

                    {/* Notes */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Ghi chú</p>
                        {!isCancelled(selectedInv) && !editingNotes && (
                          <button onClick={() => { setEditingNotes(true); setNotesValue(selectedInv.notes ?? ''); }}
                            className="text-xs text-blue-600 hover:text-blue-700 font-bold cursor-pointer flex items-center gap-1">
                            <Pencil className="w-3 h-3" /> Sửa
                          </button>
                        )}
                      </div>
                      {editingNotes ? (
                        <div className="space-y-2">
                          <textarea value={notesValue} onChange={e => setNotesValue(e.target.value)} rows={3}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                            placeholder="Ghi chú cho hóa đơn này..." />
                          <div className="flex gap-2">
                            <button onClick={() => setEditingNotes(false)}
                              className="px-3 py-1.5 border border-slate-200 text-slate-600 rounded-lg text-xs font-bold cursor-pointer">Hủy</button>
                            <button onClick={handleSaveNotes} disabled={notesSaving}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1">
                              <Check className="w-3 h-3" /> {notesSaving ? 'Đang lưu...' : 'Lưu ghi chú'}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-slate-500 italic bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 min-h-[40px]">
                          {selectedInv.notes ?? 'Chưa có ghi chú'}
                        </p>
                      )}
                    </div>

                    {/* Error */}
                    {saveError && (
                      <div className="bg-rose-50 border border-rose-200 rounded-lg px-3 py-2 text-xs text-rose-700 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" /> {saveError}
                      </div>
                    )}
                  </div>
                )}

                {detailTab === 'payment' && (
                  <div className="p-5 space-y-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                        <Receipt className="w-3.5 h-3.5 text-emerald-600" /> Thanh toán
                      </p>
                      <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                        {selectedInv.paymentMethod === 'CASH'
                          ? <Banknote className="w-5 h-5 text-emerald-600" />
                          : selectedInv.paymentMethod === 'QR'
                          ? <QrCode className="w-5 h-5 text-blue-600" />
                          : <CreditCard className="w-5 h-5 text-amber-600" />}
                        <div>
                          <p className="text-sm font-bold text-slate-800">{PM_LABEL[selectedInv.paymentMethod]}</p>
                          <p className="text-xs text-slate-500">{new Date(selectedInv.timestamp).toLocaleString('vi-VN')}</p>
                        </div>
                        <div className="ml-auto text-right">
                          <p className="font-mono font-extrabold text-emerald-700">{formatVND(selectedInv.finalAmount)}</p>
                          <p className="text-xs text-emerald-600 flex items-center justify-end gap-1"><CheckCircle2 className="w-3 h-3" /> Đã thanh toán đủ</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Cancel confirm */}
              <AnimatePresence>
                {cancelConfirm && (
                  <div className="absolute inset-0 bg-white/90 backdrop-blur-sm rounded-2xl flex items-center justify-center p-6 z-10">
                    <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
                      className="bg-white border border-rose-200 rounded-2xl p-6 text-center shadow-xl max-w-sm w-full">
                      <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <AlertTriangle className="w-6 h-6 text-rose-600" />
                      </div>
                      <h3 className="font-bold text-slate-800 mb-2">Hủy hóa đơn {selectedInv.id}?</h3>
                      <p className="text-sm text-slate-500 mb-5">Hành động này không thể hoàn tác. Tồn kho sẽ không tự động được phục hồi.</p>
                      <div className="flex gap-3">
                        <button onClick={() => setCancelConfirm(false)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold cursor-pointer">Không</button>
                        <button onClick={handleCancel} disabled={cancelling}
                          className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
                          {cancelling ? 'Đang hủy...' : 'Xác nhận hủy'}
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              {/* Action footer */}
              <div className="flex items-center justify-between gap-3 p-5 border-t border-slate-200">
                <div className="flex gap-2">
                  {!isCancelled(selectedInv) && (
                    <button onClick={() => setCancelConfirm(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold cursor-pointer transition">
                      <Ban className="w-3.5 h-3.5" /> Hủy HD
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setSelectedInv(null)}
                    className="px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-bold cursor-pointer transition">
                    Đóng
                  </button>
                  <button onClick={() => onPrintInvoice(selectedInv)}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold cursor-pointer transition shadow-sm">
                    <Printer className="w-4 h-4" /> In hóa đơn
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
