import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Invoice, Product, PurchaseOrder, SalaryEntry } from '../types';
import {
  TrendingUp, Calendar, FileText, Printer,
  CircleDollarSign, Search, ShoppingBag, Percent, Receipt,
  ArrowDownToLine, Banknote, Wallet, Users, Plus, Pencil, Trash2,
  X, Download, Upload, AlertCircle
} from 'lucide-react';
import {
  fetchPurchaseOrders, updatePurchaseOrder,
  fetchSalaryEntries, insertSalaryEntry, updateSalaryEntry, deleteSalaryEntry,
} from '../lib/db';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

interface ReportsProps {
  invoices: Invoice[];
  products: Product[];
  onSelectInvoiceForReprint: (invoice: Invoice) => void;
}

type RangePreset = 'today' | '7days' | '30days' | 'custom';
type ReportType = 'revenue' | 'debt' | 'salary' | 'profit';

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
const formatVND = (v: number) => v.toLocaleString('vi-VN') + ' ₫';

function calcSalaryInRange(entry: SalaryEntry, from: Date, to: Date): number {
  const eFrom = new Date(entry.dateFrom + 'T00:00:00');
  const eTo = new Date(entry.dateTo + 'T23:59:59');
  if (eFrom > to || eTo < from) return 0;
  if (entry.calcType === 'lump') return entry.amount;
  const ovFrom = eFrom > from ? eFrom : from;
  const ovTo = eTo < to ? eTo : to;
  const days = Math.round((ovTo.getTime() - ovFrom.getTime()) / 86400000) + 1;
  return entry.amount * Math.max(1, days);
}

const EMPTY_SALARY = { fullName: '', phone: '', amount: '', calcType: 'lump' as 'lump' | 'daily', dateFrom: '', dateTo: '', notes: '' };

export default function Reports({ invoices, products, onSelectInvoiceForReprint }: ReportsProps) {
  const [reportType, setReportType] = useState<ReportType>('revenue');
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'kpi' | 'transactions'>('kpi');
  const [hoveredDataIdx, setHoveredDataIdx] = useState<number | null>(null);

  // Debt tab state
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [debtLoading, setDebtLoading] = useState(false);
  const [debtError, setDebtError] = useState('');
  const [expandedPartnerId, setExpandedPartnerId] = useState<string | null>(null);
  const [payingOrder, setPayingOrder] = useState<PurchaseOrder | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payFull, setPayFull] = useState(false);
  const [paying, setPaying] = useState(false);

  // Profit / Salary tab state
  const [salaryEntries, setSalaryEntries] = useState<SalaryEntry[]>([]);
  const [salaryLoading, setSalaryLoading] = useState(false);
  const [salaryError, setSalaryError] = useState('');
  const [showSalaryForm, setShowSalaryForm] = useState(false);
  const [editingSalaryId, setEditingSalaryId] = useState<string | null>(null);
  const [salaryForm, setSalaryForm] = useState(EMPTY_SALARY);
  const [salarySearch, setSalarySearch] = useState('');
  const [deleteSalaryConfirm, setDeleteSalaryConfirm] = useState<string | null>(null);
  const [salarySaving, setSalarySaving] = useState(false);
  const xlsxInputRef = useRef<HTMLInputElement>(null);

  // Date range
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const [rangePreset, setRangePreset] = useState<RangePreset>('30days');
  const [customFrom, setCustomFrom] = useState(toDateStr(addDays(today, -30)));
  const [customTo, setCustomTo] = useState(toDateStr(today));

  const { dateFrom, dateTo } = useMemo(() => {
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);
    if (rangePreset === 'today') { const s = new Date(today); s.setHours(0, 0, 0, 0); return { dateFrom: s, dateTo: end }; }
    if (rangePreset === '7days') { const s = addDays(end, -6); s.setHours(0, 0, 0, 0); return { dateFrom: s, dateTo: end }; }
    if (rangePreset === '30days') { const s = addDays(end, -29); s.setHours(0, 0, 0, 0); return { dateFrom: s, dateTo: end }; }
    const start = new Date(customFrom + 'T00:00:00');
    const endC = new Date(customTo + 'T23:59:59');
    return { dateFrom: start, dateTo: endC };
  }, [rangePreset, customFrom, customTo]);

  const rangeInvoices = useMemo(() =>
    invoices.filter(inv => { const t = new Date(inv.timestamp).getTime(); return t >= dateFrom.getTime() && t <= dateTo.getTime(); }),
    [invoices, dateFrom, dateTo]);

  // Revenue stats
  const stats = useMemo(() => {
    let totalRevenue = 0, totalCost = 0;
    rangeInvoices.forEach(inv => {
      totalRevenue += inv.finalAmount;
      inv.items.forEach(item => { totalCost += item.product.costPrice * item.quantity; });
    });
    const totalProfit = totalRevenue - totalCost;
    return { revenue: totalRevenue, profit: totalProfit, margin: totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0, transactions: rangeInvoices.length, averageTicket: rangeInvoices.length > 0 ? totalRevenue / rangeInvoices.length : 0, cost: totalCost };
  }, [rangeInvoices]);

  // Chart data
  const chartData = useMemo(() => {
    const diffMs = dateTo.getTime() - dateFrom.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const days = Math.min(diffDays, 60);
    const dailyMap: Record<string, { revenue: number; profit: number; transactions: number }> = {};
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(dateTo); d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      if (!dailyMap[key]) dailyMap[key] = { revenue: 0, profit: 0, transactions: 0 };
    }
    rangeInvoices.forEach(inv => {
      try {
        const key = new Date(inv.timestamp).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        let cost = 0; inv.items.forEach(it => { cost += it.product.costPrice * it.quantity; });
        if (dailyMap[key]) { dailyMap[key].revenue += inv.finalAmount; dailyMap[key].profit += inv.finalAmount - cost; dailyMap[key].transactions += 1; }
      } catch { /* skip */ }
    });
    return Object.keys(dailyMap).map(key => ({ date: key, ...dailyMap[key] }));
  }, [rangeInvoices, dateFrom, dateTo]);

  const topProducts = useMemo(() => {
    const counts: Record<string, { name: string; sku: string; quantity: number; revenue: number }> = {};
    rangeInvoices.forEach(inv => { inv.items.forEach(item => { const id = item.product.id; if (!counts[id]) counts[id] = { name: item.product.name, sku: item.product.sku, quantity: 0, revenue: 0 }; counts[id].quantity += item.quantity; counts[id].revenue += item.quantity * item.product.sellingPrice; }); });
    return Object.values(counts).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  }, [rangeInvoices]);

  const paymentMethodStats = useMemo(() => {
    let cashRev = 0, qrRev = 0, cardRev = 0;
    rangeInvoices.forEach(inv => { if (inv.paymentMethod === 'CASH') cashRev += inv.finalAmount; else if (inv.paymentMethod === 'QR') qrRev += inv.finalAmount; else cardRev += inv.finalAmount; });
    const total = cashRev + qrRev + cardRev || 1;
    return [
      { name: 'Tiền mặt', value: cashRev, percent: Math.round((cashRev / total) * 100), color: 'bg-emerald-500' },
      { name: 'Chuyển khoản QR', value: qrRev, percent: Math.round((qrRev / total) * 100), color: 'bg-indigo-500' },
      { name: 'Thẻ ngân hàng', value: cardRev, percent: Math.round((cardRev / total) * 100), color: 'bg-amber-500' },
    ];
  }, [rangeInvoices]);

  const filteredInvoices = useMemo(() =>
    rangeInvoices.filter(inv => {
      const matchesSearch = !searchTerm || inv.id.toLowerCase().includes(searchTerm.toLowerCase()) || (inv.customerName && inv.customerName.toLowerCase().includes(searchTerm.toLowerCase())) || (inv.customerPhone && inv.customerPhone.includes(searchTerm));
      return matchesSearch && (!paymentFilter || inv.paymentMethod === paymentFilter);
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    [rangeInvoices, searchTerm, paymentFilter]);

  // SVG chart
  const svgDim = { width: 500, height: 200, pL: 60, pR: 20, pT: 20, pB: 30 };
  const maxRev = Math.max(...chartData.map(d => d.revenue), 100000);
  const genPoints = (key: 'revenue' | 'profit') => {
    const { width, height, pL, pR, pT, pB } = svgDim;
    const ww = width - pL - pR; const wh = height - pT - pB;
    const step = chartData.length > 1 ? ww / (chartData.length - 1) : ww;
    return chartData.map((d, idx) => ({ x: pL + idx * step, y: height - pB - (d[key] / maxRev) * wh, value: d[key], date: d.date }));
  };
  const revPts = genPoints('revenue'), profPts = genPoints('profit');
  const presetLabel: Record<RangePreset, string> = { today: 'Hôm nay', '7days': '7 ngày', '30days': '30 ngày', custom: 'Tùy chọn' };

  // Load debt data
  useEffect(() => {
    if (reportType !== 'debt') return;
    setDebtLoading(true);
    setDebtError('');
    fetchPurchaseOrders()
      .then(data => setPurchaseOrders(data))
      .catch(() => setDebtError('Không thể tải dữ liệu công nợ.'))
      .finally(() => setDebtLoading(false));
  }, [reportType]);

  // Load salary data
  useEffect(() => {
    if (reportType !== 'salary' && reportType !== 'profit') return;
    setSalaryLoading(true);
    setSalaryError('');
    fetchSalaryEntries()
      .then(data => setSalaryEntries(data))
      .catch(() => setSalaryError('Không thể tải dữ liệu lương.'))
      .finally(() => setSalaryLoading(false));
  }, [reportType]);

  // Debt tab: group by partner
  const debtByPartner = useMemo(() => {
    const map: Record<string, { partnerName: string; total: number; paid: number; orders: PurchaseOrder[] }> = {};
    purchaseOrders.filter(o => o.type === 'import').forEach(o => {
      const key = o.partnerId || '__none__';
      if (!map[key]) map[key] = { partnerName: o.partnerName || 'Không rõ đối tác', total: 0, paid: 0, orders: [] };
      map[key].total += o.totalAmount;
      map[key].paid += o.paidAmount;
      map[key].orders.push(o);
    });
    return Object.entries(map).map(([id, d]) => ({ id, ...d, remaining: d.total - d.paid })).sort((a, b) => b.remaining - a.remaining);
  }, [purchaseOrders]);

  const totalDebt = useMemo(() => debtByPartner.reduce((s, p) => s + p.remaining, 0), [debtByPartner]);

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
    setPaying(true);
    try {
      const updated = { ...payingOrder, paidAmount: payingOrder.paidAmount + amount };
      await updatePurchaseOrder(updated);
      setPurchaseOrders(prev => prev.map(o => o.id === payingOrder.id ? updated : o));
      setPayingOrder(null);
    } finally {
      setPaying(false);
    }
  }

  // Profit: salary in range
  const salaryInRange = useMemo(() =>
    salaryEntries.map(e => ({ ...e, appliedAmount: calcSalaryInRange(e, dateFrom, dateTo) })).filter(e => e.appliedAmount > 0),
    [salaryEntries, dateFrom, dateTo]);

  const totalSalary = useMemo(() => salaryInRange.reduce((s, e) => s + e.appliedAmount, 0), [salaryInRange]);
  const netProfit = stats.profit - totalSalary;

  const filteredSalary = useMemo(() => {
    if (!salarySearch) return salaryEntries;
    const q = salarySearch.toLowerCase();
    return salaryEntries.filter(e => e.fullName.toLowerCase().includes(q) || e.phone.includes(q));
  }, [salaryEntries, salarySearch]);

  const salaryTotalByName = useMemo(() => {
    const map: Record<string, number> = {};
    salaryEntries.forEach(e => { map[e.fullName] = (map[e.fullName] || 0) + e.amount; });
    return map;
  }, [salaryEntries]);

  const salaryInRangeGrouped = useMemo(() => {
    const map: Record<string, { fullName: string; lumpCount: number; totalDays: number; totalAmount: number }> = {};
    salaryInRange.forEach(e => {
      if (!map[e.fullName]) map[e.fullName] = { fullName: e.fullName, lumpCount: 0, totalDays: 0, totalAmount: 0 };
      if (e.calcType === 'lump') {
        map[e.fullName].lumpCount++;
      } else {
        const eFrom = new Date(e.dateFrom + 'T00:00:00');
        const eTo = new Date(e.dateTo + 'T23:59:59');
        const ovFrom = eFrom > dateFrom ? eFrom : dateFrom;
        const ovTo = eTo < dateTo ? eTo : dateTo;
        const days = Math.max(1, Math.round((ovTo.getTime() - ovFrom.getTime()) / 86400000) + 1);
        map[e.fullName].totalDays += days;
      }
      map[e.fullName].totalAmount += e.appliedAmount;
    });
    return Object.values(map).sort((a, b) => b.totalAmount - a.totalAmount);
  }, [salaryInRange, dateFrom, dateTo]);

  function openAddSalary() {
    setEditingSalaryId(null);
    setSalaryForm({ ...EMPTY_SALARY, dateFrom: toDateStr(addDays(today, -29)), dateTo: toDateStr(today) });
    setShowSalaryForm(true);
  }
  function openEditSalary(e: SalaryEntry) {
    setEditingSalaryId(e.id);
    setSalaryForm({ fullName: e.fullName, phone: e.phone, amount: String(e.amount), calcType: e.calcType, dateFrom: e.dateFrom, dateTo: e.dateTo, notes: e.notes ?? '' });
    setShowSalaryForm(true);
  }
  async function handleSaveSalary() {
    if (!salaryForm.fullName.trim() || !salaryForm.amount || !salaryForm.dateFrom || !salaryForm.dateTo) return;
    setSalarySaving(true);
    try {
      if (editingSalaryId) {
        const existing = salaryEntries.find(e => e.id === editingSalaryId)!;
        const updated: SalaryEntry = { ...existing, fullName: salaryForm.fullName.trim(), phone: salaryForm.phone.trim(), amount: Number(salaryForm.amount), calcType: salaryForm.calcType, dateFrom: salaryForm.dateFrom, dateTo: salaryForm.dateTo, notes: salaryForm.notes.trim() || undefined };
        await updateSalaryEntry(updated);
        setSalaryEntries(prev => prev.map(e => e.id === editingSalaryId ? updated : e));
      } else {
        const newEntry: SalaryEntry = { id: `sal_${Date.now()}`, fullName: salaryForm.fullName.trim(), phone: salaryForm.phone.trim(), amount: Number(salaryForm.amount), calcType: salaryForm.calcType, dateFrom: salaryForm.dateFrom, dateTo: salaryForm.dateTo, notes: salaryForm.notes.trim() || undefined, createdAt: new Date().toISOString() };
        await insertSalaryEntry(newEntry);
        setSalaryEntries(prev => [newEntry, ...prev]);
      }
      setShowSalaryForm(false);
    } finally {
      setSalarySaving(false);
    }
  }
  async function handleDeleteSalary(id: string) {
    await deleteSalaryEntry(id);
    setSalaryEntries(prev => prev.filter(e => e.id !== id));
    setDeleteSalaryConfirm(null);
  }

  function exportSalaryExcel() {
    const ws = XLSX.utils.json_to_sheet(salaryEntries.map(e => ({
      'Họ tên': e.fullName, 'Điện thoại': e.phone, 'Số tiền (VNĐ)': e.amount,
      'Cách tính': e.calcType === 'lump' ? 'Đợt' : 'Ngày',
      'Từ ngày': e.dateFrom, 'Đến ngày': e.dateTo, 'Ghi chú': e.notes ?? '',
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lương');
    XLSX.writeFile(wb, `luong_${toDateStr(new Date())}.xlsx`);
  }

  function handleImportExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = async ev => {
      const wb = XLSX.read(ev.target?.result, { type: 'binary' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws) as any[];
      const newEntries: SalaryEntry[] = rows.filter(r => r['Họ tên']).map(r => ({
        id: `sal_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        fullName: String(r['Họ tên'] ?? ''),
        phone: String(r['Điện thoại'] ?? ''),
        amount: Number(r['Số tiền (VNĐ)'] ?? 0),
        calcType: String(r['Cách tính'] ?? '') === 'Ngày' ? 'daily' : 'lump',
        dateFrom: String(r['Từ ngày'] ?? ''),
        dateTo: String(r['Đến ngày'] ?? ''),
        notes: String(r['Ghi chú'] ?? '') || undefined,
        createdAt: new Date().toISOString(),
      }));
      for (const entry of newEntries) {
        try { await insertSalaryEntry(entry); setSalaryEntries(prev => [...prev, entry]); } catch { /* skip dup */ }
      }
    };
    reader.readAsBinaryString(file);
    e.target.value = '';
  }

  return (
    <div className="space-y-6">
      {/* Header + Report type tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Báo cáo</h1>
          <p className="text-slate-500 text-sm mt-1">Doanh thu, công nợ và lợi nhuận theo kỳ.</p>
        </div>
        <div className="flex border border-slate-200 rounded-xl bg-white p-1 shadow-xs w-full sm:w-auto">
          {([['revenue', <TrendingUp className="w-3.5 h-3.5" />, 'Doanh thu'], ['debt', <ArrowDownToLine className="w-3.5 h-3.5" />, 'Công nợ'], ['salary', <Users className="w-3.5 h-3.5" />, 'Lương'], ['profit', <Wallet className="w-3.5 h-3.5" />, 'Lợi nhuận']] as [ReportType, React.ReactNode, string][]).map(([id, icon, label]) => (
            <button key={id} onClick={() => setReportType(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer whitespace-nowrap ${reportType === id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* Date Range Filter (shared) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Khoảng thời gian:</span>
          </div>
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
            {(['today', '7days', '30days', 'custom'] as RangePreset[]).map(p => (
              <button key={p} onClick={() => setRangePreset(p)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${rangePreset === p ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}>
                {presetLabel[p]}
              </button>
            ))}
          </div>
          {rangePreset === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Từ ngày:</span>
              <input type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)}
                className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500 cursor-pointer" />
              <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Đến ngày:</span>
              <input type="date" value={customTo} min={customFrom} max={toDateStr(new Date())} onChange={e => setCustomTo(e.target.value)}
                className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500 cursor-pointer" />
            </div>
          )}
          <p className="text-[11px] text-slate-400 ml-auto whitespace-nowrap">
            {rangePreset !== 'custom' ? `${dateFrom.toLocaleDateString('vi-VN')} — ${dateTo.toLocaleDateString('vi-VN')}` : `${new Date(customFrom + 'T00:00:00').toLocaleDateString('vi-VN')} — ${new Date(customTo + 'T00:00:00').toLocaleDateString('vi-VN')}`}
          </p>
        </div>
      </div>

      {/* ── REVENUE TAB ─────────────────────────────────── */}
      {reportType === 'revenue' && (
        <>
          <div className="flex border border-slate-200 rounded-lg bg-white p-1 self-start shadow-xs">
            <button onClick={() => setActiveTab('kpi')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition inline-flex items-center gap-1.5 cursor-pointer ${activeTab === 'kpi' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}>
              <TrendingUp className="w-3.5 h-3.5" /> Tổng quan
            </button>
            <button onClick={() => setActiveTab('transactions')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition inline-flex items-center gap-1.5 cursor-pointer ${activeTab === 'transactions' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}>
              <FileText className="w-3.5 h-3.5" /> Lịch sử ({rangeInvoices.length})
            </button>
          </div>

          <AnimatePresence mode="wait">
            {activeTab === 'kpi' ? (
              <motion.div key="kpi-tab" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div className="space-y-1"><p className="text-xs font-bold text-slate-400 tracking-wider uppercase">DOANH THU</p><p className="text-xl font-extrabold text-blue-600 font-mono">{formatVND(stats.revenue)}</p><p className="text-[10px] text-slate-400">{stats.transactions} giao dịch</p></div>
                    <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl"><CircleDollarSign className="w-6 h-6" /></div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div className="space-y-1"><p className="text-xs font-bold text-slate-400 tracking-wider uppercase">LỢI NHUẬN GỘP</p><p className="text-xl font-extrabold text-emerald-600 font-mono">{formatVND(stats.profit)}</p><p className="text-[10px] text-slate-400">Đã trừ vốn nhập gốc</p></div>
                    <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl"><TrendingUp className="w-6 h-6" /></div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div className="space-y-1"><p className="text-xs font-bold text-slate-400 tracking-wider uppercase">SỐ HÓA ĐƠN</p><p className="text-2xl font-extrabold text-slate-800 font-mono">{stats.transactions}</p><p className="text-[10px] text-slate-400">Giao dịch thành công</p></div>
                    <div className="p-3.5 bg-slate-100 text-slate-600 rounded-xl"><Receipt className="w-6 h-6" /></div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                    <div className="space-y-1"><p className="text-xs font-bold text-slate-400 tracking-wider uppercase">ĐƠN TRUNG BÌNH</p><p className="text-lg font-bold text-slate-800 font-mono">{formatVND(stats.averageTicket)}</p><p className="text-[10px] text-blue-600 font-semibold italic">Lợi nhuận: {Math.round(stats.margin)}%</p></div>
                    <div className="p-3.5 bg-purple-50 text-purple-600 rounded-xl"><Percent className="w-6 h-6" /></div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs lg:col-span-2 space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                      <div><h3 className="font-extrabold text-slate-800 text-sm">Biểu đồ doanh thu theo ngày</h3><p className="text-[11px] text-slate-400 mt-0.5">Doanh thu (xanh dương) & Lợi nhuận (xanh lá)</p></div>
                      <div className="flex items-center gap-2 text-[10px] bg-slate-50 border border-slate-150 px-2 py-1 rounded-md font-semibold text-slate-500"><Calendar className="w-3.5 h-3.5" /> {presetLabel[rangePreset]}</div>
                    </div>
                    <div className="relative pt-2 h-[220px]">
                      <svg viewBox={`0 0 ${svgDim.width} ${svgDim.height}`} className="w-full h-full overflow-visible">
                        {[0, 0.25, 0.5, 0.75, 1].map(ratio => { const y = svgDim.height - svgDim.pB - (ratio * (svgDim.height - svgDim.pT - svgDim.pB)); return (<g key={ratio} className="opacity-15"><line x1={svgDim.pL} y1={y} x2={svgDim.width - svgDim.pR} y2={y} stroke="#475569" strokeWidth="1" strokeDasharray="4,4" /><text x={svgDim.pL - 8} y={y + 4} fill="#1e293b" fontSize="8" fontFamily="monospace" textAnchor="end">{Math.round((ratio * maxRev) / 1000)}k</text></g>); })}
                        {chartData.map((d, idx) => { const step = chartData.length > 1 ? (svgDim.width - svgDim.pL - svgDim.pR) / (chartData.length - 1) : 0; const x = svgDim.pL + idx * step; const showLabel = chartData.length <= 14 || idx % Math.ceil(chartData.length / 14) === 0; return showLabel ? (<text key={idx} x={x} y={svgDim.height - svgDim.pB + 16} fontSize="9" fontWeight="bold" fill="#64748b" textAnchor="middle">{d.date}</text>) : null; })}
                        {revPts.length > 1 && (<><path d={`M ${revPts[0].x} ${svgDim.height - svgDim.pB} ${revPts.map(p => `L ${p.x} ${p.y}`).join(' ')} L ${revPts[revPts.length-1].x} ${svgDim.height - svgDim.pB} Z`} fill="#3b82f6" opacity="0.05" /><path d={revPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" /></>)}
                        {profPts.length > 1 && (<path d={profPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeDasharray="1,1" />)}
                        {revPts.map((p, idx) => (<g key={idx}><circle cx={p.x} cy={p.y} r={hoveredDataIdx === idx ? 6 : 4} fill="#ffffff" stroke="#2563eb" strokeWidth="2" onMouseEnter={() => setHoveredDataIdx(idx)} onMouseLeave={() => setHoveredDataIdx(null)} className="transition-all duration-150 cursor-pointer" /><circle cx={profPts[idx].x} cy={profPts[idx].y} r={hoveredDataIdx === idx ? 5 : 3.5} fill="#ffffff" stroke="#10b981" strokeWidth="1.5" onMouseEnter={() => setHoveredDataIdx(idx)} onMouseLeave={() => setHoveredDataIdx(null)} className="transition-all duration-150 cursor-pointer" /><rect x={p.x - 15} y={svgDim.pT} width={30} height={svgDim.height - svgDim.pT - svgDim.pB} fill="transparent" onMouseEnter={() => setHoveredDataIdx(idx)} onMouseLeave={() => setHoveredDataIdx(null)} className="cursor-pointer" /></g>))}
                      </svg>
                      {hoveredDataIdx !== null && (
                        <div className="absolute bg-slate-900/95 text-white p-3 rounded-xl shadow-lg border border-slate-700 pointer-events-none text-xs z-20 space-y-1" style={{ left: `${(hoveredDataIdx / Math.max(chartData.length - 1, 1)) * 70 + 10}%`, top: '5%' }}>
                          <p className="font-bold border-b border-slate-700 pb-1 text-[10px] text-slate-400">NGÀY {chartData[hoveredDataIdx].date}</p>
                          <p className="flex justify-between gap-4"><span>Doanh thu:</span><span className="font-mono font-bold text-sky-400">{formatVND(chartData[hoveredDataIdx].revenue)}</span></p>
                          <p className="flex justify-between gap-4"><span>Lợi nhuận:</span><span className="font-mono font-bold text-emerald-400">{formatVND(chartData[hoveredDataIdx].profit)}</span></p>
                          <p className="flex justify-between gap-4"><span>Giao dịch:</span><span className="font-mono font-bold">{chartData[hoveredDataIdx].transactions} đơn</span></p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                    <div><h3 className="font-bold text-slate-800 text-sm">Cơ cấu thanh toán</h3><p className="text-[11px] text-slate-400 mt-0.5">Phương thức thanh toán trong kỳ.</p></div>
                    <div className="my-6 space-y-4">
                      {paymentMethodStats.map(item => (
                        <div key={item.name} className="space-y-1.5">
                          <div className="flex justify-between text-xs font-semibold"><span className="text-slate-600 flex items-center gap-2"><span className={`w-3 h-3 rounded-full ${item.color}`}></span>{item.name}</span><span className="text-slate-800">{item.percent}% <span className="text-slate-400 font-mono">({formatVND(item.value)})</span></span></div>
                          <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden"><div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.percent}%` }}></div></div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-slate-400 italic text-center pb-1">Mã QR chuyển khoản tăng nhanh trong hành vi tiêu dùng.</p>
                  </div>
                </div>

                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2 pb-3 border-b border-slate-200 mb-4 text-slate-800"><ShoppingBag className="w-5 h-5 text-blue-600 shrink-0" /><h3 className="font-bold text-sm">Top 5 sản phẩm bán chạy</h3></div>
                  {topProducts.length === 0 ? (<div className="p-6 text-center text-slate-400 text-xs">Chưa có giao dịch trong kỳ báo cáo.</div>) : (
                    <div className="space-y-4">
                      {topProducts.map((p, idx) => { const maxQty = topProducts[0]?.quantity || 1; return (
                        <div key={p.sku} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50/50 rounded-lg hover:bg-slate-50 transition border border-slate-200">
                          <div className="flex items-center gap-3 min-w-0 flex-1"><span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0">{idx + 1}</span><div className="min-w-0"><p className="font-bold text-slate-800 text-xs sm:text-sm truncate">{p.name}</p><span className="text-[11px] text-slate-450 font-mono">SKU: {p.sku}</span></div></div>
                          <div className="flex items-center gap-4 shrink-0"><div className="hidden sm:block w-32 bg-slate-150 h-1.5 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 rounded-full" style={{ width: `${(p.quantity / maxQty) * 100}%` }}></div></div><div><p className="text-xs sm:text-sm font-black text-slate-800">{p.quantity} <span className="font-light text-[11px] text-slate-400">bán ra</span></p><p className="text-[10px] text-emerald-600 font-mono font-medium">{formatVND(p.revenue)}</p></div></div>
                        </div>
                      ); })}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div key="transactions-tab" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="space-y-4">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
                  <div className="relative flex-1 w-full"><span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none"><Search className="w-4 h-4" /></span><input type="text" placeholder="Tra cứu: mã HD, tên khách, số điện thoại..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs sm:text-sm font-medium transition" /></div>
                  <select value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)} className="w-full sm:w-auto px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none text-xs sm:text-sm font-medium cursor-pointer"><option value="">Tất cả hình thức</option><option value="CASH">Tiền mặt</option><option value="QR">VietQR Chuyển khoản</option><option value="CARD">Quẹt thẻ ngân hàng</option></select>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
                  <div className="overflow-x-auto">
                    {filteredInvoices.length === 0 ? (<div className="p-12 text-center text-slate-400"><FileText className="w-10 h-10 mx-auto stroke-1 text-slate-300 mb-2" /><p className="text-xs font-semibold">Không tìm thấy hóa đơn khớp bộ lọc</p></div>) : (
                      <table className="w-full border-collapse text-left">
                        <thead><tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider"><th className="px-5 py-3.5 font-mono">Mã Hóa Đơn</th><th className="px-5 py-3.5">Thời Gian</th><th className="px-5 py-3.5">Khách Hàng</th><th className="px-5 py-3.5">Hàng Hóa</th><th className="px-5 py-3.5 text-right font-mono">Tổng Tiền</th><th className="px-5 py-3.5 text-center">Hình thức</th><th className="px-5 py-3.5 text-right">In lại</th></tr></thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {filteredInvoices.map(inv => (
                            <tr key={inv.id} className="hover:bg-slate-50/55 transition">
                              <td className="px-5 py-3.5 font-mono font-bold text-slate-800">{inv.id}</td>
                              <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap text-xs font-mono">{new Date(inv.timestamp).toLocaleDateString('vi-VN')} {new Date(inv.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}</td>
                              <td className="px-5 py-3.5">{inv.customerName ? (<div><p className="font-semibold text-slate-800">{inv.customerName}</p>{inv.customerPhone && <p className="text-[10px] text-slate-400 font-mono">{inv.customerPhone}</p>}</div>) : (<span className="text-slate-400 text-xs">Khách lẻ</span>)}</td>
                              <td className="px-5 py-3.5 max-w-xs truncate text-xs text-slate-600">{inv.items.map(it => `${it.product.name} (x${it.quantity})`).join(', ')}</td>
                              <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap">{formatVND(inv.finalAmount)}{inv.discountAmount > 0 && <span className="block text-[10px] text-emerald-600 font-normal">-{formatVND(inv.discountAmount)}</span>}</td>
                              <td className="px-5 py-3.5 text-center whitespace-nowrap text-xs"><span className={`px-2 py-1 rounded-md font-bold text-[10px] ${inv.paymentMethod === 'CASH' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : inv.paymentMethod === 'QR' ? 'bg-blue-50 text-blue-700 border border-blue-100' : 'bg-amber-50 text-amber-700 border border-amber-100'}`}>{inv.paymentMethod === 'CASH' ? 'Tiền mặt' : inv.paymentMethod === 'QR' ? 'VietQR CK' : 'Thẻ'}</span></td>
                              <td className="px-5 py-3.5 text-right whitespace-nowrap"><button onClick={() => onSelectInvoiceForReprint(inv)} className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer"><Printer className="w-3.5 h-3.5" /> In lại</button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {/* ── DEBT TAB ─────────────────────────────────────── */}
      {reportType === 'debt' && (
        <div className="space-y-5">
          {debtLoading ? (
            <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /><p className="ml-3 text-slate-500 text-sm">Đang tải...</p></div>
          ) : debtError ? (
            <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 flex items-center gap-3"><AlertCircle className="w-5 h-5 text-rose-600 shrink-0" /><p className="text-rose-700 text-sm">{debtError}</p></div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">TỔNG NỢ CÒN LẠI</p><p className={`text-xl font-extrabold font-mono mt-1 ${totalDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatVND(totalDebt)}</p></div>
                  <div className="p-3.5 bg-rose-50 text-rose-600 rounded-xl"><Banknote className="w-6 h-6" /></div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">SỐ ĐỐI TÁC CÒN NỢ</p><p className="text-xl font-extrabold text-slate-800 mt-1">{debtByPartner.filter(p => p.remaining > 0).length}</p></div>
                  <div className="p-3.5 bg-amber-50 text-amber-600 rounded-xl"><Users className="w-6 h-6" /></div>
                </div>
                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                  <div><p className="text-xs font-bold text-slate-400 uppercase tracking-wider">TỔNG ĐÃ THANH TOÁN</p><p className="text-xl font-extrabold text-emerald-600 font-mono mt-1">{formatVND(debtByPartner.reduce((s, p) => s + p.paid, 0))}</p></div>
                  <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl"><TrendingUp className="w-6 h-6" /></div>
                </div>
              </div>

              {/* Per-partner breakdown */}
              {debtByPartner.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                  <ArrowDownToLine className="w-10 h-10 mx-auto stroke-1 mb-2 text-slate-300" />
                  <p className="text-sm font-semibold">Không có công nợ</p>
                </div>
              ) : debtByPartner.map(p => (
                <div key={p.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50/60 transition"
                    onClick={() => setExpandedPartnerId(expandedPartnerId === p.id ? null : p.id)}>
                    <div>
                      <p className="font-bold text-slate-800">{p.partnerName}</p>
                      <p className="text-xs text-slate-500 mt-0.5">{p.orders.length} phiếu nhập · Tổng: {formatVND(p.total)} · Đã trả: {formatVND(p.paid)}</p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      <p className={`font-bold font-mono ${p.remaining > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{p.remaining > 0 ? formatVND(p.remaining) : 'Đã thanh toán đủ'}</p>
                      {p.remaining > 0 && <p className="text-[10px] text-rose-500 mt-0.5">còn nợ</p>}
                    </div>
                  </div>
                  <AnimatePresence>
                    {expandedPartnerId === p.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="border-t border-slate-100 divide-y divide-slate-50">
                          {p.orders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(o => {
                            const rem = o.totalAmount - o.paidAmount;
                            return (
                              <div key={o.id} className="px-4 py-3 flex items-center justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-mono font-bold text-slate-600">{o.id}</p>
                                  <p className="text-xs text-slate-400">{new Date(o.timestamp).toLocaleDateString('vi-VN')} · {o.items.length} sản phẩm</p>
                                </div>
                                <div className="text-right shrink-0 text-xs space-y-0.5">
                                  <p className="font-mono font-bold">{formatVND(o.totalAmount)}</p>
                                  {rem > 0 && <p className="text-rose-600 font-mono">Còn: {formatVND(rem)}</p>}
                                  {rem <= 0 && <p className="text-emerald-600 font-semibold">Đã trả đủ</p>}
                                </div>
                                {rem > 0 && (
                                  <button onClick={() => openPay(o)} className="px-3 py-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg text-xs font-bold cursor-pointer transition whitespace-nowrap">Trả nợ</button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── SALARY TAB ───────────────────────────────────── */}
      {reportType === 'salary' && (
        <div className="space-y-6">
          {/* Salary in range grouped by person */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-slate-200">
              <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-amber-600" /> Lương phát sinh trong kỳ</h3>
              <p className="text-xs text-slate-400 mt-0.5">Nhóm theo nhân viên, tổng hợp đợt và ngày công.</p>
            </div>
            {salaryLoading ? (
              <div className="flex items-center justify-center py-10"><div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /><p className="ml-2 text-slate-500 text-sm">Đang tải...</p></div>
            ) : salaryInRangeGrouped.length === 0 ? (
              <div className="p-10 text-center text-slate-400"><Users className="w-8 h-8 mx-auto stroke-1 mb-2 text-slate-300" /><p className="text-sm font-semibold">Không có lương phát sinh trong kỳ</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Họ tên</th>
                      <th className="px-4 py-3 text-center">Đợt</th>
                      <th className="px-4 py-3 text-center">Ngày công</th>
                      <th className="px-4 py-3 text-right">Tổng phát sinh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {salaryInRangeGrouped.map(g => (
                      <tr key={g.fullName} className="hover:bg-amber-50/30 transition">
                        <td className="px-4 py-3 font-semibold text-slate-800">{g.fullName}</td>
                        <td className="px-4 py-3 text-center">
                          {g.lumpCount > 0
                            ? <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-xs font-bold">{g.lumpCount} đợt</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {g.totalDays > 0
                            ? <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md text-xs font-bold">{g.totalDays} ngày</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-bold font-mono text-amber-700">{formatVND(g.totalAmount)}</td>
                      </tr>
                    ))}
                    <tr className="bg-amber-50 border-t-2 border-amber-200">
                      <td className="px-4 py-3 font-extrabold text-slate-800" colSpan={3}>Tổng cộng</td>
                      <td className="px-4 py-3 text-right font-extrabold font-mono text-amber-800">{formatVND(totalSalary)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Salary Management */}
          {salaryLoading ? null : (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
              <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-blue-600" /> Quản lý bảng lương</h3>
                <div className="flex gap-2 flex-wrap">
                  <input ref={xlsxInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
                  <button onClick={() => xlsxInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-bold cursor-pointer transition">
                    <Upload className="w-3.5 h-3.5" /> Nhập Excel
                  </button>
                  <button onClick={exportSalaryExcel}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-xs font-bold cursor-pointer transition">
                    <Download className="w-3.5 h-3.5" /> Xuất Excel
                  </button>
                  <button onClick={openAddSalary}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-sm">
                    <Plus className="w-3.5 h-3.5" /> Thêm
                  </button>
                </div>
              </div>
              <div className="p-4 border-b border-slate-100">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input value={salarySearch} onChange={e => setSalarySearch(e.target.value)} placeholder="Tìm nhân viên..."
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                </div>
              </div>
              {filteredSalary.length === 0 ? (
                <div className="p-12 text-center text-slate-400"><Users className="w-10 h-10 mx-auto stroke-1 mb-2 text-slate-300" /><p className="text-sm font-semibold">Chưa có bảng lương</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Họ tên</th>
                        <th className="px-4 py-3">Điện thoại</th>
                        <th className="px-4 py-3 text-right">Số tiền</th>
                        <th className="px-4 py-3 text-right">Tổng lương</th>
                        <th className="px-4 py-3">Cách tính</th>
                        <th className="px-4 py-3">Từ ngày</th>
                        <th className="px-4 py-3">Đến ngày</th>
                        <th className="px-4 py-3">Ghi chú</th>
                        <th className="px-4 py-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredSalary.map(e => (
                        <tr key={e.id} className="hover:bg-slate-50/50 transition">
                          <td className="px-4 py-3 font-semibold text-slate-800">{e.fullName}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-500">{e.phone || '—'}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-slate-800">{formatVND(e.amount)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-amber-700 font-bold">{formatVND(salaryTotalByName[e.fullName] ?? 0)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${e.calcType === 'lump' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                              {e.calcType === 'lump' ? 'Đợt' : 'Ngày'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-slate-500 font-mono">{e.dateFrom}</td>
                          <td className="px-4 py-3 text-xs text-slate-500 font-mono">{e.dateTo}</td>
                          <td className="px-4 py-3 text-xs text-slate-400 max-w-[120px] truncate">{e.notes || '—'}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <button onClick={() => openEditSalary(e)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"><Pencil className="w-4 h-4" /></button>
                              <button onClick={() => setDeleteSalaryConfirm(e.id)} className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {salaryError && <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{salaryError}</div>}
        </div>
      )}

      {/* ── PROFIT TAB ───────────────────────────────────── */}
      {reportType === 'profit' && (
        <div className="space-y-6">
          {/* P&L Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {[
              { label: 'DOANH SỐ', value: stats.revenue, color: 'text-blue-600', bg: 'bg-blue-50', icon: <CircleDollarSign className="w-5 h-5" /> },
              { label: 'GIÁ VỐN', value: stats.cost, color: 'text-slate-600', bg: 'bg-slate-100', icon: <ArrowDownToLine className="w-5 h-5" /> },
              { label: 'LỢI NHUẬN GỘP', value: stats.profit, color: stats.profit >= 0 ? 'text-emerald-600' : 'text-rose-600', bg: 'bg-emerald-50', icon: <TrendingUp className="w-5 h-5" /> },
              { label: 'TỔNG LƯƠNG', value: totalSalary, color: 'text-amber-600', bg: 'bg-amber-50', icon: <Users className="w-5 h-5" /> },
              { label: 'LỢI NHUẬN RÒNG', value: netProfit, color: netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700', bg: netProfit >= 0 ? 'bg-emerald-50' : 'bg-rose-50', icon: <Wallet className="w-5 h-5" /> },
            ].map(card => (
              <div key={card.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div><p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{card.label}</p><p className={`text-base font-extrabold font-mono mt-1 ${card.color}`}>{formatVND(card.value)}</p></div>
                <div className={`p-2.5 ${card.bg} ${card.color} rounded-xl`}>{card.icon}</div>
              </div>
            ))}
          </div>

          {/* Formula */}
          <div className="bg-slate-800 rounded-xl p-4 text-sm font-mono text-center">
            <span className="text-blue-300">{formatVND(stats.revenue)}</span>
            <span className="text-slate-500"> − </span>
            <span className="text-slate-300">{formatVND(stats.cost)}</span>
            <span className="text-slate-500"> − </span>
            <span className="text-amber-300">{formatVND(totalSalary)}</span>
            <span className="text-slate-500"> = </span>
            <span className={`font-extrabold ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatVND(netProfit)}</span>
            <span className="text-slate-500 text-xs block mt-1">Doanh số − Giá vốn − Lương = Lợi nhuận ròng</span>
          </div>

          {/* Salary in range grouped */}
          {salaryLoading ? (
            <div className="flex items-center justify-center py-10"><div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /></div>
          ) : salaryInRangeGrouped.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200">
                <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-amber-600" /> Lương phát sinh trong kỳ (theo nhân viên)</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Họ tên</th>
                      <th className="px-4 py-3 text-center">Đợt</th>
                      <th className="px-4 py-3 text-center">Ngày công</th>
                      <th className="px-4 py-3 text-right">Tổng phát sinh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {salaryInRangeGrouped.map(g => (
                      <tr key={g.fullName} className="hover:bg-amber-50/30 transition">
                        <td className="px-4 py-3 font-semibold text-slate-800">{g.fullName}</td>
                        <td className="px-4 py-3 text-center">
                          {g.lumpCount > 0 ? <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-md text-xs font-bold">{g.lumpCount} đợt</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {g.totalDays > 0 ? <span className="px-2 py-0.5 bg-purple-50 text-purple-700 rounded-md text-xs font-bold">{g.totalDays} ngày</span> : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-bold font-mono text-amber-700">{formatVND(g.totalAmount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pay Modal (Debt tab) */}
      <AnimatePresence>
        {payingOrder && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
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
                    <input type="checkbox" checked={payFull} onChange={e => { setPayFull(e.target.checked); if (e.target.checked) setPayAmount(String(payingOrder.totalAmount - payingOrder.paidAmount)); }} className="w-4 h-4" />
                    <span className="text-sm font-medium text-slate-700">Thanh toán toàn bộ</span>
                  </label>
                  {!payFull && (<div><label className="text-xs font-bold text-slate-600 mb-1 block">Số tiền</label><input type="number" min={0} value={payAmount} onChange={e => setPayAmount(e.target.value)} className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500" /></div>)}
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPayingOrder(null)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold cursor-pointer">Hủy</button>
                <button onClick={confirmPay} disabled={paying} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">{paying ? 'Đang lưu...' : 'Xác nhận'}</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Salary Form Modal */}
      <AnimatePresence>
        {showSalaryForm && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md">
              <div className="flex items-center justify-between p-5 border-b border-slate-200">
                <h3 className="font-bold text-slate-800">{editingSalaryId ? 'Sửa lương' : 'Thêm lương'}</h3>
                <button onClick={() => setShowSalaryForm(false)} className="text-slate-400 hover:text-slate-700 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">Họ tên <span className="text-rose-500">*</span></label>
                    <input value={salaryForm.fullName} onChange={e => setSalaryForm(f => ({ ...f, fullName: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" placeholder="Nguyễn Văn A" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">Điện thoại</label>
                    <input value={salaryForm.phone} onChange={e => setSalaryForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500" placeholder="0912..." />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">Số tiền (VNĐ) <span className="text-rose-500">*</span></label>
                    <input type="number" min={0} value={salaryForm.amount} onChange={e => setSalaryForm(f => ({ ...f, amount: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500" placeholder="5000000" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">Cách tính</label>
                    <div className="flex gap-2">
                      {(['lump', 'daily'] as const).map(t => (
                        <button key={t} type="button" onClick={() => setSalaryForm(f => ({ ...f, calcType: t }))}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition cursor-pointer ${salaryForm.calcType === t ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-500'}`}>
                          {t === 'lump' ? 'Đợt' : 'Ngày'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">Từ ngày <span className="text-rose-500">*</span></label>
                    <input type="date" value={salaryForm.dateFrom} onChange={e => setSalaryForm(f => ({ ...f, dateFrom: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-slate-600 mb-1 block">Đến ngày <span className="text-rose-500">*</span></label>
                    <input type="date" value={salaryForm.dateTo} onChange={e => setSalaryForm(f => ({ ...f, dateTo: e.target.value }))}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-600 mb-1 block">Ghi chú</label>
                  <input value={salaryForm.notes} onChange={e => setSalaryForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500" placeholder="Tháng 6, thưởng, ..." />
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500">
                  {salaryForm.calcType === 'lump'
                    ? <p>💡 <strong>Đợt:</strong> Trả nguyên số tiền ({formatVND(Number(salaryForm.amount) || 0)}) bất kể số ngày.</p>
                    : <p>💡 <strong>Ngày:</strong> {formatVND(Number(salaryForm.amount) || 0)} × số ngày giao thoa với kỳ báo cáo.</p>}
                </div>
              </div>
              <div className="flex gap-3 p-5 border-t border-slate-200">
                <button onClick={() => setShowSalaryForm(false)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg text-sm font-bold cursor-pointer">Hủy</button>
                <button onClick={handleSaveSalary} disabled={salarySaving}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
                  {salarySaving ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Salary Confirm */}
      <AnimatePresence>
        {deleteSalaryConfirm && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
              <div className="w-12 h-12 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-3"><Trash2 className="w-6 h-6 text-rose-600" /></div>
              <h3 className="font-bold text-slate-800 mb-2">Xóa bản ghi lương?</h3>
              <p className="text-sm text-slate-500 mb-5">Hành động này không thể hoàn tác.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteSalaryConfirm(null)} className="flex-1 px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-bold cursor-pointer">Hủy</button>
                <button onClick={() => handleDeleteSalary(deleteSalaryConfirm)} className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold cursor-pointer">Xóa</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
