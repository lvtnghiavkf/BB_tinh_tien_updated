import React, { useState, useMemo } from 'react';
import { Customer, Invoice } from '../types';
import { Plus, Pencil, Trash2, Search, X, Eye, User, Phone, Calendar, Mail, ShoppingBag } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface CustomersProps {
  customers: Customer[];
  invoices: Invoice[];
  onAdd: (c: Customer) => void;
  onUpdate: (c: Customer) => void;
  onDelete: (id: string) => void;
}

const EMPTY_FORM = { fullName: '', phone: '', email: '', birthDate: '', notes: '' };

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }

const formatVND = (v: number) => v.toLocaleString('vi-VN') + ' ₫';

export default function Customers({ customers, invoices, onAdd, onUpdate, onDelete }: CustomersProps) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [historyFor, setHistoryFor] = useState<Customer | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // History date range
  const today = new Date();
  const [historyFrom, setHistoryFrom] = useState(toDateStr(new Date(today.getFullYear(), today.getMonth(), 1)));
  const [historyTo, setHistoryTo] = useState(toDateStr(today));

  const filtered = useMemo(() => {
    if (!search) return customers;
    const q = search.toLowerCase();
    return customers.filter(c =>
      c.fullName.toLowerCase().includes(q) ||
      c.phone.includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    );
  }, [customers, search]);

  const historyInvoices = useMemo(() => {
    if (!historyFor) return [];
    const from = new Date(historyFrom + 'T00:00:00').getTime();
    const to = new Date(historyTo + 'T23:59:59').getTime();
    return invoices.filter(inv => {
      const t = new Date(inv.timestamp).getTime();
      return inv.customerPhone === historyFor.phone && t >= from && t <= to;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [historyFor, invoices, historyFrom, historyTo]);

  const historyStats = useMemo(() => {
    const totalAmount = historyInvoices.reduce((s, inv) => s + inv.finalAmount, 0);
    const totalItems = historyInvoices.reduce((s, inv) => s + inv.items.reduce((si, it) => si + it.quantity, 0), 0);
    return { totalAmount, totalItems };
  }, [historyInvoices]);

  function openAdd() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setShowForm(true);
  }

  function openEdit(c: Customer) {
    setEditingId(c.id);
    setForm({ fullName: c.fullName, phone: c.phone, email: c.email ?? '', birthDate: c.birthDate ?? '', notes: c.notes ?? '' });
    setErrors({});
    setShowForm(true);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'Vui lòng nhập họ tên';
    if (!form.phone.trim()) e.phone = 'Vui lòng nhập số điện thoại';
    return e;
  }

  async function handleSave() {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setSaving(true);
    try {
      if (editingId) {
        const existing = customers.find(c => c.id === editingId)!;
        await onUpdate({ ...existing, fullName: form.fullName.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined, birthDate: form.birthDate || undefined, notes: form.notes.trim() || undefined });
      } else {
        await onAdd({ id: `cust_${Date.now()}`, fullName: form.fullName.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined, birthDate: form.birthDate || undefined, notes: form.notes.trim() || undefined, createdAt: new Date().toISOString() });
      }
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm tên, SĐT, email..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
          />
        </div>
        <button onClick={openAdd}
          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-sm transition cursor-pointer whitespace-nowrap">
          <Plus className="w-4 h-4" /> Thêm khách hàng
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <User className="w-10 h-10 mx-auto stroke-1 mb-2 text-slate-300" />
            <p className="text-sm font-semibold">{search ? 'Không tìm thấy khách hàng' : 'Chưa có khách hàng nào'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Họ tên</th>
                  <th className="px-4 py-3">Điện thoại</th>
                  <th className="px-4 py-3">Ngày sinh</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Ghi chú</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(c => (
                  <tr key={c.id} className="hover:bg-slate-50/50 transition">
                    <td className="px-4 py-3 font-semibold text-slate-800">{c.fullName}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{c.phone}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{c.birthDate ? new Date(c.birthDate + 'T00:00:00').toLocaleDateString('vi-VN') : '—'}</td>
                    <td className="px-4 py-3 text-slate-500 text-xs">{c.email || '—'}</td>
                    <td className="px-4 py-3 text-slate-400 text-xs max-w-[150px] truncate">{c.notes || '—'}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => { setHistoryFor(c); setHistoryFrom(toDateStr(new Date(today.getFullYear(), today.getMonth(), 1))); setHistoryTo(toDateStr(today)); }}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition cursor-pointer" title="Lịch sử mua hàng">
                          <ShoppingBag className="w-4 h-4" />
                        </button>
                        <button onClick={() => openEdit(c)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer" title="Sửa">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => setDeleteConfirm(c.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer" title="Xóa">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between p-5 border-b border-slate-200">
                <h3 className="font-bold text-slate-800">{editingId ? 'Sửa khách hàng' : 'Thêm khách hàng'}</h3>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Họ tên <span className="text-rose-500">*</span></label>
                  <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${errors.fullName ? 'border-rose-400' : 'border-slate-200'}`}
                    placeholder="Nguyễn Văn A" />
                  {errors.fullName && <p className="text-xs text-rose-500 mt-1">{errors.fullName}</p>}
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Điện thoại <span className="text-rose-500">*</span></label>
                  <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${errors.phone ? 'border-rose-400' : 'border-slate-200'}`}
                    placeholder="0912 345 678" />
                  {errors.phone && <p className="text-xs text-rose-500 mt-1">{errors.phone}</p>}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">Ngày sinh</label>
                    <input type="date" value={form.birthDate} onChange={e => setForm(f => ({ ...f, birthDate: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">Email</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                      placeholder="email@domain.com" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Ghi chú</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                    placeholder="Khách VIP, địa chỉ, ..." />
                </div>
              </div>
              <div className="flex gap-3 p-5 border-t border-slate-200">
                <button onClick={() => setShowForm(false)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-bold transition cursor-pointer">Hủy</button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold shadow-sm transition cursor-pointer">
                  {saving ? 'Đang lưu...' : 'Lưu'}
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
              <h3 className="font-bold text-slate-800 mb-2">Xóa khách hàng?</h3>
              <p className="text-sm text-slate-500 mb-5">Hành động này không thể hoàn tác.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold cursor-pointer">Hủy</button>
                <button onClick={async () => { await onDelete(deleteConfirm); setDeleteConfirm(null); }}
                  className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold cursor-pointer">Xóa</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Order History Modal */}
      <AnimatePresence>
        {historyFor && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between p-5 border-b border-slate-200">
                <div>
                  <h3 className="font-bold text-slate-800">Lịch sử mua hàng — {historyFor.fullName}</h3>
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">{historyFor.phone}</p>
                </div>
                <button onClick={() => setHistoryFor(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>

              {/* Range filter */}
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center gap-3">
                <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-xs font-bold text-slate-600">Từ ngày:</span>
                <input type="date" value={historyFrom} max={historyTo} onChange={e => setHistoryFrom(e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500" />
                <span className="text-xs font-bold text-slate-600">Đến ngày:</span>
                <input type="date" value={historyTo} min={historyFrom} max={toDateStr(today)} onChange={e => setHistoryTo(e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500" />
              </div>

              {/* Summary */}
              <div className="px-5 py-3 border-b border-slate-100 flex gap-6 flex-wrap">
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Tổng chi tiêu</p>
                  <p className="text-lg font-extrabold text-blue-600 font-mono">{formatVND(historyStats.totalAmount)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Số đơn hàng</p>
                  <p className="text-lg font-extrabold text-slate-800">{historyInvoices.length}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Tổng sản phẩm</p>
                  <p className="text-lg font-extrabold text-slate-800">{historyStats.totalItems}</p>
                </div>
              </div>

              {/* Invoice list */}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {historyInvoices.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm">Không có đơn hàng trong khoảng thời gian này.</div>
                ) : historyInvoices.map(inv => (
                  <div key={inv.id} className="border border-slate-200 rounded-xl p-4 space-y-2 bg-slate-50/50">
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-xs text-slate-600">{inv.id}</span>
                      <span className="text-xs text-slate-400">{new Date(inv.timestamp).toLocaleString('vi-VN')}</span>
                    </div>
                    <div className="text-xs text-slate-600 space-y-0.5">
                      {inv.items.map((it, i) => (
                        <div key={i} className="flex justify-between">
                          <span>{it.product.name} <span className="text-slate-400">×{it.quantity}</span></span>
                          <span className="font-mono">{formatVND(it.product.sellingPrice * it.quantity)}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between pt-2 border-t border-slate-200">
                      <span className="text-xs text-slate-500">{inv.paymentMethod === 'CASH' ? 'Tiền mặt' : inv.paymentMethod === 'QR' ? 'VietQR' : 'Thẻ'}</span>
                      <span className="font-bold font-mono text-sm text-blue-700">{formatVND(inv.finalAmount)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
