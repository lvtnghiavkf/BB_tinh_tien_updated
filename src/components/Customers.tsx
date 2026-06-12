import React, { useState, useMemo, useRef } from 'react';
import { Customer, Invoice } from '../types';
import { Plus, Pencil, Trash2, Search, X, User, Calendar, ShoppingBag, Download, Upload, ChevronDown, Phone, Mail, MapPin } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';

interface CustomersProps {
  customers: Customer[];
  invoices: Invoice[];
  onAdd: (c: Customer) => void;
  onUpdate: (c: Customer) => void;
  onDelete: (id: string) => void;
}

const EMPTY_FORM = { code: '', fullName: '', phone: '', email: '', birthDate: '', address: '', notes: '' };

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }

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
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const xlsxRef = useRef<HTMLInputElement>(null);

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(customers.map(c => ({
      'Họ tên': c.fullName, 'Điện thoại': c.phone,
      'Ngày sinh': c.birthDate ?? '', 'Email': c.email ?? '', 'Ghi chú': c.notes ?? '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Khách hàng');
    XLSX.writeFile(wb, `khach_hang_${new Date().toISOString().slice(0,10)}.xlsx`);
  }

  async function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as any[];
      for (const r of rows) {
        if (!r['Họ tên']) continue;
        const c: Customer = {
          id: `cust_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          fullName: String(r['Họ tên']), phone: String(r['Điện thoại'] ?? ''),
          birthDate: r['Ngày sinh'] ? String(r['Ngày sinh']) : undefined,
          email: r['Email'] ? String(r['Email']) : undefined,
          notes: r['Ghi chú'] ? String(r['Ghi chú']) : undefined,
          createdAt: new Date().toISOString(),
        };
        try { await onAdd(c); } catch { /* skip dup */ }
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

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

  const customerStats = useMemo(() => {
    const map: Record<string, { count: number; total: number; last?: string }> = {};
    invoices.forEach(inv => {
      if (!inv.customerPhone) return;
      const k = inv.customerPhone;
      if (!map[k]) map[k] = { count: 0, total: 0 };
      map[k].count++;
      map[k].total += inv.finalAmount;
      if (!map[k].last || inv.timestamp > map[k].last!) map[k].last = inv.timestamp;
    });
    return map;
  }, [invoices]);

  function openAdd() {
    setEditingId(null); setForm(EMPTY_FORM); setErrors({}); setShowForm(true);
  }

  function openEdit(c: Customer) {
    setEditingId(c.id);
    setForm({ code: c.code ?? '', fullName: c.fullName, phone: c.phone, email: c.email ?? '', birthDate: c.birthDate ?? '', address: c.address ?? '', notes: c.notes ?? '' });
    setErrors({}); setShowForm(true);
  }

  function openHistory(c: Customer) {
    setHistoryFor(c);
    setHistoryFrom(toDateStr(new Date(today.getFullYear(), today.getMonth(), 1)));
    setHistoryTo(toDateStr(today));
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
        await onUpdate({ ...existing, code: form.code.trim() || undefined, fullName: form.fullName.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined, birthDate: form.birthDate || undefined, address: form.address.trim() || undefined, notes: form.notes.trim() || undefined });
      } else {
        await onAdd({ id: `cust_${Date.now()}`, code: form.code.trim() || undefined, fullName: form.fullName.trim(), phone: form.phone.trim(), email: form.email.trim() || undefined, birthDate: form.birthDate || undefined, address: form.address.trim() || undefined, notes: form.notes.trim() || undefined, createdAt: new Date().toISOString() });
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
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm tên, SĐT, email..."
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500" />
        </div>
        <input ref={xlsxRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
        <button onClick={() => xlsxRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-bold cursor-pointer transition whitespace-nowrap">
          <Upload className="w-4 h-4" /> Nhập Excel
        </button>
        <button onClick={exportExcel}
          className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-bold cursor-pointer transition whitespace-nowrap">
          <Download className="w-4 h-4" /> Xuất Excel
        </button>
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
                  <th className="px-3 py-3 w-10 text-center text-zinc-400 text-xs font-bold uppercase">#</th>
                  <th className="px-4 py-3">Họ tên</th>
                  <th className="px-4 py-3">Điện thoại</th>
                  <th className="px-4 py-3">Ngày sinh</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Ghi chú</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c, idx) => (
                  <React.Fragment key={c.id}>
                    <tr
                      className={`transition cursor-pointer ${expandedId === c.id ? 'bg-amber-950/20' : 'hover:bg-zinc-800/40'}`}
                      onClick={() => setExpandedId(expandedId === c.id ? null : c.id)}
                    >
                      <td className="px-3 py-3 text-center text-zinc-500 text-xs">{idx + 1}</td>
                      <td className="px-4 py-3 font-semibold text-slate-800">
                        {c.fullName}
                        {c.code && <span className="text-[10px] font-mono text-zinc-500 ml-1">{c.code}</span>}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-600">{c.phone}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{c.birthDate ? new Date(c.birthDate + 'T00:00:00').toLocaleDateString('vi-VN') : '—'}</td>
                      <td className="px-4 py-3 text-slate-500 text-xs">{c.email || '—'}</td>
                      <td className="px-4 py-3 text-slate-400 text-xs max-w-[150px] truncate">{c.notes || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${expandedId === c.id ? 'rotate-180 text-blue-500' : ''}`} />
                      </td>
                    </tr>
                    {expandedId === c.id && (() => {
                      const stats = customerStats[c.phone];
                      return (
                        <tr>
                          <td colSpan={7} className="px-4 py-4 border-t border-slate-200 bg-zinc-800/20" onClick={e => e.stopPropagation()}>
                            <div className="space-y-3">
                              {/* Info grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                                {/* Điện thoại — luôn hiện */}
                                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 flex gap-2">
                                  <Phone className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                                  <div>
                                    <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Điện thoại</p>
                                    <p className="text-slate-700 font-mono">{c.phone || <span className="italic text-slate-400">Chưa có</span>}</p>
                                  </div>
                                </div>

                                {/* Ngày sinh */}
                                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 flex gap-2">
                                  <Calendar className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
                                  <div>
                                    <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Ngày sinh</p>
                                    {c.birthDate
                                      ? <p className="text-slate-700">{new Date(c.birthDate + 'T00:00:00').toLocaleDateString('vi-VN')}</p>
                                      : <p className="text-slate-400 italic">Chưa có</p>}
                                  </div>
                                </div>

                                {/* Email */}
                                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 flex gap-2">
                                  <Mail className="w-3.5 h-3.5 text-indigo-400 mt-0.5 shrink-0" />
                                  <div>
                                    <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Email</p>
                                    {c.email
                                      ? <p className="text-slate-700">{c.email}</p>
                                      : <p className="text-slate-400 italic">Chưa có</p>}
                                  </div>
                                </div>

                                {/* Địa chỉ */}
                                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 flex gap-2">
                                  <MapPin className="w-3.5 h-3.5 text-orange-400 mt-0.5 shrink-0" />
                                  <div>
                                    <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Địa chỉ</p>
                                    {c.address
                                      ? <p className="text-slate-700">{c.address}</p>
                                      : <p className="text-slate-400 italic">Chưa có</p>}
                                  </div>
                                </div>

                                {/* Tổng mua hàng */}
                                <div className="bg-blue-900/20 rounded-lg border border-blue-700/50 px-3 py-2 flex gap-2">
                                  <ShoppingBag className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                                  <div>
                                    <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Lịch sử mua</p>
                                    {stats
                                      ? <>
                                          <p className="text-slate-700 font-semibold">{stats.count} hóa đơn</p>
                                          <p className="text-blue-600 font-mono font-bold">{formatVND(stats.total)}</p>
                                        </>
                                      : <p className="text-slate-400 italic">Chưa có</p>}
                                  </div>
                                </div>

                                {/* Ghi chú */}
                                {c.notes && (
                                  <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                                    <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Ghi chú</p>
                                    <p className="text-slate-700">{c.notes}</p>
                                  </div>
                                )}
                              </div>

                              {/* Actions */}
                              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200">
                                <button onClick={e => { e.stopPropagation(); openHistory(c); }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                                  <ShoppingBag className="w-3.5 h-3.5" /> Lịch sử mua hàng
                                </button>
                                <button onClick={e => { e.stopPropagation(); openEdit(c); }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                                  <Pencil className="w-3.5 h-3.5" /> Chỉnh sửa
                                </button>
                                <button onClick={e => { e.stopPropagation(); setDeleteConfirm(c.id); }}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                                  <Trash2 className="w-3.5 h-3.5" /> Xóa
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })()}
                  </React.Fragment>
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
                  <label className="text-xs font-bold text-zinc-400 mb-1 block">Mã khách hàng</label>
                  <input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-700 rounded-lg text-sm focus:outline-none bg-zinc-800 text-amber-400 font-mono" placeholder="VD: KH001" />
                </div>
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
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Địa chỉ</label>
                  <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/TP" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Ghi chú</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                    placeholder="Khách VIP, ..." />
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
              <div className="px-5 py-3 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center gap-3">
                <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
                <span className="text-xs font-bold text-slate-600">Từ ngày:</span>
                <input type="date" value={historyFrom} max={historyTo} onChange={e => setHistoryFrom(e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500" />
                <span className="text-xs font-bold text-slate-600">Đến ngày:</span>
                <input type="date" value={historyTo} min={historyFrom} max={toDateStr(today)} onChange={e => setHistoryTo(e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-blue-500" />
              </div>
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
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {historyInvoices.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm">Không có đơn hàng trong khoảng thời gian này.</div>
                ) : historyInvoices.map(inv => (
                  <div key={inv.id} className="border border-slate-200 rounded-xl p-4 space-y-2 bg-zinc-800/20">
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
