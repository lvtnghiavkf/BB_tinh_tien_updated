import React, { useState, useMemo, useRef } from 'react';
import { Partner, PurchaseOrder, PaymentLog } from '../types';
import { Plus, Pencil, Trash2, Search, X, Handshake, Phone, Mail, Tag, ArrowDownToLine, Download, Upload, ChevronDown, MapPin, Building2, CreditCard, CheckCircle2, Banknote } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { insertPaymentLog } from '../lib/db';

interface PartnersProps {
  partners: Partner[];
  purchaseOrders: PurchaseOrder[];
  onAdd: (p: Partner) => void;
  onUpdate: (p: Partner) => void;
  onDelete: (id: string) => void;
  onUpdateOrder: (o: PurchaseOrder) => void;
  onPaymentLogAdded?: (log: PaymentLog) => void;
}

const formatVND = (v: number) => v.toLocaleString('vi-VN') + ' ₫';

type Form = {
  fullName: string; brands: string[]; phones: string[]; emails: string[];
  address: string; bankName: string; bankAccount: string; bankAccountName: string; notes: string;
};
const EMPTY: Form = {
  fullName: '', brands: [''], phones: [''], emails: [''],
  address: '', bankName: '', bankAccount: '', bankAccountName: '', notes: '',
};

const VIET_BANKS = [
  { id: 'MB', name: 'MB Bank' }, { id: 'VCB', name: 'Vietcombank' },
  { id: 'TCB', name: 'Techcombank' }, { id: 'ACB', name: 'ACB' },
  { id: 'BIDV', name: 'BIDV' }, { id: 'ICB', name: 'VietinBank' },
  { id: 'VBARD', name: 'Agribank' }, { id: 'TPB', name: 'TPBank' },
  { id: 'VPB', name: 'VPBank' }, { id: 'STB', name: 'Sacombank' },
  { id: 'SHB', name: 'SHB' }, { id: 'HDB', name: 'HDBank' },
  { id: 'VIB', name: 'VIB' }, { id: 'OCB', name: 'OCB' },
  { id: 'SEAB', name: 'SeABank' }, { id: 'MSB', name: 'MSB' },
  { id: 'NAB', name: 'NamABank' }, { id: 'ABB', name: 'ABBank' },
  { id: 'KLB', name: 'KienLongBank' }, { id: 'NCB', name: 'NCB' },
];

function buildQR(bankCode: string, account: string, amount: number, info: string, name: string) {
  const params = new URLSearchParams({ amount: String(amount), addInfo: info, accountName: name });
  return `https://img.vietqr.io/image/${bankCode}-${account}-compact.jpg?${params}`;
}

export default function Partners({ partners, purchaseOrders, onAdd, onUpdate, onDelete, onUpdateOrder, onPaymentLogAdded }: PartnersProps) {
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY);
  const [debtFor, setDebtFor] = useState<Partner | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [payingOrder, setPayingOrder] = useState<PurchaseOrder | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payFull, setPayFull] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [payMethod, setPayMethod] = useState<'bank' | 'cash'>('bank');
  const xlsxRef = useRef<HTMLInputElement>(null);

  const allBrands = useMemo(
    () => Array.from(new Set(partners.flatMap(p => p.brands).filter(Boolean))).sort(),
    [partners]
  );

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(partners.map(p => ({
      'Họ tên': p.fullName, 'Thương hiệu': p.brands.join('; '),
      'Điện thoại': p.phones.join('; '), 'Email': p.emails.join('; '),
      'Địa chỉ': p.address ?? '', 'Ghi chú': p.notes ?? '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Đối tác');
    XLSX.writeFile(wb, `doi_tac_${new Date().toISOString().slice(0,10)}.xlsx`);
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
        const splitSemi = (s: string) => s ? s.split(';').map((x: string) => x.trim()).filter(Boolean) : [];
        const p: Partner = {
          id: `part_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          fullName: String(r['Họ tên']),
          brands: splitSemi(String(r['Thương hiệu'] ?? '')),
          phones: splitSemi(String(r['Điện thoại'] ?? '')),
          emails: splitSemi(String(r['Email'] ?? '')),
          address: r['Địa chỉ'] ? String(r['Địa chỉ']) : undefined,
          notes: r['Ghi chú'] ? String(r['Ghi chú']) : undefined,
          createdAt: new Date().toISOString(),
        };
        try { await onAdd(p); } catch { /* skip dup */ }
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  const filtered = useMemo(() => {
    if (!search) return partners;
    const q = search.toLowerCase();
    return partners.filter(p =>
      p.fullName.toLowerCase().includes(q) ||
      p.brands.some(b => b.toLowerCase().includes(q)) ||
      p.phones.some(ph => ph.includes(q))
    );
  }, [partners, search]);

  const partnerDebt = useMemo(() => {
    const map: Record<string, { total: number; paid: number }> = {};
    purchaseOrders.forEach(o => {
      if (o.type !== 'import' || !o.partnerId) return;
      if (!map[o.partnerId]) map[o.partnerId] = { total: 0, paid: 0 };
      map[o.partnerId].total += o.totalAmount;
      map[o.partnerId].paid += o.paidAmount;
    });
    return map;
  }, [purchaseOrders]);

  const partnerOrders = useMemo(() => {
    if (!debtFor) return [];
    return purchaseOrders.filter(o => o.partnerId === debtFor.id && o.type === 'import')
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [debtFor, purchaseOrders]);

  function openAdd() {
    setEditingId(null); setForm({ ...EMPTY, brands: [''], phones: [''], emails: [''] }); setErrors({}); setShowForm(true);
  }

  function openEdit(p: Partner) {
    setEditingId(p.id);
    setForm({
      fullName: p.fullName,
      brands: p.brands.length ? [...p.brands] : [''],
      phones: p.phones.length ? [...p.phones] : [''],
      emails: p.emails.length ? [...p.emails] : [''],
      address: p.address ?? '',
      bankName: p.bankName ?? '',
      bankAccount: p.bankAccount ?? '',
      bankAccountName: p.bankAccountName ?? '',
      notes: p.notes ?? '',
    });
    setErrors({}); setShowForm(true);
  }

  function cleanArr(arr: string[]) { return arr.map(s => s.trim()).filter(Boolean); }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.fullName.trim()) e.fullName = 'Vui lòng nhập họ tên';
    return e;
  }

  async function handleSave() {
    const e = validate();
    if (Object.keys(e).length > 0) { setErrors(e); return; }
    setSaving(true);
    setSaveError('');
    try {
      const base: Partial<Partner> = {
        fullName: form.fullName.trim(),
        brands: cleanArr(form.brands), phones: cleanArr(form.phones), emails: cleanArr(form.emails),
        address: form.address.trim() || undefined,
        bankName: form.bankName.trim() || undefined,
        bankAccount: form.bankAccount.trim() || undefined,
        bankAccountName: form.bankAccountName.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      if (editingId) {
        const existing = partners.find(p => p.id === editingId)!;
        await onUpdate({ ...existing, ...base } as Partner);
      } else {
        await onAdd({ id: `part_${Date.now()}`, ...base, createdAt: new Date().toISOString() } as Partner);
      }
      setShowForm(false);
    } catch (err: any) {
      setSaveError(err?.message ?? 'Lỗi khi lưu. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  }

  function openPay(o: PurchaseOrder) {
    const remaining = o.totalAmount - o.paidAmount;
    setPayingOrder(o); setPayAmount(String(remaining)); setPayFull(false); setPaymentConfirmed(false);
    setPayMethod(debtFor?.bankAccount ? 'bank' : 'cash');
  }

  async function confirmPay(method?: 'bank' | 'cash') {
    if (!payingOrder) return;
    const remaining = payingOrder.totalAmount - payingOrder.paidAmount;
    const amount = payFull ? remaining : Math.min(Number(payAmount) || 0, remaining);
    if (amount <= 0) return;
    const usedMethod = method ?? payMethod;
    setSaving(true);
    try {
      const newPaid = payingOrder.paidAmount + amount;
      const newRemaining = payingOrder.totalAmount - newPaid;
      await onUpdateOrder({ ...payingOrder, paidAmount: newPaid });
      const log: PaymentLog = {
        id: `PL${Date.now()}`,
        createdAt: new Date().toISOString(),
        type: 'debt',
        referenceId: payingOrder.id,
        referenceName: payingOrder.partnerName,
        amount,
        paymentMethod: usedMethod,
        remaining: newRemaining,
      };
      try { await insertPaymentLog(log); if (onPaymentLogAdded) onPaymentLogAdded(log); } catch (_) {}
      setPayingOrder(null);
      setPaymentConfirmed(false);
    } finally {
      setSaving(false);
    }
  }

  function dynField(field: keyof Pick<Form, 'brands' | 'phones' | 'emails'>, placeholder: string, datalistId?: string) {
    const arr = form[field] as string[];
    return (
      <div className="space-y-1.5">
        {arr.map((val, i) => (
          <div key={i} className="flex gap-2">
            <input value={val} onChange={e => {
              const next = [...arr]; next[i] = e.target.value;
              setForm(f => ({ ...f, [field]: next }));
            }} list={datalistId}
              className="flex-1 px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              placeholder={placeholder} />
            {arr.length > 1 && (
              <button type="button" onClick={() => setForm(f => ({ ...f, [field]: arr.filter((_, j) => j !== i) }))}
                className="p-2 text-rose-400 hover:text-rose-600 cursor-pointer"><X className="w-4 h-4" /></button>
            )}
          </div>
        ))}
        {arr.length < 5 && (
          <button type="button" onClick={() => setForm(f => ({ ...f, [field]: [...arr, ''] }))}
            className="text-xs text-blue-600 hover:text-blue-700 font-bold cursor-pointer">+ Thêm</button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <datalist id="partner-brand-list">
        {allBrands.map(b => <option key={b} value={b} />)}
      </datalist>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên, thương hiệu, SĐT..."
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
          <Plus className="w-4 h-4" /> Thêm đối tác
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <Handshake className="w-10 h-10 mx-auto stroke-1 mb-2 text-slate-300" />
            <p className="text-sm font-semibold">{search ? 'Không tìm thấy đối tác' : 'Chưa có đối tác nào'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Họ tên</th>
                  <th className="px-4 py-3">Thương hiệu</th>
                  <th className="px-4 py-3">Điện thoại</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3 text-right">Công nợ còn lại</th>
                  <th className="px-4 py-3 w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(p => {
                  const debt = partnerDebt[p.id] ?? { total: 0, paid: 0 };
                  const remaining = debt.total - debt.paid;
                  const isExpanded = expandedId === p.id;
                  return (
                    <React.Fragment key={p.id}>
                      <tr
                        className={`transition cursor-pointer ${isExpanded ? 'bg-blue-50/30' : 'hover:bg-slate-50/60'}`}
                        onClick={() => setExpandedId(isExpanded ? null : p.id)}
                      >
                        <td className="px-4 py-3 font-semibold text-slate-800">{p.fullName}</td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-1">
                            {p.brands.map(b => <span key={b} className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[11px] font-bold rounded-md">{b}</span>)}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 font-mono text-xs">{p.phones[0] || '—'}</td>
                        <td className="px-4 py-3 text-slate-500 text-xs">{p.emails[0] || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          {remaining > 0
                            ? <span className="font-bold font-mono text-rose-600">{formatVND(remaining)}</span>
                            : <span className="text-slate-400 text-xs">Hết nợ</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isExpanded ? 'rotate-180 text-blue-500' : ''}`} />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-blue-50/20">
                          <td colSpan={6} className="px-4 py-3 border-t border-blue-100">
                            {/* Info cards */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-3 text-xs">
                              {p.phones.length > 0 && (
                                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 flex gap-2">
                                  <Phone className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
                                  <div>
                                    <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Điện thoại</p>
                                    {p.phones.map((ph, i) => <p key={i} className="text-slate-700 font-mono">{ph}</p>)}
                                  </div>
                                </div>
                              )}
                              {p.emails.length > 0 && (
                                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2 flex gap-2">
                                  <Mail className="w-3.5 h-3.5 text-purple-400 mt-0.5 shrink-0" />
                                  <div>
                                    <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Email</p>
                                    {p.emails.map((em, i) => <p key={i} className="text-slate-700">{em}</p>)}
                                  </div>
                                </div>
                              )}
                              {p.address && (
                                <div className="col-span-2 sm:col-span-3 bg-white rounded-lg border border-slate-200 px-3 py-2 flex gap-2">
                                  <MapPin className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />
                                  <div>
                                    <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Địa chỉ</p>
                                    <p className="text-slate-700">{p.address}</p>
                                  </div>
                                </div>
                              )}
                              {(p.bankName || p.bankAccount) && (
                                <div className="col-span-2 bg-white rounded-lg border border-emerald-200 px-3 py-2 flex gap-2">
                                  <CreditCard className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                                  <div>
                                    <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Tài khoản ngân hàng</p>
                                    <p className="text-slate-700 font-mono font-bold">{p.bankAccount}</p>
                                    <p className="text-slate-500">{VIET_BANKS.find(b => b.id === p.bankName)?.name ?? p.bankName} · {p.bankAccountName}</p>
                                  </div>
                                </div>
                              )}
                              {p.notes && (
                                <div className="bg-white rounded-lg border border-slate-200 px-3 py-2">
                                  <p className="font-bold text-slate-400 uppercase tracking-wider text-[10px] mb-0.5">Ghi chú</p>
                                  <p className="text-slate-700">{p.notes}</p>
                                </div>
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <button onClick={e => { e.stopPropagation(); setDebtFor(p); }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                                <ArrowDownToLine className="w-3.5 h-3.5" /> Xem công nợ
                              </button>
                              <button onClick={e => { e.stopPropagation(); openEdit(p); }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                                <Pencil className="w-3.5 h-3.5" /> Chỉnh sửa
                              </button>
                              <button onClick={e => { e.stopPropagation(); setDeleteConfirm(p.id); }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg cursor-pointer transition">
                                <Trash2 className="w-3.5 h-3.5" /> Xóa
                              </button>
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

      {/* Add/Edit Modal */}
      <AnimatePresence>
        {showForm && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md my-4">
              <div className="flex items-center justify-between p-5 border-b border-slate-200">
                <h3 className="font-bold text-slate-800">{editingId ? 'Sửa đối tác' : 'Thêm đối tác'}</h3>
                <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4 overflow-y-auto max-h-[65vh]">
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Họ tên <span className="text-rose-500">*</span></label>
                  <input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))}
                    className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${errors.fullName ? 'border-rose-400' : 'border-slate-200'}`}
                    placeholder="Công ty ABC" />
                  {errors.fullName && <p className="text-xs text-rose-500 mt-1">{errors.fullName}</p>}
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 flex items-center gap-1"><Tag className="w-3.5 h-3.5" /> Thương hiệu</label>
                  {dynField('brands', 'VD: Coca-Cola, Hảo Hảo...', 'partner-brand-list')}
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 flex items-center gap-1"><Phone className="w-3.5 h-3.5" /> Điện thoại</label>
                  {dynField('phones', '0912 345 678')}
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 flex items-center gap-1"><Mail className="w-3.5 h-3.5" /> Email</label>
                  {dynField('emails', 'contact@company.com')}
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" /> Địa chỉ</label>
                  <input value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
                    placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/TP" />
                </div>
                <div className="border border-emerald-200 rounded-xl p-3 space-y-2 bg-emerald-50/40">
                  <p className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" /> Tài khoản ngân hàng
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 mb-1 block">Ngân hàng</label>
                      <select value={form.bankName} onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))}
                        className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs bg-white focus:outline-none focus:border-emerald-500 cursor-pointer">
                        <option value="">— Chọn ngân hàng —</option>
                        {VIET_BANKS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-slate-500 mb-1 block">Số tài khoản</label>
                      <input value={form.bankAccount} onChange={e => setForm(f => ({ ...f, bankAccount: e.target.value }))}
                        className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-emerald-500"
                        placeholder="0123456789" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-slate-500 mb-1 block">Tên chủ tài khoản</label>
                    <input value={form.bankAccountName} onChange={e => setForm(f => ({ ...f, bankAccountName: e.target.value }))}
                      className="w-full px-2 py-2 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-emerald-500"
                      placeholder="NGUYEN VAN A (chữ hoa không dấu)" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Ghi chú</label>
                  <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 resize-none"
                    placeholder="Điều khoản, ghi chú thêm..." />
                </div>
              </div>
              {saveError && (
                <div className="mx-5 mb-3 px-3 py-2 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-medium">{saveError}</div>
              )}
              <div className="flex gap-3 p-5 border-t border-slate-200">
                <button onClick={() => { setShowForm(false); setSaveError(''); }} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-bold transition cursor-pointer">Hủy</button>
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
              <h3 className="font-bold text-slate-800 mb-2">Xóa đối tác?</h3>
              <p className="text-sm text-slate-500 mb-5">Phiếu nhập hàng của đối tác vẫn được giữ lại.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteConfirm(null)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold cursor-pointer">Hủy</button>
                <button onClick={async () => { await onDelete(deleteConfirm); setDeleteConfirm(null); }}
                  className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold cursor-pointer">Xóa</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Debt Modal */}
      <AnimatePresence>
        {debtFor && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-2xl flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between p-5 border-b border-slate-200">
                <div>
                  <h3 className="font-bold text-slate-800">Công nợ nhập hàng — {debtFor.fullName}</h3>
                  {debtFor.phones[0] && <p className="text-xs text-slate-500 font-mono mt-0.5">{debtFor.phones[0]}</p>}
                </div>
                <button onClick={() => setDebtFor(null)} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              {(() => {
                const debt = partnerDebt[debtFor.id] ?? { total: 0, paid: 0 };
                const remaining = debt.total - debt.paid;
                return (
                  <div className="px-5 py-3 border-b border-slate-100 flex gap-6 flex-wrap bg-slate-50">
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Tổng nhập</p>
                      <p className="text-lg font-extrabold text-slate-800 font-mono">{formatVND(debt.total)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Đã thanh toán</p>
                      <p className="text-lg font-extrabold text-emerald-600 font-mono">{formatVND(debt.paid)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Còn nợ</p>
                      <p className={`text-lg font-extrabold font-mono ${remaining > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{formatVND(remaining)}</p>
                    </div>
                  </div>
                );
              })()}
              <div className="flex-1 overflow-y-auto p-5 space-y-3">
                {partnerOrders.length === 0 ? (
                  <div className="text-center py-10 text-slate-400 text-sm">Chưa có phiếu nhập hàng nào.</div>
                ) : partnerOrders.map(o => {
                  const rem = o.totalAmount - o.paidAmount;
                  return (
                    <div key={o.id} className="border border-slate-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-xs text-slate-600">{o.id}</span>
                        <span className="text-xs text-slate-400">{new Date(o.timestamp).toLocaleDateString('vi-VN')}</span>
                      </div>
                      <div className="text-xs text-slate-600 space-y-0.5">
                        {o.items.map((it, i) => (
                          <div key={i} className="flex justify-between">
                            <span>{it.productName} <span className="text-slate-400">×{it.quantity}</span></span>
                            <span className="font-mono">{formatVND(it.unitCost * it.quantity)}</span>
                          </div>
                        ))}
                      </div>
                      {o.notes && !o.notes.startsWith('[DC:') && <p className="text-xs text-slate-400 italic">{o.notes}</p>}
                      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                        <div className="text-xs space-y-0.5">
                          <p>Tổng: <span className="font-mono font-bold">{formatVND(o.totalAmount)}</span></p>
                          <p>Đã trả: <span className="font-mono text-emerald-600">{formatVND(o.paidAmount)}</span></p>
                          <p>Còn: <span className={`font-mono font-bold ${rem > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{formatVND(rem)}</span></p>
                        </div>
                        {rem > 0 && (
                          <button onClick={() => openPay(o)}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer">
                            Thanh toán
                          </button>
                        )}
                        {rem <= 0 && <span className="text-xs text-emerald-600 font-bold">Đã thanh toán đủ</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment Modal (with QR) */}
      <AnimatePresence>
        {payingOrder && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
              {paymentConfirmed ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-9 h-9 text-emerald-600" />
                  </div>
                  <h3 className="font-bold text-emerald-700 text-lg mb-1">Thanh toán hoàn tất</h3>
                  <p className="text-sm text-slate-500 mb-5">Đã ghi nhận giao dịch thành công.</p>
                  <button onClick={() => confirmPay('bank')} disabled={saving}
                    className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
                    {saving ? 'Đang lưu...' : 'Xác nhận & Đóng'}
                  </button>
                </div>
              ) : (
                <>
                  <h3 className="font-bold text-slate-800 mb-1">Thanh toán phiếu nhập</h3>
                  <p className="text-xs text-slate-500 font-mono mb-4">{payingOrder.id}</p>
                  <div className="space-y-3 mb-4">
                    <div className="flex justify-between text-sm"><span className="text-slate-600">Tổng phiếu:</span><span className="font-mono font-bold">{formatVND(payingOrder.totalAmount)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-600">Đã trả:</span><span className="font-mono text-emerald-600">{formatVND(payingOrder.paidAmount)}</span></div>
                    <div className="flex justify-between text-sm"><span className="text-slate-600">Còn nợ:</span><span className="font-mono font-bold text-rose-600">{formatVND(payingOrder.totalAmount - payingOrder.paidAmount)}</span></div>
                    <div className="border-t border-slate-200 pt-3 space-y-2">
                      <div>
                        <label className="text-xs font-bold text-slate-600 mb-1.5 block">Hình thức</label>
                        <div className="flex gap-2">
                          {(['bank', 'cash'] as const).map(m => (
                            <button key={m} onClick={() => setPayMethod(m)}
                              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg border text-xs font-bold transition cursor-pointer ${payMethod === m ? 'bg-emerald-600 border-emerald-600 text-white' : 'border-slate-200 text-slate-600'}`}>
                              {m === 'bank' ? <><Building2 className="w-3.5 h-3.5" /> CK</> : <><Banknote className="w-3.5 h-3.5" /> Tiền mặt</>}
                            </button>
                          ))}
                        </div>
                      </div>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={payFull} onChange={e => {
                          setPayFull(e.target.checked);
                          if (e.target.checked) setPayAmount(String(payingOrder.totalAmount - payingOrder.paidAmount));
                        }} className="w-4 h-4 cursor-pointer" />
                        <span className="text-sm font-medium text-slate-700">Thanh toán toàn bộ</span>
                      </label>
                      {!payFull && (
                        <div>
                          <label className="text-xs font-bold text-slate-600 mb-1 block">Số tiền thanh toán</label>
                          <input type="number" min={0} max={payingOrder.totalAmount - payingOrder.paidAmount} value={payAmount}
                            onChange={e => setPayAmount(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500" />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* QR Code if partner has bank info and bank method selected */}
                  {payMethod === 'bank' && debtFor?.bankName && debtFor?.bankAccount && (payFull || Number(payAmount) > 0) && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                      <p className="text-[10px] font-bold text-slate-500 uppercase mb-2">Quét QR chuyển khoản</p>
                      <img
                        src={buildQR(debtFor.bankName, debtFor.bankAccount, payFull ? payingOrder.totalAmount - payingOrder.paidAmount : Number(payAmount), `TT no ${payingOrder.id}`, debtFor.bankAccountName ?? '')}
                        alt="QR chuyển khoản"
                        className="w-44 h-44 mx-auto rounded-lg object-contain"
                      />
                      <p className="text-xs text-slate-600 font-mono font-bold mt-2">{debtFor.bankAccount}</p>
                      <p className="text-xs text-slate-500">{VIET_BANKS.find(b => b.id === debtFor.bankName)?.name} · {debtFor.bankAccountName}</p>
                    </div>
                  )}

                  <div className="flex gap-3">
                    <button onClick={() => setPayingOrder(null)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold cursor-pointer">Hủy</button>
                    {payMethod === 'bank' && debtFor?.bankAccount ? (
                      <button onClick={() => setPaymentConfirmed(true)} disabled={Number(payAmount) <= 0 && !payFull}
                        className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
                        Đã chuyển khoản
                      </button>
                    ) : (
                      <button onClick={() => confirmPay(payMethod)} disabled={saving}
                        className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
                        {saving ? 'Đang lưu...' : 'Xác nhận'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
