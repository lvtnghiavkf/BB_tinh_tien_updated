import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Invoice, Product, PurchaseOrder, SalaryEntry, PaymentLog, Partner, Expense } from '../types';
import {
  TrendingUp, Calendar,
  CircleDollarSign, Search, ShoppingBag, Percent, Receipt,
  ArrowDownToLine, Banknote, Wallet, Users, Plus, Pencil, Trash2,
  X, Download, Upload, AlertCircle, Building2, History,
  Tag, ChevronDown, ChevronUp, CheckCheck,
} from 'lucide-react';
import {
  fetchPurchaseOrders, updatePurchaseOrder,
  fetchPartners,
  fetchSalaryEntries, insertSalaryEntry, updateSalaryEntry, deleteSalaryEntry,
  insertPaymentLog, fetchPaymentLogs,
  fetchExpenses, insertExpense, updateExpense, deleteExpense,
} from '../lib/db';
import * as XLSX from 'xlsx';
import { motion, AnimatePresence } from 'motion/react';

interface ReportsProps {
  invoices: Invoice[];
  products: Product[];
  isManager?: boolean;
  onSelectInvoiceForReprint: (invoice: Invoice) => void;
}

type RangePreset = 'today' | '7days' | '30days' | 'custom';
type ReportType = 'revenue' | 'debt' | 'salary' | 'profit';

function toDateStr(d: Date) { return d.toISOString().slice(0, 10); }
function addDays(d: Date, n: number) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
const formatVND = (v: number) => v.toLocaleString('vi-VN') + ' ₫';

function calcSalaryInRange(entry: SalaryEntry, from: Date, to: Date): number {
  // Chuẩn hóa tất cả về 00:00:00 để tính ngày chính xác
  // VD: 15/05 = 1 ngày, 15/05-18/05 = 4 ngày (15,16,17,18)
  const eFrom = new Date(entry.dateFrom + 'T00:00:00');
  const eTo   = new Date(entry.dateTo   + 'T00:00:00');
  const fromDay = new Date(from); fromDay.setHours(0, 0, 0, 0);
  const toDay   = new Date(to);   toDay.setHours(0, 0, 0, 0);
  if (eFrom > toDay || eTo < fromDay) return 0;
  if (entry.calcType === 'lump') return entry.amount;
  const ovFrom = eFrom > fromDay ? eFrom : fromDay;
  const ovTo   = eTo   < toDay   ? eTo   : toDay;
  const days = Math.round((ovTo.getTime() - ovFrom.getTime()) / 86400000) + 1;
  return entry.amount * Math.max(1, days);
}

function getTotalSalary(e: SalaryEntry): number {
  if (e.calcType === 'lump') return e.amount;
  const eFrom = new Date(e.dateFrom + 'T00:00:00');
  const eTo   = new Date(e.dateTo   + 'T00:00:00');
  const days = Math.max(1, Math.round((eTo.getTime() - eFrom.getTime()) / 86400000) + 1);
  return e.amount * days;
}

const EMPTY_SALARY = { fullName: '', phone: '', amount: '', calcType: 'lump' as 'lump' | 'daily', dateFrom: '', dateTo: '', bankName: '', bankAccount: '', bankAccountName: '', notes: '' };

const SAL_BANKS = [
  { id: 'MB', name: 'MB Bank' }, { id: 'VCB', name: 'Vietcombank' },
  { id: 'TCB', name: 'Techcombank' }, { id: 'ACB', name: 'ACB' },
  { id: 'BIDV', name: 'BIDV' }, { id: 'ICB', name: 'VietinBank' },
  { id: 'VBARD', name: 'Agribank' }, { id: 'TPB', name: 'TPBank' },
  { id: 'VPB', name: 'VPBank' }, { id: 'STB', name: 'Sacombank' },
  { id: 'SHB', name: 'SHB' }, { id: 'HDB', name: 'HDBank' },
  { id: 'VIB', name: 'VIB' }, { id: 'OCB', name: 'OCB' },
  { id: 'MSB', name: 'MSB' }, { id: 'NAB', name: 'NamABank' },
];

function buildSalaryQR(bankCode: string, account: string, amount: number, name: string, info: string) {
  const params = new URLSearchParams({ amount: String(amount), addInfo: info, accountName: name });
  return `https://img.vietqr.io/image/${bankCode}-${account}-compact.jpg?${params}`;
}

export default function Reports({ invoices, products, isManager = false, onSelectInvoiceForReprint }: ReportsProps) {
  const [reportType, setReportType] = useState<ReportType>('revenue');
  const [hoveredDataIdx, setHoveredDataIdx] = useState<number | null>(null);

  // Debt tab state
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [debtLoading, setDebtLoading] = useState(false);
  const [debtError, setDebtError] = useState('');
  const [expandedPartnerId, setExpandedPartnerId] = useState<string | null>(null);
  const [payingOrder, setPayingOrder] = useState<PurchaseOrder | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payFull, setPayFull] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payDebtCash, setPayDebtCash] = useState(false);
  const [payDebtConfirmed, setPayDebtConfirmed] = useState(false);

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
  const [salarySaveError, setSalarySaveError] = useState('');
  const [payingSalary, setPayingSalary] = useState<SalaryEntry | null>(null);
  const [salaryPayAmount, setSalaryPayAmount] = useState('');
  const [salaryPayFull, setSalaryPayFull] = useState(false);
  const [salaryPayCash, setSalaryPayCash] = useState(false);
  const [salaryPaySaving, setSalaryPaySaving] = useState(false);
  const [salaryPayError, setSalaryPayError] = useState('');
  const [salaryPayConfirmed, setSalaryPayConfirmed] = useState(false);
  const [paymentLogs, setPaymentLogs] = useState<PaymentLog[]>([]);
  const [showDebtPaidHistory, setShowDebtPaidHistory] = useState(false);
  const [showSalaryPaidHistory, setShowSalaryPaidHistory] = useState(false);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null);
  const [expenseForm, setExpenseForm] = useState({ content: '', amount: '', date: '', notes: '', expenseType: 'expense' as 'expense' | 'tax' });
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseSaveError, setExpenseSaveError] = useState('');
  const [deleteExpenseConfirm, setDeleteExpenseConfirm] = useState<string | null>(null);
  const [expandedExpenseId, setExpandedExpenseId] = useState<string | null>(null);
  const [showDebtorsModal, setShowDebtorsModal] = useState(false);
  const [showUnpaidSalaryModal, setShowUnpaidSalaryModal] = useState(false);
  const [payingAllPartner, setPayingAllPartner] = useState<{ id: string; name: string; remaining: number; orders: PurchaseOrder[] } | null>(null);
  const [payingAllConfirmed, setPayingAllConfirmed] = useState(false);
  const [payingAllSaving, setPayingAllSaving] = useState(false);
  const [payingAllCash, setPayingAllCash] = useState(false);
  const [profitChartView, setProfitChartView] = useState<'day' | 'month' | 'year'>('month');
  const [profitChartYear, setProfitChartYear] = useState(new Date().getFullYear());
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
    invoices.filter(inv => { const t = new Date(inv.timestamp).getTime(); return t >= dateFrom.getTime() && t <= dateTo.getTime() && (inv.status ?? 'completed') !== 'cancelled'; }),
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

  // Load debt data + partners
  useEffect(() => {
    if (reportType !== 'debt') return;
    setDebtLoading(true);
    setDebtError('');
    Promise.all([fetchPurchaseOrders(), fetchPartners()])
      .then(([orders, pts]) => { setPurchaseOrders(orders); setPartners(pts); })
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

  // Load payment logs when debt or salary tab
  useEffect(() => {
    if (reportType !== 'debt' && reportType !== 'salary') return;
    fetchPaymentLogs().then(data => setPaymentLogs(data)).catch(() => {});
  }, [reportType]);

  useEffect(() => {
    if (reportType !== 'profit') return;
    setExpensesLoading(true);
    fetchExpenses().then(data => setExpenses(data)).catch(() => {}).finally(() => setExpensesLoading(false));
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
    setPayDebtCash(false);
    setPayDebtConfirmed(false);
  }

  async function confirmPay() {
    if (!payingOrder) return;
    const remaining = payingOrder.totalAmount - payingOrder.paidAmount;
    const amount = payFull ? remaining : Math.min(Number(payAmount) || 0, remaining);
    if (amount <= 0) return;
    setPaying(true);
    try {
      const newPaid = payingOrder.paidAmount + amount;
      const newRemaining = payingOrder.totalAmount - newPaid;
      const updated = { ...payingOrder, paidAmount: newPaid };
      await updatePurchaseOrder(updated);
      setPurchaseOrders(prev => prev.map(o => o.id === payingOrder.id ? updated : o));
      const log: PaymentLog = {
        id: `PL${Date.now()}`,
        createdAt: new Date().toISOString(),
        type: 'debt',
        referenceId: payingOrder.id,
        referenceName: payingOrder.partnerName || 'Không rõ',
        amount,
        paymentMethod: payDebtCash ? 'cash' : 'bank',
        remaining: newRemaining,
        notes: payingOrder.id,
      };
      try { await insertPaymentLog(log); setPaymentLogs(prev => [log, ...prev]); } catch (_) {}
      setPayingOrder(null);
      setPayDebtConfirmed(false);
    } finally {
      setPaying(false);
    }
  }

  // Profit: salary in range
  const salaryInRange = useMemo(() =>
    salaryEntries.map(e => ({ ...e, appliedAmount: calcSalaryInRange(e, dateFrom, dateTo) })).filter(e => e.appliedAmount > 0),
    [salaryEntries, dateFrom, dateTo]);

  const totalSalary = useMemo(() => salaryInRange.reduce((s, e) => s + e.appliedAmount, 0), [salaryInRange]);
  const totalExpenses = useMemo(() => expenses.filter(e => e.expenseType !== 'tax').reduce((s, e) => s + e.amount, 0), [expenses]);
  const totalTax = useMemo(() => expenses.filter(e => e.expenseType === 'tax').reduce((s, e) => s + e.amount, 0), [expenses]);
  const netProfit = stats.profit - totalSalary - totalExpenses - totalTax;

  const availableYears = useMemo(() => {
    const years = new Set<number>();
    invoices.forEach(inv => years.add(new Date(inv.timestamp).getFullYear()));
    return Array.from(years).sort((a, b) => a - b);
  }, [invoices]);

  const monthlyChartData = useMemo(() => {
    const months = Array.from({ length: 12 }, (_, i) => ({ label: `T${i + 1}`, revenue: 0, profit: 0, transactions: 0 }));
    invoices.forEach(inv => {
      const d = new Date(inv.timestamp);
      if (d.getFullYear() !== profitChartYear || (inv.status ?? 'completed') === 'cancelled') return;
      const m = d.getMonth();
      let cost = 0; inv.items.forEach(it => { cost += it.product.costPrice * it.quantity; });
      months[m].revenue += inv.finalAmount;
      months[m].profit += inv.finalAmount - cost;
      months[m].transactions += 1;
    });
    return months;
  }, [invoices, profitChartYear]);

  const yearlyChartData = useMemo(() => {
    const yearMap: Record<string, { revenue: number; profit: number; transactions: number }> = {};
    invoices.forEach(inv => {
      if ((inv.status ?? 'completed') === 'cancelled') return;
      const year = String(new Date(inv.timestamp).getFullYear());
      if (!yearMap[year]) yearMap[year] = { revenue: 0, profit: 0, transactions: 0 };
      let cost = 0; inv.items.forEach(it => { cost += it.product.costPrice * it.quantity; });
      yearMap[year].revenue += inv.finalAmount;
      yearMap[year].profit += inv.finalAmount - cost;
      yearMap[year].transactions += 1;
    });
    return Object.entries(yearMap).sort(([a], [b]) => Number(a) - Number(b)).map(([label, d]) => ({ label, ...d }));
  }, [invoices]);

  const filteredSalary = useMemo(() => {
    if (!salarySearch) return salaryEntries;
    const q = salarySearch.toLowerCase();
    return salaryEntries.filter(e => e.fullName.toLowerCase().includes(q) || e.phone.includes(q));
  }, [salaryEntries, salarySearch]);

  const salaryTotalOwed = useMemo(() => salaryEntries.reduce((s, e) => s + getTotalSalary(e), 0), [salaryEntries]);
  const salaryTotalPaid = useMemo(() => salaryEntries.reduce((s, e) => s + (e.paidAmount ?? 0), 0), [salaryEntries]);
  const salaryTotalRemaining = salaryTotalOwed - salaryTotalPaid;
  const salaryUnpaidCount = useMemo(() => salaryEntries.filter(e => (getTotalSalary(e) - (e.paidAmount ?? 0)) > 0).length, [salaryEntries]);

  const salaryTotalByName = useMemo(() => {
    const map: Record<string, number> = {};
    salaryEntries.forEach(e => { map[e.fullName] = (map[e.fullName] || 0) + getTotalSalary(e); });
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
        const eTo   = new Date(e.dateTo   + 'T00:00:00');
        const fromDay = new Date(dateFrom); fromDay.setHours(0, 0, 0, 0);
        const toDay   = new Date(dateTo);   toDay.setHours(0, 0, 0, 0);
        const ovFrom = eFrom > fromDay ? eFrom : fromDay;
        const ovTo   = eTo   < toDay   ? eTo   : toDay;
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
    setSalaryForm({ fullName: e.fullName, phone: e.phone, amount: String(e.amount), calcType: e.calcType, dateFrom: e.dateFrom, dateTo: e.dateTo, bankName: e.bankName ?? '', bankAccount: e.bankAccount ?? '', bankAccountName: e.bankAccountName ?? '', notes: e.notes ?? '' });
    setShowSalaryForm(true);
  }
  function openPaySalary(e: SalaryEntry) {
    const remaining = getTotalSalary(e) - (e.paidAmount ?? 0);
    setPayingSalary(e); setSalaryPayAmount(String(remaining)); setSalaryPayFull(false); setSalaryPayCash(false); setSalaryPayConfirmed(false);
  }
  async function confirmSalaryPay() {
    if (!payingSalary) return;
    const remaining = getTotalSalary(payingSalary) - (payingSalary.paidAmount ?? 0);
    const amount = salaryPayFull ? remaining : Math.min(Number(salaryPayAmount) || 0, remaining);
    if (amount <= 0) return;
    setSalaryPaySaving(true);
    setSalaryPayError('');
    try {
      const newPaid = (payingSalary.paidAmount ?? 0) + amount;
      const newRemaining = getTotalSalary(payingSalary) - newPaid;
      const updated: SalaryEntry = { ...payingSalary, paidAmount: newPaid, isPaidCash: salaryPayCash };
      await updateSalaryEntry(updated);
      setSalaryEntries(prev => prev.map(e => e.id === payingSalary.id ? updated : e));
      const log: PaymentLog = {
        id: `PL${Date.now()}`,
        createdAt: new Date().toISOString(),
        type: 'salary',
        referenceId: payingSalary.id,
        referenceName: payingSalary.fullName,
        amount,
        paymentMethod: salaryPayCash ? 'cash' : 'bank',
        remaining: newRemaining,
        notes: `${payingSalary.dateFrom} → ${payingSalary.dateTo}`,
      };
      try { await insertPaymentLog(log); setPaymentLogs(prev => [log, ...prev]); } catch (_) {}
      setPayingSalary(null);
      setSalaryPayConfirmed(false);
    } catch (err: any) {
      setSalaryPayError(err?.message ?? 'Lỗi khi lưu thanh toán lương. Vui lòng thử lại.');
    } finally {
      setSalaryPaySaving(false);
    }
  }
  async function handleSaveSalary() {
    if (!salaryForm.fullName.trim() || !salaryForm.amount || !salaryForm.dateFrom || !salaryForm.dateTo) return;
    setSalarySaving(true);
    setSalarySaveError('');
    try {
      if (editingSalaryId) {
        const existing = salaryEntries.find(e => e.id === editingSalaryId)!;
        const updated: SalaryEntry = { ...existing, fullName: salaryForm.fullName.trim(), phone: salaryForm.phone.trim(), amount: Number(salaryForm.amount), calcType: salaryForm.calcType, dateFrom: salaryForm.dateFrom, dateTo: salaryForm.dateTo, bankName: salaryForm.bankName || undefined, bankAccount: salaryForm.bankAccount || undefined, bankAccountName: salaryForm.bankAccountName || undefined, notes: salaryForm.notes.trim() || undefined };
        await updateSalaryEntry(updated);
        setSalaryEntries(prev => prev.map(e => e.id === editingSalaryId ? updated : e));
      } else {
        const newEntry: SalaryEntry = { id: `sal_${Date.now()}`, fullName: salaryForm.fullName.trim(), phone: salaryForm.phone.trim(), amount: Number(salaryForm.amount), calcType: salaryForm.calcType, dateFrom: salaryForm.dateFrom, dateTo: salaryForm.dateTo, bankName: salaryForm.bankName || undefined, bankAccount: salaryForm.bankAccount || undefined, bankAccountName: salaryForm.bankAccountName || undefined, paidAmount: 0, notes: salaryForm.notes.trim() || undefined, createdAt: new Date().toISOString() };
        await insertSalaryEntry(newEntry);
        setSalaryEntries(prev => [newEntry, ...prev]);
      }
      setShowSalaryForm(false);
    } catch (err: any) {
      setSalarySaveError(err?.message ?? 'Lỗi khi lưu bảng lương. Vui lòng thử lại.');
    } finally {
      setSalarySaving(false);
    }
  }
  async function handleDeleteSalary(id: string) {
    await deleteSalaryEntry(id);
    setSalaryEntries(prev => prev.filter(e => e.id !== id));
    setDeleteSalaryConfirm(null);
  }

  function openAddExpense(type: 'expense' | 'tax' = 'expense') {
    setEditingExpenseId(null);
    setExpenseForm({ content: '', amount: '', date: toDateStr(new Date()), notes: '', expenseType: type });
    setShowExpenseForm(true);
    setExpenseSaveError('');
  }
  function openEditExpense(e: Expense) {
    setEditingExpenseId(e.id);
    setExpenseForm({ content: e.content, amount: String(e.amount), date: e.date, notes: e.notes ?? '', expenseType: e.expenseType ?? 'expense' });
    setShowExpenseForm(true);
    setExpenseSaveError('');
  }
  async function handleSaveExpense() {
    if (!expenseForm.content.trim() || !expenseForm.amount || !expenseForm.date) return;
    setExpenseSaving(true);
    setExpenseSaveError('');
    try {
      if (editingExpenseId) {
        const existing = expenses.find(e => e.id === editingExpenseId)!;
        const updated: Expense = { ...existing, content: expenseForm.content.trim(), amount: Number(expenseForm.amount), date: expenseForm.date, notes: expenseForm.notes.trim() || undefined, expenseType: expenseForm.expenseType };
        await updateExpense(updated);
        setExpenses(prev => prev.map(e => e.id === editingExpenseId ? updated : e));
      } else {
        const suffix = String(Date.now()).slice(-5);
        const code = expenseForm.expenseType === 'tax' ? `TAX${suffix}` : `CP${suffix}`;
        const newExp: Expense = { id: `exp_${Date.now()}`, code, expenseType: expenseForm.expenseType, content: expenseForm.content.trim(), amount: Number(expenseForm.amount), date: expenseForm.date, notes: expenseForm.notes.trim() || undefined, createdAt: new Date().toISOString() };
        await insertExpense(newExp);
        setExpenses(prev => [newExp, ...prev]);
      }
      setShowExpenseForm(false);
    } catch (err: any) {
      setExpenseSaveError(err?.message ?? 'Lỗi khi lưu chi phí. Vui lòng thử lại.');
    } finally {
      setExpenseSaving(false);
    }
  }

  async function handlePayAllPartner() {
    if (!payingAllPartner) return;
    setPayingAllSaving(true);
    try {
      const unpaidOrders = payingAllPartner.orders.filter(o => o.totalAmount - o.paidAmount > 0);
      for (const o of unpaidOrders) {
        const rem = o.totalAmount - o.paidAmount;
        const updated = { ...o, paidAmount: o.totalAmount };
        await updatePurchaseOrder(updated);
        setPurchaseOrders(prev => prev.map(x => x.id === o.id ? updated : x));
        const log: PaymentLog = {
          id: `PL${Date.now()}_${o.id}`,
          createdAt: new Date().toISOString(),
          type: 'debt',
          referenceId: o.id,
          referenceName: payingAllPartner.name,
          amount: rem,
          paymentMethod: payingAllCash ? 'cash' : 'bank',
          remaining: 0,
          notes: `Thanh toán tất cả công nợ`,
        };
        try { await insertPaymentLog(log); setPaymentLogs(prev => [log, ...prev]); } catch (_) {}
      }
      setPayingAllPartner(null);
      setPayingAllConfirmed(false);
    } catch (err: any) {
      console.error(err);
    } finally {
      setPayingAllSaving(false);
    }
  }
  async function handleDeleteExpense(id: string) {
    await deleteExpense(id);
    setExpenses(prev => prev.filter(e => e.id !== id));
    setDeleteExpenseConfirm(null);
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

  function downloadDebtPaymentTemplate() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['STT', 'Thời gian thanh toán', 'Đối tác', 'Thương hiệu', 'Phiếu nhập hàng', 'Số tiền', 'Thanh toán', 'Ghi chú'],
      [1, '2026-06-13', 'Tên đối tác', 'Thương hiệu', 'PN001', 1000000, 'Tiền mặt', ''],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Mẫu công nợ');
    XLSX.writeFile(wb, 'mau_thanh_toan_cong_no.xlsx');
  }

  function exportDebtPaymentHistory() {
    const logs = paymentLogs.filter(l => l.type === 'debt');
    const data = logs.map((log, i) => ({
      'STT': i + 1, 'Thời gian thanh toán': new Date(log.createdAt).toLocaleString('vi-VN'),
      'Đối tác': log.referenceName, 'Phiếu nhập hàng': log.referenceId,
      'Số tiền': log.amount, 'Thanh toán': log.paymentMethod === 'bank' ? 'Chuyển khoản' : 'Tiền mặt',
      'Còn nợ': log.remaining, 'Ghi chú': log.notes ?? '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Lịch sử công nợ');
    XLSX.writeFile(wb, `lich_su_cong_no_${toDateStr(new Date())}.xlsx`);
  }

  function downloadSalaryPaymentTemplate() {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([
      ['STT', 'Thời gian thanh toán', 'Họ và tên', 'Thời gian làm việc', 'Cách tính', 'Số lượng', 'Đơn giá', 'Thành tiền', 'Thanh toán', 'Ghi chú'],
      [1, '2026-06-13', 'Nguyễn Văn A', '01/06-30/06/2026', 'Đợt', 1, 5000000, 5000000, 'Chuyển khoản', ''],
    ]);
    XLSX.utils.book_append_sheet(wb, ws, 'Mẫu lương');
    XLSX.writeFile(wb, 'mau_tra_luong.xlsx');
  }

  function exportSalaryPaymentHistory() {
    const logs = paymentLogs.filter(l => l.type === 'salary');
    const data = logs.map((log, i) => ({
      'STT': i + 1, 'Thời gian thanh toán': new Date(log.createdAt).toLocaleString('vi-VN'),
      'Họ và tên': log.referenceName, 'Số tiền': log.amount,
      'Thanh toán': log.paymentMethod === 'bank' ? 'Chuyển khoản' : 'Tiền mặt',
      'Còn nợ lương': log.remaining, 'Ghi chú': log.notes ?? '',
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Lịch sử lương');
    XLSX.writeFile(wb, `lich_su_luong_${toDateStr(new Date())}.xlsx`);
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
          <h1 className="text-2xl font-extrabold text-zinc-100 tracking-tight">Báo cáo</h1>
          <p className="text-zinc-400 text-sm mt-1">Doanh thu, công nợ và lợi nhuận theo kỳ.</p>
        </div>
        <div className="flex border border-zinc-700 rounded-xl bg-zinc-800 p-1 shadow-xs w-full sm:w-auto">
          {([['revenue', <TrendingUp className="w-3.5 h-3.5" />, 'Doanh thu'], ['debt', <ArrowDownToLine className="w-3.5 h-3.5" />, 'Công nợ'], ['salary', <Users className="w-3.5 h-3.5" />, 'Lương'], ...(isManager ? [['profit', <Wallet className="w-3.5 h-3.5" />, 'Lợi nhuận']] : [])] as [ReportType, React.ReactNode, string][]).map(([id, icon, label]) => (
            <button key={id} onClick={() => setReportType(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer whitespace-nowrap ${reportType === id ? 'bg-blue-600 text-white shadow-sm' : 'text-zinc-400 hover:text-zinc-100'}`}>
              {icon} {label}
            </button>
          ))}
        </div>
      </div>

      {/* Date Range Filter (shared) */}
      <div className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-xs font-bold text-zinc-300 whitespace-nowrap">Khoảng thời gian:</span>
          </div>
          <div className="flex gap-1 bg-zinc-900 rounded-lg p-1 border border-zinc-700">
            {(['today', '7days', '30days', 'custom'] as RangePreset[]).map(p => (
              <button key={p} onClick={() => setRangePreset(p)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${rangePreset === p ? 'bg-blue-600 text-white shadow-xs' : 'text-zinc-400 hover:text-zinc-100'}`}>
                {presetLabel[p]}
              </button>
            ))}
          </div>
          {rangePreset === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-zinc-400 font-medium whitespace-nowrap">Từ ngày:</span>
              <input type="date" value={customFrom} max={customTo} onChange={e => setCustomFrom(e.target.value)}
                className="px-2 py-1 border border-zinc-700 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500 cursor-pointer" />
              <span className="text-xs text-zinc-400 font-medium whitespace-nowrap">Đến ngày:</span>
              <input type="date" value={customTo} min={customFrom} max={toDateStr(new Date())} onChange={e => setCustomTo(e.target.value)}
                className="px-2 py-1 border border-zinc-700 rounded-lg text-xs font-medium focus:outline-none focus:border-blue-500 cursor-pointer" />
            </div>
          )}
          <p className="text-[11px] text-zinc-500 ml-auto whitespace-nowrap">
            {rangePreset !== 'custom' ? `${dateFrom.toLocaleDateString('vi-VN')} — ${dateTo.toLocaleDateString('vi-VN')}` : `${new Date(customFrom + 'T00:00:00').toLocaleDateString('vi-VN')} — ${new Date(customTo + 'T00:00:00').toLocaleDateString('vi-VN')}`}
          </p>
        </div>
      </div>

      {/* ── REVENUE TAB ─────────────────────────────────── */}
      {reportType === 'revenue' && (
        <>
          <AnimatePresence mode="wait">
            {true ? (
              <motion.div key="kpi-tab" initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -15 }} className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700 shadow-xs flex items-center justify-between">
                    <div className="space-y-1"><p className="text-xs font-bold text-zinc-500 tracking-wider uppercase">DOANH THU</p><p className="text-xl font-extrabold text-blue-600 font-mono">{formatVND(stats.revenue)}</p><p className="text-[10px] text-zinc-500">{stats.transactions} giao dịch</p></div>
                    <div className="p-3.5 bg-blue-900/30 text-blue-400 rounded-xl"><CircleDollarSign className="w-6 h-6" /></div>
                  </div>
                  {isManager && (
                    <div className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700 shadow-xs flex items-center justify-between">
                      <div className="space-y-1"><p className="text-xs font-bold text-zinc-500 tracking-wider uppercase">LỢI NHUẬN GỘP</p><p className="text-xl font-extrabold text-emerald-600 font-mono">{formatVND(stats.profit)}</p><p className="text-[10px] text-zinc-500">Đã trừ vốn nhập gốc</p></div>
                      <div className="p-3.5 bg-emerald-900/30 text-emerald-400 rounded-xl"><TrendingUp className="w-6 h-6" /></div>
                    </div>
                  )}
                  <div className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700 shadow-xs flex items-center justify-between">
                    <div className="space-y-1"><p className="text-xs font-bold text-zinc-500 tracking-wider uppercase">SỐ HÓA ĐƠN</p><p className="text-2xl font-extrabold text-zinc-100 font-mono">{stats.transactions}</p><p className="text-[10px] text-zinc-500">Giao dịch thành công</p></div>
                    <div className="p-3.5 bg-zinc-700 text-zinc-300 rounded-xl"><Receipt className="w-6 h-6" /></div>
                  </div>
                  <div className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700 shadow-xs flex items-center justify-between">
                    <div className="space-y-1"><p className="text-xs font-bold text-zinc-500 tracking-wider uppercase">ĐƠN TRUNG BÌNH</p><p className="text-lg font-bold text-zinc-100 font-mono">{formatVND(stats.averageTicket)}</p>{isManager && <p className="text-[10px] text-blue-600 font-semibold italic">Lợi nhuận: {Math.round(stats.margin)}%</p>}</div>
                    <div className="p-3.5 bg-purple-50 text-purple-600 rounded-xl"><Percent className="w-6 h-6" /></div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700 shadow-xs lg:col-span-2 space-y-4">
                    <div className="flex justify-between items-center pb-2 border-b border-zinc-700">
                      <div><h3 className="font-extrabold text-zinc-100 text-sm">Biểu đồ doanh thu theo ngày</h3><p className="text-[11px] text-zinc-500 mt-0.5">{isManager ? 'Doanh thu (xanh dương) & Lợi nhuận (xanh lá)' : 'Doanh thu theo ngày'}</p></div>
                      <div className="flex items-center gap-2 text-[10px] bg-zinc-800 border border-zinc-700 px-2 py-1 rounded-md font-semibold text-zinc-400"><Calendar className="w-3.5 h-3.5" /> {presetLabel[rangePreset]}</div>
                    </div>
                    <div className="relative pt-2 h-[clamp(200px,22vh,360px)]">
                      <svg viewBox={`0 0 ${svgDim.width} ${svgDim.height}`} className="w-full h-full overflow-visible">
                        {[0, 0.25, 0.5, 0.75, 1].map(ratio => { const y = svgDim.height - svgDim.pB - (ratio * (svgDim.height - svgDim.pT - svgDim.pB)); return (<g key={ratio} className="opacity-15"><line x1={svgDim.pL} y1={y} x2={svgDim.width - svgDim.pR} y2={y} stroke="#475569" strokeWidth="1" strokeDasharray="4,4" /><text x={svgDim.pL - 8} y={y + 4} fill="#1e293b" fontSize="8" fontFamily="monospace" textAnchor="end">{Math.round((ratio * maxRev) / 1000)}k</text></g>); })}
                        {chartData.map((d, idx) => { const step = chartData.length > 1 ? (svgDim.width - svgDim.pL - svgDim.pR) / (chartData.length - 1) : 0; const x = svgDim.pL + idx * step; const showLabel = chartData.length <= 14 || idx % Math.ceil(chartData.length / 14) === 0; return showLabel ? (<text key={idx} x={x} y={svgDim.height - svgDim.pB + 16} fontSize="9" fontWeight="bold" fill="#64748b" textAnchor="middle">{d.date}</text>) : null; })}
                        {revPts.length > 1 && (<><path d={`M ${revPts[0].x} ${svgDim.height - svgDim.pB} ${revPts.map(p => `L ${p.x} ${p.y}`).join(' ')} L ${revPts[revPts.length-1].x} ${svgDim.height - svgDim.pB} Z`} fill="#3b82f6" opacity="0.05" /><path d={revPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" /></>)}
                        {isManager && profPts.length > 1 && (<path d={profPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeDasharray="1,1" />)}
                        {revPts.map((p, idx) => (<g key={idx}><circle cx={p.x} cy={p.y} r={hoveredDataIdx === idx ? 6 : 4} fill="#ffffff" stroke="#2563eb" strokeWidth="2" onMouseEnter={() => setHoveredDataIdx(idx)} onMouseLeave={() => setHoveredDataIdx(null)} className="transition-all duration-150 cursor-pointer" /><circle cx={profPts[idx].x} cy={profPts[idx].y} r={hoveredDataIdx === idx ? 5 : 3.5} fill="#ffffff" stroke="#10b981" strokeWidth="1.5" onMouseEnter={() => setHoveredDataIdx(idx)} onMouseLeave={() => setHoveredDataIdx(null)} className="transition-all duration-150 cursor-pointer" /><rect x={p.x - 15} y={svgDim.pT} width={30} height={svgDim.height - svgDim.pT - svgDim.pB} fill="transparent" onMouseEnter={() => setHoveredDataIdx(idx)} onMouseLeave={() => setHoveredDataIdx(null)} className="cursor-pointer" /></g>))}
                      </svg>
                      {hoveredDataIdx !== null && (
                        <div className="absolute bg-slate-900/95 text-white p-3 rounded-xl shadow-lg border border-slate-700 pointer-events-none text-xs z-20 space-y-1" style={{ left: `${(hoveredDataIdx / Math.max(chartData.length - 1, 1)) * 70 + 10}%`, top: '5%' }}>
                          <p className="font-bold border-b border-slate-700 pb-1 text-[10px] text-zinc-500">NGÀY {chartData[hoveredDataIdx].date}</p>
                          <p className="flex justify-between gap-4"><span>Doanh thu:</span><span className="font-mono font-bold text-sky-400">{formatVND(chartData[hoveredDataIdx].revenue)}</span></p>
                          {isManager && <p className="flex justify-between gap-4"><span>Lợi nhuận:</span><span className="font-mono font-bold text-emerald-400">{formatVND(chartData[hoveredDataIdx].profit)}</span></p>}
                          <p className="flex justify-between gap-4"><span>Giao dịch:</span><span className="font-mono font-bold">{chartData[hoveredDataIdx].transactions} đơn</span></p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700 shadow-xs flex flex-col justify-between">
                    <div><h3 className="font-bold text-zinc-100 text-sm">Cơ cấu thanh toán</h3><p className="text-[11px] text-zinc-500 mt-0.5">Phương thức thanh toán trong kỳ.</p></div>
                    <div className="my-6 space-y-4">
                      {paymentMethodStats.map(item => (
                        <div key={item.name} className="space-y-1.5">
                          <div className="flex justify-between text-xs font-semibold"><span className="text-zinc-300 flex items-center gap-2"><span className={`w-3 h-3 rounded-full ${item.color}`}></span>{item.name}</span><span className="text-zinc-100">{item.percent}% <span className="text-zinc-500 font-mono">({formatVND(item.value)})</span></span></div>
                          <div className="w-full h-2 bg-zinc-700 rounded-full overflow-hidden"><div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.percent}%` }}></div></div>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-zinc-500 italic text-center pb-1">Mã QR chuyển khoản tăng nhanh trong hành vi tiêu dùng.</p>
                  </div>
                </div>

                <div className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700 shadow-sm">
                  <div className="flex items-center gap-2 pb-3 border-b border-zinc-700 mb-4 text-zinc-100"><ShoppingBag className="w-5 h-5 text-blue-600 shrink-0" /><h3 className="font-bold text-sm">Top 5 sản phẩm bán chạy</h3></div>
                  {topProducts.length === 0 ? (<div className="p-6 text-center text-zinc-500 text-xs">Chưa có giao dịch trong kỳ báo cáo.</div>) : (
                    <div className="space-y-4">
                      {topProducts.map((p, idx) => { const maxQty = topProducts[0]?.quantity || 1; return (
                        <div key={p.sku} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-zinc-800/20 rounded-lg hover:bg-zinc-800/40 transition border border-zinc-700">
                          <div className="flex items-center gap-3 min-w-0 flex-1"><span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0">{idx + 1}</span><div className="min-w-0"><p className="font-bold text-zinc-100 text-xs sm:text-sm truncate">{p.name}</p><span className="text-[11px] text-slate-450 font-mono">SKU: {p.sku}</span></div></div>
                          <div className="flex items-center gap-4 shrink-0"><div className="hidden sm:block w-32 bg-slate-150 h-1.5 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 rounded-full" style={{ width: `${(p.quantity / maxQty) * 100}%` }}></div></div><div><p className="text-xs sm:text-sm font-black text-zinc-100">{p.quantity} <span className="font-light text-[11px] text-zinc-500">bán ra</span></p><p className="text-[10px] text-emerald-600 font-mono font-medium">{formatVND(p.revenue)}</p></div></div>
                        </div>
                      ); })}
                    </div>
                  )}
                </div>
              </motion.div>
            ) : null}
          </AnimatePresence>
        </>
      )}

      {/* ── DEBT TAB ─────────────────────────────────────── */}
      {reportType === 'debt' && (
        <div className="space-y-5">
          {debtLoading ? (
            <div className="flex items-center justify-center py-16"><div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /><p className="ml-3 text-zinc-400 text-sm">Đang tải...</p></div>
          ) : debtError ? (
            <div className="bg-rose-900/20 border border-rose-700/50 rounded-xl p-5 flex items-center gap-3"><AlertCircle className="w-5 h-5 text-rose-600 shrink-0" /><p className="text-rose-300 text-sm">{debtError}</p></div>
          ) : (
            <>
              {/* Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700 shadow-xs flex items-center justify-between">
                  <div><p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">TỔNG NỢ CÒN LẠI</p><p className={`text-xl font-extrabold font-mono mt-1 ${totalDebt > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{formatVND(totalDebt)}</p></div>
                  <div className="p-3.5 bg-rose-900/30 text-rose-400 rounded-xl"><Banknote className="w-6 h-6" /></div>
                </div>
                <button onClick={() => setShowDebtorsModal(true)} className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700 shadow-xs flex items-center justify-between w-full text-left cursor-pointer hover:bg-zinc-700/50 transition">
                  <div><p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">SỐ ĐỐI TÁC CÒN NỢ</p><p className="text-xl font-extrabold text-amber-400 mt-1">{debtByPartner.filter(p => p.remaining > 0).length}</p><p className="text-[10px] text-zinc-500 mt-0.5">Bấm để xem danh sách →</p></div>
                  <div className="p-3.5 bg-amber-900/30 text-amber-400 rounded-xl"><Users className="w-6 h-6" /></div>
                </button>
                <button onClick={() => setShowDebtPaidHistory(true)} className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700 shadow-xs flex items-center justify-between w-full text-left cursor-pointer hover:bg-zinc-700/50 transition">
                  <div><p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">TỔNG ĐÃ THANH TOÁN</p><p className="text-xl font-extrabold text-emerald-400 font-mono mt-1">{formatVND(debtByPartner.reduce((s, p) => s + p.paid, 0))}</p><p className="text-[10px] text-zinc-500 mt-0.5">Bấm để xem lịch sử →</p></div>
                  <div className="p-3.5 bg-emerald-900/30 text-emerald-400 rounded-xl"><TrendingUp className="w-6 h-6" /></div>
                </button>
              </div>

              {/* Per-partner breakdown */}
              {debtByPartner.length === 0 ? (
                <div className="bg-zinc-800/50 rounded-xl border border-zinc-700 p-12 text-center text-zinc-500">
                  <ArrowDownToLine className="w-10 h-10 mx-auto stroke-1 mb-2 text-zinc-600" />
                  <p className="text-sm font-semibold">Không có công nợ</p>
                </div>
              ) : debtByPartner.map(p => (
                <div key={p.id} className="bg-zinc-800/50 rounded-xl border border-zinc-700 shadow-sm overflow-hidden">
                  <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-zinc-800/40 transition"
                    onClick={() => setExpandedPartnerId(expandedPartnerId === p.id ? null : p.id)}>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-zinc-100">{p.partnerName}</p>
                        <span className="text-[10px] bg-zinc-700 text-zinc-400 px-1.5 py-0.5 rounded font-mono">ĐỐI TÁC</span>
                      </div>
                      <p className="text-xs text-zinc-400 mt-0.5">{p.orders.length} phiếu nhập · Tổng: {formatVND(p.total)} · Đã trả: {formatVND(p.paid)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0 ml-4">
                      {p.remaining > 0 && (
                        <button onClick={e => { e.stopPropagation(); setPayingAllPartner({ id: p.id, name: p.partnerName, remaining: p.remaining, orders: p.orders }); setPayingAllConfirmed(false); setPayingAllCash(false); }}
                          className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold cursor-pointer transition whitespace-nowrap flex items-center gap-1">
                          <CheckCheck className="w-3.5 h-3.5" /> Thanh toán tất cả
                        </button>
                      )}
                      <div className="text-right">
                        <p className={`font-bold font-mono ${p.remaining > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>{p.remaining > 0 ? formatVND(p.remaining) : 'Đã thanh toán đủ'}</p>
                        {p.remaining > 0 && <p className="text-[10px] text-rose-500 mt-0.5">còn nợ</p>}
                      </div>
                    </div>
                  </div>
                  <AnimatePresence>
                    {expandedPartnerId === p.id && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        <div className="border-t border-zinc-700/50 divide-y divide-slate-50">
                          {p.orders.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).map(o => {
                            const rem = o.totalAmount - o.paidAmount;
                            return (
                              <div key={o.id} className="px-4 py-3 flex items-center justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-mono font-bold text-zinc-300">{o.id}</p>
                                  <p className="text-xs text-zinc-500">{new Date(o.timestamp).toLocaleDateString('vi-VN')} · {o.items.length} sản phẩm</p>
                                </div>
                                <div className="text-right shrink-0 text-xs space-y-0.5">
                                  <p className="font-mono font-bold">{formatVND(o.totalAmount)}</p>
                                  {rem > 0 && <p className="text-rose-600 font-mono">Còn: {formatVND(rem)}</p>}
                                  {rem <= 0 && <p className="text-emerald-600 font-semibold">Đã trả đủ</p>}
                                </div>
                                {rem > 0 && (
                                  <button onClick={() => openPay(o)} className="px-3 py-1.5 bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/60 rounded-lg text-xs font-bold cursor-pointer transition whitespace-nowrap">Trả nợ</button>
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
          {/* Payment log history for debt */}
          {!debtLoading && paymentLogs.filter(l => l.type === 'debt').length > 0 && (
            <div className="bg-zinc-800/50 rounded-xl border border-zinc-700 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-zinc-700">
                <h3 className="font-bold text-zinc-100 text-sm flex items-center gap-2"><History className="w-4 h-4 text-emerald-600" /> Lịch sử thanh toán công nợ</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-zinc-800 border-b border-zinc-700 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Thời gian</th>
                      <th className="px-4 py-3">Đối tác</th>
                      <th className="px-4 py-3">Phiếu</th>
                      <th className="px-4 py-3">Hình thức</th>
                      <th className="px-4 py-3 text-right">Số tiền</th>
                      <th className="px-4 py-3 text-right">Còn nợ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-700">
                    {paymentLogs.filter(l => l.type === 'debt').map(log => (
                      <tr key={log.id} className="hover:bg-zinc-800/20 transition">
                        <td className="px-4 py-3 text-xs text-zinc-400 font-mono whitespace-nowrap">{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-3 font-semibold text-zinc-100">{log.referenceName}</td>
                        <td className="px-4 py-3 font-mono text-xs text-zinc-400">{log.referenceId}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${log.paymentMethod === 'bank' ? 'bg-blue-900/30 text-blue-300' : 'bg-amber-900/30 text-amber-300'}`}>
                            {log.paymentMethod === 'bank' ? <><Building2 className="w-3 h-3" /> CK</> : <><Banknote className="w-3 h-3" /> Tiền mặt</>}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{formatVND(log.amount)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-bold">
                          {log.remaining > 0 ? <span className="text-rose-600">{formatVND(log.remaining)}</span> : <span className="text-emerald-600">Đủ</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SALARY TAB ───────────────────────────────────── */}
      {reportType === 'salary' && (
        <div className="space-y-6">
          {/* Salary stat cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700 shadow-xs flex items-center justify-between">
              <div><p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">TỔNG NỢ LƯƠNG</p><p className={`text-xl font-extrabold font-mono mt-1 ${salaryTotalRemaining > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{formatVND(salaryTotalRemaining)}</p></div>
              <div className="p-3.5 bg-rose-900/30 text-rose-400 rounded-xl"><Banknote className="w-6 h-6" /></div>
            </div>
            <button onClick={() => setShowUnpaidSalaryModal(true)} className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700 shadow-xs flex items-center justify-between w-full text-left cursor-pointer hover:bg-zinc-700/50 transition">
              <div><p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">SỐ NGƯỜI CHƯA TRẢ LƯƠNG</p><p className="text-xl font-extrabold text-amber-400 mt-1">{salaryUnpaidCount}</p><p className="text-[10px] text-zinc-500 mt-0.5">Bấm để xem danh sách →</p></div>
              <div className="p-3.5 bg-amber-900/30 text-amber-400 rounded-xl"><Users className="w-6 h-6" /></div>
            </button>
            <button onClick={() => setShowSalaryPaidHistory(true)} className="bg-zinc-800/50 p-5 rounded-xl border border-zinc-700 shadow-xs flex items-center justify-between w-full text-left cursor-pointer hover:bg-zinc-700/50 transition">
              <div><p className="text-xs font-bold text-zinc-400 uppercase tracking-wider">TỔNG ĐÃ TRẢ LƯƠNG</p><p className="text-xl font-extrabold text-emerald-400 font-mono mt-1">{formatVND(salaryTotalPaid)}</p><p className="text-[10px] text-zinc-500 mt-0.5">Bấm để xem lịch sử →</p></div>
              <div className="p-3.5 bg-emerald-900/30 text-emerald-400 rounded-xl"><TrendingUp className="w-6 h-6" /></div>
            </button>
          </div>
          {/* Salary in range grouped by person */}
          <div className="bg-zinc-800/50 rounded-xl border border-zinc-700 shadow-sm overflow-hidden">
            <div className="p-5 border-b border-zinc-700">
              <h3 className="font-bold text-zinc-100 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-amber-600" /> Lương phát sinh trong kỳ</h3>
              <p className="text-xs text-zinc-500 mt-0.5">Nhóm theo nhân viên, tổng hợp đợt và ngày công.</p>
            </div>
            {salaryLoading ? (
              <div className="flex items-center justify-center py-10"><div className="w-6 h-6 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" /><p className="ml-2 text-zinc-400 text-sm">Đang tải...</p></div>
            ) : salaryInRangeGrouped.length === 0 ? (
              <div className="p-10 text-center text-zinc-500"><Users className="w-8 h-8 mx-auto stroke-1 mb-2 text-zinc-600" /><p className="text-sm font-semibold">Không có lương phát sinh trong kỳ</p></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-zinc-800 border-b border-zinc-700 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Họ tên</th>
                      <th className="px-4 py-3 text-center">Đợt</th>
                      <th className="px-4 py-3 text-center">Ngày công</th>
                      <th className="px-4 py-3 text-right">Tổng phát sinh</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-700">
                    {salaryInRangeGrouped.map(g => (
                      <tr key={g.fullName} className="hover:bg-amber-950/20 transition">
                        <td className="px-4 py-3 font-semibold text-zinc-100">{g.fullName}</td>
                        <td className="px-4 py-3 text-center">
                          {g.lumpCount > 0
                            ? <span className="px-2 py-0.5 bg-blue-900/30 text-blue-300 rounded-md text-xs font-bold">{g.lumpCount} đợt</span>
                            : <span className="text-zinc-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {g.totalDays > 0
                            ? <span className="px-2 py-0.5 bg-purple-900/30 text-purple-300 rounded-md text-xs font-bold">{g.totalDays} ngày</span>
                            : <span className="text-zinc-600">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right font-bold font-mono text-amber-700">{formatVND(g.totalAmount)}</td>
                      </tr>
                    ))}
                    <tr className="bg-amber-950/30 border-t-2 border-amber-800/50">
                      <td className="px-4 py-3 font-extrabold text-zinc-100" colSpan={3}>Tổng cộng</td>
                      <td className="px-4 py-3 text-right font-extrabold font-mono text-amber-800">{formatVND(totalSalary)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Salary Management */}
          {salaryLoading ? null : (
            <div className="bg-zinc-800/50 rounded-xl border border-zinc-700 shadow-sm">
              <div className="p-5 border-b border-zinc-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <h3 className="font-bold text-zinc-100 text-sm flex items-center gap-2"><Users className="w-4 h-4 text-blue-600" /> Quản lý bảng lương</h3>
                <div className="flex gap-2 flex-wrap">
                  <input ref={xlsxInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImportExcel} />
                  <button onClick={() => xlsxInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 text-zinc-300 hover:bg-zinc-800/40 rounded-lg text-xs font-bold cursor-pointer transition">
                    <Upload className="w-3.5 h-3.5" /> Nhập Excel
                  </button>
                  <button onClick={exportSalaryExcel}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-700 text-zinc-300 hover:bg-zinc-800/40 rounded-lg text-xs font-bold cursor-pointer transition">
                    <Download className="w-3.5 h-3.5" /> Xuất Excel
                  </button>
                  <button onClick={openAddSalary}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold cursor-pointer transition shadow-sm">
                    <Plus className="w-3.5 h-3.5" /> Thêm
                  </button>
                </div>
              </div>
              <div className="p-4 border-b border-zinc-700/50">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
                  <input value={salarySearch} onChange={e => setSalarySearch(e.target.value)} placeholder="Tìm nhân viên..."
                    className="w-full pl-9 pr-3 py-2 border border-zinc-700 rounded-lg text-sm focus:outline-none bg-zinc-800 text-zinc-100 focus:border-blue-500" />
                </div>
              </div>
              {filteredSalary.length === 0 ? (
                <div className="p-12 text-center text-zinc-500"><Users className="w-10 h-10 mx-auto stroke-1 mb-2 text-zinc-600" /><p className="text-sm font-semibold">Chưa có bảng lương</p></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-800 border-b border-zinc-700 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Họ tên</th>
                        <th className="px-4 py-3">SĐT</th>
                        <th className="px-4 py-3 text-right">Lương</th>
                        <th className="px-4 py-3">Cách tính</th>
                        <th className="px-4 py-3">Từ ngày</th>
                        <th className="px-4 py-3">Đến ngày</th>
                        <th className="px-4 py-3 text-right">Đã trả</th>
                        <th className="px-4 py-3 text-right">Còn lại</th>
                        <th className="px-4 py-3 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-700">
                      {filteredSalary.map(e => {
                        const paid = e.paidAmount ?? 0;
                        const total = getTotalSalary(e);
                        const remaining = total - paid;
                        return (
                          <tr key={e.id} className="hover:bg-zinc-800/20 transition">
                            <td className="px-4 py-3">
                              <p className="font-semibold text-zinc-100">{e.fullName}</p>
                              {e.bankAccount && <p className="text-[10px] text-zinc-500 font-mono">{SAL_BANKS.find(b => b.id === e.bankName)?.name ?? e.bankName} · {e.bankAccount}</p>}
                            </td>
                            <td className="px-4 py-3 font-mono text-xs text-zinc-400">{e.phone || '—'}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-zinc-100">
                              <p>{formatVND(total)}</p>
                              {e.calcType === 'daily' && <p className="text-[10px] text-zinc-500">{formatVND(e.amount)}/ngày</p>}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${e.calcType === 'lump' ? 'bg-blue-900/30 text-blue-300' : 'bg-purple-900/30 text-purple-300'}`}>
                                {e.calcType === 'lump' ? 'Đợt' : 'Ngày'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-xs text-zinc-400 font-mono">{e.dateFrom}</td>
                            <td className="px-4 py-3 text-xs text-zinc-400 font-mono">{e.dateTo}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs text-emerald-600 font-bold">{paid > 0 ? formatVND(paid) : '—'}</td>
                            <td className="px-4 py-3 text-right font-mono text-xs font-bold">
                              {remaining > 0 ? <span className="text-rose-600">{formatVND(remaining)}</span> : <span className="text-emerald-600">Đủ</span>}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                {remaining > 0 && (
                                  <button onClick={() => openPaySalary(e)} className="px-2 py-1 bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/60 rounded-lg text-[11px] font-bold cursor-pointer transition whitespace-nowrap">Trả lương</button>
                                )}
                                <button onClick={() => openEditSalary(e)} className="p-1.5 text-zinc-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition cursor-pointer"><Pencil className="w-4 h-4" /></button>
                                <button onClick={() => setDeleteSalaryConfirm(e.id)} className="p-1.5 text-zinc-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
          {/* Payment log history for salary */}
          {paymentLogs.filter(l => l.type === 'salary').length > 0 && (
            <div className="bg-zinc-800/50 rounded-xl border border-zinc-700 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-zinc-700">
                <h3 className="font-bold text-zinc-100 text-sm flex items-center gap-2"><History className="w-4 h-4 text-blue-600" /> Lịch sử trả lương</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-zinc-800 border-b border-zinc-700 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Thời gian</th>
                      <th className="px-4 py-3">Nhân viên</th>
                      <th className="px-4 py-3">Hình thức</th>
                      <th className="px-4 py-3 text-right">Số tiền</th>
                      <th className="px-4 py-3 text-right">Còn lại</th>
                      <th className="px-4 py-3">Ghi chú</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-700">
                    {paymentLogs.filter(l => l.type === 'salary').map(log => (
                      <tr key={log.id} className="hover:bg-zinc-800/20 transition">
                        <td className="px-4 py-3 text-xs text-zinc-400 font-mono whitespace-nowrap">{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                        <td className="px-4 py-3 font-semibold text-zinc-100">{log.referenceName}</td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${log.paymentMethod === 'bank' ? 'bg-blue-900/30 text-blue-300' : 'bg-amber-900/30 text-amber-300'}`}>
                            {log.paymentMethod === 'bank' ? <><Building2 className="w-3 h-3" /> CK</> : <><Banknote className="w-3 h-3" /> Tiền mặt</>}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold text-emerald-700">{formatVND(log.amount)}</td>
                        <td className="px-4 py-3 text-right font-mono text-xs font-bold">
                          {log.remaining > 0 ? <span className="text-rose-600">{formatVND(log.remaining)}</span> : <span className="text-emerald-600">Đủ</span>}
                        </td>
                        <td className="px-4 py-3 text-xs text-zinc-500">{log.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {salaryError && <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-sm flex items-center gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{salaryError}</div>}
        </div>
      )}

      {/* ── PROFIT TAB ───────────────────────────────────── */}
      {reportType === 'profit' && (
        <div className="space-y-6">
          {/* Profit chart with month/year toggle */}
          <div className="bg-zinc-800/50 rounded-xl border border-zinc-700 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-zinc-700">
              <h3 className="font-bold text-zinc-100 text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-emerald-400" /> Biểu đồ lợi nhuận</h3>
              <div className="flex items-center gap-2">
                {profitChartView === 'month' && (
                  <select value={profitChartYear} onChange={e => setProfitChartYear(Number(e.target.value))}
                    className="bg-zinc-800 border border-zinc-700 text-zinc-300 text-xs rounded-lg px-2 py-1.5 focus:outline-none cursor-pointer">
                    {(availableYears.length > 0 ? availableYears : [new Date().getFullYear()]).map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                )}
                <div className="flex bg-zinc-900 border border-zinc-700 rounded-lg p-0.5">
                  {(['month', 'year'] as const).map(v => (
                    <button key={v} onClick={() => setProfitChartView(v)}
                      className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${profitChartView === v ? 'bg-emerald-700 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}>
                      {v === 'month' ? 'Theo tháng' : 'Theo năm'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            {(() => {
              const cData = profitChartView === 'month' ? monthlyChartData : yearlyChartData;
              if (cData.length === 0) return <div className="py-12 text-center text-zinc-500 text-sm">Không có dữ liệu</div>;
              const maxVal = Math.max(...cData.map(d => Math.max(d.revenue, 1)));
              const svgW = 560; const svgH = 180; const pT = 16; const pB = 28; const pL = 50; const pR = 16;
              const barW = Math.max(8, Math.floor((svgW - pL - pR) / cData.length) - 4);
              const barStep = (svgW - pL - pR) / cData.length;
              return (
                <div className="p-4">
                  <svg viewBox={`0 0 ${svgW} ${svgH}`} className="w-full h-44 overflow-visible">
                    {[0, 0.25, 0.5, 0.75, 1].map(r => {
                      const y = svgH - pB - r * (svgH - pT - pB);
                      return <g key={r}><line x1={pL} y1={y} x2={svgW - pR} y2={y} stroke="#3f3f46" strokeWidth="1" strokeDasharray="4,3" /><text x={pL - 6} y={y + 4} fill="#71717a" fontSize="8" fontFamily="monospace" textAnchor="end">{Math.round(r * maxVal / 1000)}k</text></g>;
                    })}
                    {cData.map((d, i) => {
                      const x = pL + i * barStep + barStep / 2;
                      const rH = Math.max(2, (d.revenue / maxVal) * (svgH - pT - pB));
                      const pH = d.profit >= 0 ? Math.max(1, (d.profit / maxVal) * (svgH - pT - pB)) : 0;
                      return (
                        <g key={d.label}>
                          <rect x={x - barW / 2} y={svgH - pB - rH} width={barW} height={rH} fill="#3b82f6" opacity="0.7" rx="2" />
                          <rect x={x - barW / 2 + 2} y={svgH - pB - pH} width={Math.max(barW - 4, 2)} height={pH} fill="#10b981" opacity="0.9" rx="2" />
                          <text x={x} y={svgH - pB + 12} fill="#a1a1aa" fontSize="9" textAnchor="middle">{d.label}</text>
                        </g>
                      );
                    })}
                  </svg>
                  <div className="flex items-center gap-4 text-[10px] text-zinc-500 mt-1 justify-center">
                    <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-500 rounded inline-block opacity-70"></span> Doanh thu</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-2 bg-emerald-500 rounded inline-block"></span> Lợi nhuận</span>
                  </div>
                </div>
              );
            })()}
          </div>

          {/* P&L Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { label: 'DOANH THU', value: stats.revenue, color: 'text-blue-400', bg: 'bg-blue-900/30', icon: <CircleDollarSign className="w-5 h-5" />, sub: `${stats.transactions} đơn` },
              { label: 'GIÁ VỐN NHẬP HÀNG', value: stats.cost, color: 'text-zinc-300', bg: 'bg-zinc-700', icon: <ArrowDownToLine className="w-5 h-5" />, sub: 'Chi phí nhập hàng' },
              { label: 'LỢI NHUẬN GỘP', value: stats.profit, color: stats.profit >= 0 ? 'text-emerald-400' : 'text-rose-400', bg: stats.profit >= 0 ? 'bg-emerald-900/30' : 'bg-rose-900/30', icon: <TrendingUp className="w-5 h-5" />, sub: 'Doanh thu − Giá vốn' },
              { label: 'TỔNG LƯƠNG', value: totalSalary, color: 'text-amber-400', bg: 'bg-amber-900/30', icon: <Users className="w-5 h-5" />, sub: 'Trong kỳ' },
              { label: 'CHI PHÍ PHÁT SINH', value: totalExpenses, color: 'text-rose-400', bg: 'bg-rose-900/30', icon: <Receipt className="w-5 h-5" />, sub: `${expenses.filter(e => e.expenseType !== 'tax').length} khoản` },
              { label: 'THUẾ', value: totalTax, color: 'text-orange-400', bg: 'bg-orange-900/30', icon: <Tag className="w-5 h-5" />, sub: `${expenses.filter(e => e.expenseType === 'tax').length} phiếu TAX` },
            ].map(card => (
              <div key={card.label} className="bg-zinc-800/50 p-4 rounded-xl border border-zinc-700 shadow-xs flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">{card.label}</p>
                  <p className={`text-base font-extrabold font-mono mt-1 ${card.color}`}>{formatVND(card.value)}</p>
                  <p className="text-[10px] text-zinc-500 mt-0.5">{card.sub}</p>
                </div>
                <div className={`p-2.5 ${card.bg} ${card.color} rounded-xl`}>{card.icon}</div>
              </div>
            ))}
          </div>

          {/* Formula */}
          <div className="bg-zinc-800 border border-zinc-700 rounded-xl p-4 text-sm font-mono text-center space-y-1">
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              <span className="text-blue-400">{formatVND(stats.revenue)}</span>
              <span className="text-zinc-500"> − </span>
              <span className="text-zinc-400">{formatVND(stats.cost)}</span>
              <span className="text-zinc-500"> − </span>
              <span className="text-amber-400">{formatVND(totalSalary)}</span>
              <span className="text-zinc-500"> − </span>
              <span className="text-rose-400">{formatVND(totalExpenses)}</span>
              <span className="text-zinc-500"> − </span>
              <span className="text-orange-400">{formatVND(totalTax)}</span>
              <span className="text-zinc-500"> = </span>
              <span className={`font-extrabold text-base ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatVND(netProfit)}</span>
            </div>
            <p className="text-[10px] text-zinc-500">Doanh thu − Vốn nhập − Lương − Chi phí phát sinh − Thuế = Lợi nhuận ròng: <span className={`font-bold ${netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{formatVND(netProfit)}</span></p>
          </div>

          <div className="bg-zinc-800/50 rounded-xl border border-zinc-700 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-zinc-700 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-zinc-100 text-sm flex items-center gap-2"><Receipt className="w-4 h-4 text-rose-400" /> Chi phí & Thuế</h3>
                <p className="text-xs text-zinc-500 mt-0.5">Các khoản chi phí phát sinh (CP) và thuế (TAX).</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openAddExpense('expense')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-xs font-bold cursor-pointer transition">
                  <Plus className="w-3.5 h-3.5" /> Chi phí
                </button>
                <button onClick={() => openAddExpense('tax')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-700 hover:bg-orange-600 text-white rounded-lg text-xs font-bold cursor-pointer transition">
                  <Plus className="w-3.5 h-3.5" /> Thuế
                </button>
              </div>
            </div>
            {expensesLoading ? (
              <div className="flex items-center justify-center py-10"><div className="w-6 h-6 border-4 border-rose-600 border-t-transparent rounded-full animate-spin" /></div>
            ) : expenses.length === 0 ? (
              <div className="p-10 text-center text-zinc-500">
                <Receipt className="w-8 h-8 mx-auto stroke-1 mb-2 text-zinc-600" />
                <p className="text-sm font-semibold">Chưa có chi phí phát sinh</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-zinc-800 border-b border-zinc-700 text-xs font-bold text-zinc-400 uppercase tracking-wider">
                    <tr>
                      <th className="px-4 py-3 w-8"></th>
                      <th className="px-4 py-3">Mã phiếu</th>
                      <th className="px-4 py-3">Loại</th>
                      <th className="px-4 py-3">Nội dung</th>
                      <th className="px-4 py-3">Ngày</th>
                      <th className="px-4 py-3 text-right">Số tiền</th>
                      <th className="px-4 py-3 w-20"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-700">
                    {expenses.map((e) => {
                      const isOpen = expandedExpenseId === e.id;
                      const isTax = e.expenseType === 'tax';
                      return (
                        <React.Fragment key={e.id}>
                          <tr className={`hover:bg-zinc-800/20 transition cursor-pointer ${isOpen ? 'bg-zinc-800/30' : ''}`}
                            onClick={() => setExpandedExpenseId(isOpen ? null : e.id)}>
                            <td className="px-4 py-3 text-zinc-500">{isOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</td>
                            <td className="px-4 py-3 font-mono text-xs font-bold text-zinc-300">{e.code ?? '—'}</td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${isTax ? 'bg-orange-900/40 text-orange-300' : 'bg-rose-900/40 text-rose-300'}`}>
                                {isTax ? 'Thuế' : 'Chi phí'}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-semibold text-zinc-100">{e.content}</td>
                            <td className="px-4 py-3 text-xs text-zinc-400 font-mono">{e.date}</td>
                            <td className={`px-4 py-3 text-right font-mono font-bold ${isTax ? 'text-orange-400' : 'text-rose-400'}`}>{formatVND(e.amount)}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1" onClick={ev => ev.stopPropagation()}>
                                <button onClick={() => openEditExpense(e)} className="p-1.5 text-zinc-500 hover:text-blue-400 rounded-lg transition cursor-pointer"><Pencil className="w-3.5 h-3.5" /></button>
                                <button onClick={() => setDeleteExpenseConfirm(e.id)} className="p-1.5 text-zinc-500 hover:text-rose-400 rounded-lg transition cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></button>
                              </div>
                            </td>
                          </tr>
                          {isOpen && (
                            <tr className="bg-zinc-800/50">
                              <td colSpan={7} className="px-8 py-3 text-xs text-zinc-400 space-y-1">
                                <div className="flex gap-6 flex-wrap">
                                  <span><span className="text-zinc-500">Mã phiếu:</span> <span className="font-mono font-bold text-zinc-300">{e.code ?? 'Chưa có mã'}</span></span>
                                  <span><span className="text-zinc-500">Loại:</span> <span className={`font-bold ${isTax ? 'text-orange-300' : 'text-rose-300'}`}>{isTax ? 'Thuế (TAX)' : 'Chi phí phát sinh (CP)'}</span></span>
                                  <span><span className="text-zinc-500">Ngày:</span> <span className="font-mono">{e.date}</span></span>
                                  <span><span className="text-zinc-500">Số tiền:</span> <span className={`font-mono font-bold ${isTax ? 'text-orange-400' : 'text-rose-400'}`}>{formatVND(e.amount)}</span></span>
                                  {e.notes && <span><span className="text-zinc-500">Ghi chú:</span> {e.notes}</span>}
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    <tr className="bg-rose-950/20 border-t-2 border-rose-800/50">
                      <td colSpan={5} className="px-4 py-3 font-extrabold text-zinc-100">Tổng chi phí phát sinh</td>
                      <td className="px-4 py-3 text-right font-extrabold font-mono text-rose-400">{formatVND(totalExpenses)}</td>
                      <td></td>
                    </tr>
                    <tr className="bg-orange-950/20 border-t border-orange-800/30">
                      <td colSpan={5} className="px-4 py-3 font-extrabold text-zinc-100">Tổng thuế</td>
                      <td className="px-4 py-3 text-right font-extrabold font-mono text-orange-400">{formatVND(totalTax)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Debt Payment History Modal */}
      <AnimatePresence>
        {showDebtPaidHistory && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-zinc-700">
                <h3 className="font-bold text-zinc-100 flex items-center gap-2"><History className="w-5 h-5 text-emerald-400" /> Lịch sử thanh toán công nợ</h3>
                <div className="flex items-center gap-2">
                  <button onClick={downloadDebtPaymentTemplate} className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-600 text-zinc-300 hover:bg-zinc-700 rounded-lg text-xs font-bold cursor-pointer transition">
                    <Download className="w-3.5 h-3.5" /> File mẫu
                  </button>
                  <button onClick={exportDebtPaymentHistory} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold cursor-pointer transition">
                    <Download className="w-3.5 h-3.5" /> Xuất Excel
                  </button>
                  <button onClick={() => setShowDebtPaidHistory(false)} className="text-zinc-400 hover:text-zinc-200 cursor-pointer ml-1"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="overflow-auto flex-1">
                {paymentLogs.filter(l => l.type === 'debt').length === 0 ? (
                  <div className="p-12 text-center text-zinc-500"><History className="w-10 h-10 mx-auto mb-2 stroke-1" /><p className="text-sm">Chưa có lịch sử thanh toán công nợ</p></div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-800 border-b border-zinc-700 text-xs font-bold text-zinc-400 uppercase tracking-wider sticky top-0">
                      <tr>
                        <th className="px-4 py-3">STT</th>
                        <th className="px-4 py-3">Thời gian thanh toán</th>
                        <th className="px-4 py-3">Đối tác</th>
                        <th className="px-4 py-3">Phiếu nhập hàng</th>
                        <th className="px-4 py-3">Hình thức</th>
                        <th className="px-4 py-3 text-right">Số tiền</th>
                        <th className="px-4 py-3 text-right">Còn nợ</th>
                        <th className="px-4 py-3">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-700">
                      {paymentLogs.filter(l => l.type === 'debt').map((log, i) => (
                        <tr key={log.id} className="hover:bg-zinc-800/40 transition">
                          <td className="px-4 py-3 text-zinc-500 text-xs">{i + 1}</td>
                          <td className="px-4 py-3 text-xs text-zinc-400 font-mono whitespace-nowrap">{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                          <td className="px-4 py-3 font-semibold text-zinc-200">{log.referenceName}</td>
                          <td className="px-4 py-3 font-mono text-xs text-zinc-400">{log.referenceId}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${log.paymentMethod === 'bank' ? 'bg-blue-900/30 text-blue-300' : 'bg-amber-900/30 text-amber-300'}`}>
                              {log.paymentMethod === 'bank' ? <><Building2 className="w-3 h-3" /> CK</> : <><Banknote className="w-3 h-3" /> Tiền mặt</>}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">{formatVND(log.amount)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs font-bold">
                            {log.remaining > 0 ? <span className="text-rose-400">{formatVND(log.remaining)}</span> : <span className="text-emerald-400">Đủ</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-500">{log.notes ?? ''}</td>
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

      {/* Salary Payment History Modal */}
      <AnimatePresence>
        {showSalaryPaidHistory && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-zinc-700">
                <h3 className="font-bold text-zinc-100 flex items-center gap-2"><History className="w-5 h-5 text-blue-400" /> Lịch sử trả lương</h3>
                <div className="flex items-center gap-2">
                  <button onClick={downloadSalaryPaymentTemplate} className="flex items-center gap-1.5 px-3 py-1.5 border border-zinc-600 text-zinc-300 hover:bg-zinc-700 rounded-lg text-xs font-bold cursor-pointer transition">
                    <Download className="w-3.5 h-3.5" /> File mẫu
                  </button>
                  <button onClick={exportSalaryPaymentHistory} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold cursor-pointer transition">
                    <Download className="w-3.5 h-3.5" /> Xuất Excel
                  </button>
                  <button onClick={() => setShowSalaryPaidHistory(false)} className="text-zinc-400 hover:text-zinc-200 cursor-pointer ml-1"><X className="w-5 h-5" /></button>
                </div>
              </div>
              <div className="overflow-auto flex-1">
                {paymentLogs.filter(l => l.type === 'salary').length === 0 ? (
                  <div className="p-12 text-center text-zinc-500"><History className="w-10 h-10 mx-auto mb-2 stroke-1" /><p className="text-sm">Chưa có lịch sử trả lương</p></div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-800 border-b border-zinc-700 text-xs font-bold text-zinc-400 uppercase tracking-wider sticky top-0">
                      <tr>
                        <th className="px-4 py-3">STT</th>
                        <th className="px-4 py-3">Thời gian thanh toán</th>
                        <th className="px-4 py-3">Họ và tên</th>
                        <th className="px-4 py-3">Thời gian làm việc</th>
                        <th className="px-4 py-3">Hình thức</th>
                        <th className="px-4 py-3 text-right">Số tiền</th>
                        <th className="px-4 py-3 text-right">Còn lại</th>
                        <th className="px-4 py-3">Ghi chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-700">
                      {paymentLogs.filter(l => l.type === 'salary').map((log, i) => (
                        <tr key={log.id} className="hover:bg-zinc-800/40 transition">
                          <td className="px-4 py-3 text-zinc-500 text-xs">{i + 1}</td>
                          <td className="px-4 py-3 text-xs text-zinc-400 font-mono whitespace-nowrap">{new Date(log.createdAt).toLocaleString('vi-VN')}</td>
                          <td className="px-4 py-3 font-semibold text-zinc-200">{log.referenceName}</td>
                          <td className="px-4 py-3 text-xs text-zinc-400">{log.notes ?? ''}</td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold ${log.paymentMethod === 'bank' ? 'bg-blue-900/30 text-blue-300' : 'bg-amber-900/30 text-amber-300'}`}>
                              {log.paymentMethod === 'bank' ? <><Building2 className="w-3 h-3" /> CK</> : <><Banknote className="w-3 h-3" /> Tiền mặt</>}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-emerald-400">{formatVND(log.amount)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs font-bold">
                            {log.remaining > 0 ? <span className="text-rose-400">{formatVND(log.remaining)}</span> : <span className="text-emerald-400">Đủ</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-500">{''}</td>
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

      {/* Pay Modal (Debt tab) */}
      <AnimatePresence>
        {payingOrder && (() => {
          const partner = partners.find(p => p.id === payingOrder.partnerId);
          const remaining = payingOrder.totalAmount - payingOrder.paidAmount;
          const payAmt = payFull ? remaining : Math.min(Number(payAmount) || 0, remaining);
          const hasBank = !payDebtCash && partner?.bankName && partner?.bankAccount;
          return (
            <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
                className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-3xl">
                {payDebtConfirmed ? (
                  <div className="p-8 text-center">
                    <div className="w-16 h-16 bg-emerald-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
                      <Receipt className="w-9 h-9 text-emerald-400" />
                    </div>
                    <h3 className="font-bold text-emerald-400 text-lg mb-1">Xác nhận thanh toán công nợ</h3>
                    <p className="text-sm text-zinc-400 mb-2">{payingOrder.partnerName} — <span className="font-mono font-bold text-zinc-200">{formatVND(payAmt)}</span></p>
                    <p className="text-xs text-zinc-500 mb-6">Hình thức: {payDebtCash ? 'Tiền mặt' : 'Chuyển khoản'}</p>
                    <div className="flex gap-3">
                      <button onClick={() => setPayDebtConfirmed(false)} className="flex-1 px-4 py-2 border border-zinc-600 text-zinc-300 rounded-lg text-sm font-bold cursor-pointer">Quay lại</button>
                      <button onClick={confirmPay} disabled={paying} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:!opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
                        {paying ? 'Đang lưu...' : 'Xác nhận & Lưu'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between p-5 border-b border-zinc-700">
                      <div>
                        <h3 className="font-bold text-zinc-100">Thanh toán công nợ</h3>
                        <p className="text-xs text-zinc-400 font-mono mt-0.5">{payingOrder.id} · {payingOrder.partnerName}</p>
                      </div>
                      <button onClick={() => setPayingOrder(null)} className="text-zinc-400 hover:text-zinc-200 cursor-pointer"><X className="w-5 h-5" /></button>
                    </div>
                    <div className="p-5 space-y-4">
                      <div className="bg-zinc-800 rounded-xl p-4 space-y-2 text-sm">
                        <div className="flex justify-between"><span className="text-zinc-400">Tổng phiếu:</span><span className="font-mono font-bold text-zinc-100">{formatVND(payingOrder.totalAmount)}</span></div>
                        <div className="flex justify-between"><span className="text-zinc-400">Đã trả:</span><span className="font-mono text-emerald-400">{formatVND(payingOrder.paidAmount)}</span></div>
                        <div className="flex justify-between border-t border-zinc-700 pt-2"><span className="text-zinc-300 font-bold">Còn nợ:</span><span className="font-mono font-bold text-rose-400 text-base">{formatVND(remaining)}</span></div>
                      </div>
                      <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={payFull} onChange={e => { setPayFull(e.target.checked); if (e.target.checked) setPayAmount(String(remaining)); }} className="w-4 h-4 accent-emerald-500" />
                          <span className="text-sm font-medium text-zinc-300">Thanh toán toàn bộ còn lại</span>
                        </label>
                        {!payFull && (
                          <div>
                            <label className="text-xs font-bold text-zinc-400 mb-1 block">Số tiền thanh toán</label>
                            <input type="number" min={0} max={remaining} value={payAmount} onChange={e => setPayAmount(e.target.value)}
                              className="w-full px-3 py-2.5 border border-zinc-700 rounded-lg text-sm font-mono focus:outline-none bg-zinc-800 text-zinc-100 focus:border-emerald-500" />
                          </div>
                        )}
                        {payAmt > 0 && <p className="text-xs text-zinc-500">Còn lại sau thanh toán: <span className={`font-mono font-bold ${remaining - payAmt > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>{formatVND(Math.max(0, remaining - payAmt))}</span></p>}
                      </div>
                      <div>
                        <p className="text-xs font-bold text-zinc-400 uppercase mb-2">Hình thức thanh toán</p>
                        <div className="grid grid-cols-2 gap-2">
                          <button type="button" onClick={() => setPayDebtCash(true)}
                            className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-bold cursor-pointer transition ${payDebtCash ? 'border-amber-500 bg-amber-900/30 text-amber-300' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                            <Banknote className="w-4 h-4" /> Tiền mặt
                          </button>
                          <button type="button" onClick={() => setPayDebtCash(false)}
                            className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-bold cursor-pointer transition ${!payDebtCash ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                            <Building2 className="w-4 h-4" /> Chuyển khoản
                          </button>
                        </div>
                      </div>
                      {hasBank && payAmt > 0 && (
                        <div className="bg-zinc-800 rounded-xl border border-zinc-700 p-4 text-center">
                          <p className="text-[10px] font-bold text-zinc-500 uppercase mb-3">QR CHUYỂN KHOẢN CÔNG NỢ</p>
                          <img
                            src={buildSalaryQR(partner!.bankName!, partner!.bankAccount!, payAmt, partner!.bankAccountName ?? partner!.fullName, `Tra no ${payingOrder.id}`)}
                            alt="QR chuyển khoản"
                            className="w-44 h-44 mx-auto rounded-xl object-contain"
                          />
                          <p className="text-sm font-mono font-bold text-zinc-200 mt-2">{partner!.bankAccount}</p>
                          <p className="text-xs text-zinc-400">{SAL_BANKS.find(b => b.id === partner!.bankName)?.name ?? partner!.bankName} · {partner!.bankAccountName ?? partner!.fullName}</p>
                          <p className="text-xs text-emerald-400 font-mono font-bold mt-1">{formatVND(payAmt)}</p>
                        </div>
                      )}
                      {!payDebtCash && partner && !partner.bankAccount && (
                        <p className="text-xs text-zinc-500 italic text-center">Đối tác chưa có thông tin tài khoản ngân hàng</p>
                      )}
                    </div>
                    <div className="flex gap-3 p-5 border-t border-zinc-700">
                      <button onClick={() => setPayingOrder(null)} className="flex-1 px-4 py-2 border border-zinc-600 text-zinc-300 rounded-lg text-sm font-bold cursor-pointer">Hủy</button>
                      {payDebtCash ? (
                        <button onClick={confirmPay} disabled={paying || payAmt <= 0} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:!opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
                          {paying ? 'Đang lưu...' : 'Xác nhận tiền mặt'}
                        </button>
                      ) : (
                        <button onClick={() => setPayDebtConfirmed(true)} disabled={payAmt <= 0} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:!opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
                          Đã chuyển khoản
                        </button>
                      )}
                    </div>
                  </>
                )}
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>

      {/* Salary Form Modal */}
      <AnimatePresence>
        {showSalaryForm && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-3xl">
              <div className="flex items-center justify-between p-5 border-b border-zinc-700">
                <h3 className="font-bold text-zinc-100">{editingSalaryId ? 'Sửa lương' : 'Thêm lương'}</h3>
                <button onClick={() => setShowSalaryForm(false)} className="text-zinc-500 hover:text-slate-700 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-300 mb-1 block">Họ tên <span className="text-rose-500">*</span></label>
                    <input value={salaryForm.fullName} onChange={e => setSalaryForm(f => ({ ...f, fullName: e.target.value }))}
                      className="w-full px-3 py-2 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-blue-500" placeholder="Nguyễn Văn A" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-300 mb-1 block">Điện thoại</label>
                    <input value={salaryForm.phone} onChange={e => setSalaryForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full px-3 py-2 border border-zinc-700 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500" placeholder="0912..." />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-300 mb-1 block">{salaryForm.calcType === 'lump' ? 'Tổng tiền đợt (VNĐ)' : 'Đơn giá / ngày (VNĐ)'} <span className="text-rose-500">*</span></label>
                    <input type="number" min={0} value={salaryForm.amount} onChange={e => setSalaryForm(f => ({ ...f, amount: e.target.value }))}
                      className="w-full px-3 py-2 border border-zinc-700 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500" placeholder="5000000" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-300 mb-1 block">Cách tính</label>
                    <div className="flex gap-2">
                      {(['lump', 'daily'] as const).map(t => (
                        <button key={t} type="button" onClick={() => setSalaryForm(f => ({ ...f, calcType: t }))}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold border-2 transition cursor-pointer ${salaryForm.calcType === t ? 'border-blue-600 bg-blue-900/30 text-blue-300' : 'border-zinc-700 text-zinc-400'}`}>
                          {t === 'lump' ? 'Đợt' : 'Ngày'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-300 mb-1 block">Từ ngày <span className="text-rose-500">*</span></label>
                    <input type="date" value={salaryForm.dateFrom} onChange={e => setSalaryForm(f => ({ ...f, dateFrom: e.target.value }))}
                      className="w-full px-3 py-2 border border-zinc-700 rounded-lg text-sm focus:outline-none bg-zinc-800 text-zinc-100 focus:border-blue-500" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-300 mb-1 block">Đến ngày <span className="text-rose-500">*</span></label>
                    <input type="date" value={salaryForm.dateTo} onChange={e => setSalaryForm(f => ({ ...f, dateTo: e.target.value }))}
                      className="w-full px-3 py-2 border border-zinc-700 rounded-lg text-sm focus:outline-none bg-zinc-800 text-zinc-100 focus:border-blue-500" />
                  </div>
                </div>
                <div className="border border-emerald-200 rounded-xl p-3 space-y-2 bg-emerald-900/20">
                  <p className="text-xs font-bold text-emerald-800">Tài khoản ngân hàng (để trả lương)</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 mb-1 block">Ngân hàng</label>
                      <select value={salaryForm.bankName} onChange={e => setSalaryForm(f => ({ ...f, bankName: e.target.value }))}
                        className="w-full px-2 py-2 border border-zinc-700 rounded-lg text-xs bg-zinc-800 focus:outline-none focus:border-emerald-500 cursor-pointer">
                        <option value="">— Chọn —</option>
                        {SAL_BANKS.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-zinc-400 mb-1 block">Số tài khoản</label>
                      <input value={salaryForm.bankAccount} onChange={e => setSalaryForm(f => ({ ...f, bankAccount: e.target.value }))}
                        className="w-full px-2 py-2 border border-zinc-700 rounded-lg text-xs font-mono focus:outline-none focus:border-emerald-500" placeholder="0123456789" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-400 mb-1 block">Tên chủ tài khoản</label>
                    <input value={salaryForm.bankAccountName} onChange={e => setSalaryForm(f => ({ ...f, bankAccountName: e.target.value }))}
                      className="w-full px-2 py-2 border border-zinc-700 rounded-lg text-xs focus:outline-none focus:border-emerald-500" placeholder="NGUYEN VAN A" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-300 mb-1 block">Ghi chú</label>
                  <input value={salaryForm.notes} onChange={e => setSalaryForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-blue-500" placeholder="Tháng 6, thưởng, ..." />
                </div>
                <div className="bg-zinc-800 rounded-lg p-3 text-xs text-zinc-400">
                  {salaryForm.calcType === 'lump'
                    ? <p>💡 <strong>Đợt:</strong> Trả nguyên số tiền ({formatVND(Number(salaryForm.amount) || 0)}) bất kể số ngày.</p>
                    : <p>💡 <strong>Ngày:</strong> {formatVND(Number(salaryForm.amount) || 0)} × số ngày giao thoa với kỳ báo cáo.</p>}
                </div>
              </div>
              {salarySaveError && (
                <div className="mx-5 mb-3 px-3 py-2 bg-rose-900/20 border border-rose-700/50 rounded-lg text-xs text-rose-300 font-medium">{salarySaveError}</div>
              )}
              <div className="flex gap-3 p-5 border-t border-zinc-700">
                <button onClick={() => { setShowSalaryForm(false); setSalarySaveError(''); }} className="flex-1 px-4 py-2 border border-zinc-600 text-zinc-300 hover:bg-zinc-700 rounded-lg text-sm font-bold cursor-pointer">Hủy</button>
                <button onClick={handleSaveSalary} disabled={salarySaving}
                  className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
                  {salarySaving ? 'Đang lưu...' : 'Lưu'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Salary Payment Modal */}
      <AnimatePresence>
        {payingSalary && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-2xl p-6">
              {salaryPayConfirmed ? (
                <div className="text-center py-4">
                  <div className="w-16 h-16 bg-emerald-900/40 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Receipt className="w-9 h-9 text-emerald-600" />
                  </div>
                  <h3 className="font-bold text-emerald-700 text-lg mb-1">Đã xác nhận trả lương</h3>
                  <p className="text-sm text-zinc-400 mb-5">Ghi nhận thành công.</p>
                  <button onClick={confirmSalaryPay} disabled={salaryPaySaving}
                    className="w-full px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
                    {salaryPaySaving ? 'Đang lưu...' : 'Xác nhận & Đóng'}
                  </button>
                </div>
              ) : (
                <>
                  <h3 className="font-bold text-zinc-100 mb-1">Trả lương — {payingSalary.fullName}</h3>
                  <p className="text-xs text-zinc-400 font-mono mb-4">{payingSalary.dateFrom} → {payingSalary.dateTo}</p>
                  <div className="space-y-2 mb-4 text-sm">
                    <div className="flex justify-between"><span className="text-zinc-300">Tổng lương:</span><span className="font-mono font-bold">{formatVND(getTotalSalary(payingSalary))}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-300">Đã trả:</span><span className="font-mono text-emerald-600">{formatVND(payingSalary.paidAmount ?? 0)}</span></div>
                    <div className="flex justify-between"><span className="text-zinc-300">Còn lại:</span><span className="font-mono font-bold text-rose-600">{formatVND(getTotalSalary(payingSalary) - (payingSalary.paidAmount ?? 0))}</span></div>
                    <div className="border-t border-zinc-700 pt-3 space-y-2">
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={salaryPayFull} onChange={e => { setSalaryPayFull(e.target.checked); if (e.target.checked) setSalaryPayAmount(String(getTotalSalary(payingSalary) - (payingSalary.paidAmount ?? 0))); }} className="w-4 h-4" />
                        <span className="text-sm font-medium text-zinc-300">Trả toàn bộ còn lại</span>
                      </label>
                      {!salaryPayFull && (
                        <div>
                          <label className="text-xs font-bold text-zinc-300 mb-1 block">Số tiền</label>
                          <input type="number" min={0} value={salaryPayAmount} onChange={e => setSalaryPayAmount(e.target.value)}
                            className="w-full px-3 py-2 border border-zinc-700 rounded-lg text-sm font-mono focus:outline-none bg-zinc-800 text-zinc-100 focus:border-blue-500" />
                        </div>
                      )}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={salaryPayCash} onChange={e => setSalaryPayCash(e.target.checked)} className="w-4 h-4" />
                        <span className="text-sm text-zinc-300">Trả tiền mặt</span>
                      </label>
                    </div>
                  </div>
                  {!salaryPayCash && payingSalary.bankName && payingSalary.bankAccount && Number(salaryPayAmount) > 0 && (
                    <div className="mb-4 p-3 bg-zinc-800 rounded-xl border border-zinc-700 text-center">
                      <p className="text-[10px] font-bold text-zinc-400 uppercase mb-2">QR chuyển khoản lương</p>
                      <img src={buildSalaryQR(payingSalary.bankName, payingSalary.bankAccount, salaryPayFull ? payingSalary.amount - (payingSalary.paidAmount ?? 0) : Number(salaryPayAmount), payingSalary.bankAccountName ?? '', `Luong ${payingSalary.fullName}`)} alt="QR lương" className="w-40 h-40 mx-auto rounded-lg object-contain" />
                      <p className="text-xs text-zinc-300 font-mono font-bold mt-2">{payingSalary.bankAccount}</p>
                      <p className="text-xs text-zinc-400">{SAL_BANKS.find(b => b.id === payingSalary.bankName)?.name} · {payingSalary.bankAccountName}</p>
                    </div>
                  )}
                  {salaryPayError && (
                    <div className="mb-3 px-3 py-2 bg-rose-900/20 border border-rose-700/50 rounded-lg text-xs text-rose-300 font-medium">{salaryPayError}</div>
                  )}
                  <div className="flex gap-3">
                    <button onClick={() => { setPayingSalary(null); setSalaryPayError(''); }} className="flex-1 px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg text-sm font-bold cursor-pointer">Hủy</button>
                    {salaryPayCash ? (
                      <button onClick={confirmSalaryPay} disabled={salaryPaySaving} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
                        {salaryPaySaving ? 'Đang lưu...' : 'Xác nhận tiền mặt'}
                      </button>
                    ) : (
                      <button onClick={() => setSalaryPayConfirmed(true)} disabled={Number(salaryPayAmount) <= 0 && !salaryPayFull} className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
                        Đã chuyển khoản
                      </button>
                    )}
                  </div>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Salary Confirm */}
      <AnimatePresence>
        {deleteSalaryConfirm && (
          <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-md p-6 text-center">
              <div className="w-12 h-12 bg-rose-900/40 rounded-full flex items-center justify-center mx-auto mb-3"><Trash2 className="w-6 h-6 text-rose-600" /></div>
              <h3 className="font-bold text-zinc-100 mb-2">Xóa bản ghi lương?</h3>
              <p className="text-sm text-zinc-400 mb-5">Hành động này không thể hoàn tác.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteSalaryConfirm(null)} className="flex-1 px-4 py-2 border border-zinc-700 text-zinc-300 rounded-lg text-sm font-bold cursor-pointer">Hủy</button>
                <button onClick={() => handleDeleteSalary(deleteSalaryConfirm)} className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-bold cursor-pointer">Xóa</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showExpenseForm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-2xl">
              <div className="flex items-center justify-between p-5 border-b border-zinc-700">
                <h3 className="font-bold text-zinc-100 flex items-center gap-2">
                  {expenseForm.expenseType === 'tax' ? <Tag className="w-4 h-4 text-orange-400" /> : <Receipt className="w-4 h-4 text-rose-400" />}
                  {editingExpenseId ? 'Sửa phiếu' : expenseForm.expenseType === 'tax' ? 'Lập phiếu thuế' : 'Lập phiếu chi phí'}
                </h3>
                <button onClick={() => setShowExpenseForm(false)} className="text-zinc-500 hover:text-zinc-200 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="text-xs font-bold text-zinc-300 mb-2 block">Loại phiếu</label>
                  <div className="flex gap-2">
                    {([['expense', 'Chi phí phát sinh', 'CP'], ['tax', 'Thuế', 'TAX']] as const).map(([type, label, prefix]) => (
                      <button key={type} type="button" onClick={() => setExpenseForm(f => ({ ...f, expenseType: type }))}
                        className={`flex-1 py-2.5 rounded-lg text-xs font-bold border-2 transition cursor-pointer flex items-center justify-center gap-1.5 ${expenseForm.expenseType === type ? (type === 'tax' ? 'border-orange-500 bg-orange-900/30 text-orange-300' : 'border-rose-500 bg-rose-900/30 text-rose-300') : 'border-zinc-700 text-zinc-400 hover:border-zinc-600'}`}>
                        {type === 'tax' ? <Tag className="w-3.5 h-3.5" /> : <Receipt className="w-3.5 h-3.5" />}
                        {label} <span className="text-zinc-500">({prefix}xxxx)</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-300 mb-1 block">Nội dung <span className="text-rose-500">*</span></label>
                  <input value={expenseForm.content} onChange={e => setExpenseForm(f => ({ ...f, content: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-zinc-800 text-zinc-100" placeholder={expenseForm.expenseType === 'tax' ? 'VD: Thuế GTGT tháng 6' : 'VD: Tiền điện tháng 6'} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-zinc-300 mb-1 block">Số tiền (VNĐ) <span className="text-rose-500">*</span></label>
                    <input type="number" min={0} value={expenseForm.amount} onChange={e => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                      className="w-full px-3 py-2 border border-zinc-700 rounded-lg text-sm font-mono focus:outline-none focus:border-blue-500 bg-zinc-800 text-zinc-100" placeholder="500000" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-zinc-300 mb-1 block">Ngày <span className="text-rose-500">*</span></label>
                    <input type="date" value={expenseForm.date} onChange={e => setExpenseForm(f => ({ ...f, date: e.target.value }))}
                      className="w-full px-3 py-2 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-zinc-800 text-zinc-100" />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-300 mb-1 block">Ghi chú</label>
                  <input value={expenseForm.notes} onChange={e => setExpenseForm(f => ({ ...f, notes: e.target.value }))}
                    className="w-full px-3 py-2 border border-zinc-700 rounded-lg text-sm focus:outline-none focus:border-blue-500 bg-zinc-800 text-zinc-100" placeholder="Tuỳ chọn..." />
                </div>
                {!editingExpenseId && (
                  <div className={`rounded-lg p-3 text-xs ${expenseForm.expenseType === 'tax' ? 'bg-orange-900/20 border border-orange-800/40 text-orange-300' : 'bg-rose-900/20 border border-rose-800/40 text-rose-300'}`}>
                    Mã phiếu sẽ được tạo tự động: <span className="font-mono font-bold">{expenseForm.expenseType === 'tax' ? 'TAXxxxxx' : 'CPxxxxx'}</span>
                  </div>
                )}
                {expenseSaveError && <p className="text-xs text-rose-400">{expenseSaveError}</p>}
              </div>
              <div className="flex gap-3 p-5 border-t border-zinc-700">
                <button onClick={() => setShowExpenseForm(false)} className="flex-1 px-4 py-2 border border-zinc-600 text-zinc-300 rounded-lg text-sm font-bold cursor-pointer hover:bg-zinc-800">Hủy</button>
                <button onClick={handleSaveExpense} disabled={expenseSaving || !expenseForm.content.trim() || !expenseForm.amount || !expenseForm.date}
                  className={`flex-1 px-4 py-2 disabled:!opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer ${expenseForm.expenseType === 'tax' ? 'bg-orange-700 hover:bg-orange-600' : 'bg-rose-700 hover:bg-rose-600'}`}>
                  {expenseSaving ? 'Lưu...' : editingExpenseId ? 'Cập nhật' : 'Lập phiếu'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {deleteExpenseConfirm && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-sm p-6 text-center">
              <Trash2 className="w-10 h-10 text-rose-400 mx-auto mb-3" />
              <h3 className="font-bold text-zinc-100 mb-1">Xóa chi phí này?</h3>
              <p className="text-sm text-zinc-400 mb-5">Hành động này không thể hoàn tác.</p>
              <div className="flex gap-3">
                <button onClick={() => setDeleteExpenseConfirm(null)} className="flex-1 px-4 py-2 border border-zinc-600 text-zinc-300 rounded-lg text-sm font-bold cursor-pointer">Không</button>
                <button onClick={() => handleDeleteExpense(deleteExpenseConfirm)} className="flex-1 px-4 py-2 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-sm font-bold cursor-pointer">Xóa</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Debtors Modal */}
      <AnimatePresence>
        {showDebtorsModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-zinc-700">
                <h3 className="font-bold text-zinc-100 flex items-center gap-2"><Users className="w-5 h-5 text-amber-400" /> Đối tác còn nợ ({debtByPartner.filter(p => p.remaining > 0).length})</h3>
                <button onClick={() => setShowDebtorsModal(false)} className="text-zinc-400 hover:text-zinc-200 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <div className="overflow-auto flex-1">
                {debtByPartner.filter(p => p.remaining > 0).length === 0 ? (
                  <div className="p-12 text-center text-zinc-500"><Users className="w-10 h-10 mx-auto mb-2 stroke-1" /><p className="text-sm">Không có đối tác còn nợ</p></div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-800 border-b border-zinc-700 text-xs font-bold text-zinc-400 uppercase tracking-wider sticky top-0">
                      <tr>
                        <th className="px-4 py-3">STT</th>
                        <th className="px-4 py-3">Đối tác</th>
                        <th className="px-4 py-3 text-right">Tổng nợ</th>
                        <th className="px-4 py-3 text-right">Đã trả</th>
                        <th className="px-4 py-3 text-right">Còn lại</th>
                        <th className="px-4 py-3 w-32"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-700">
                      {debtByPartner.filter(p => p.remaining > 0).map((p, i) => (
                        <tr key={p.id} className="hover:bg-zinc-800/30 transition">
                          <td className="px-4 py-3 text-zinc-500 text-xs">{i + 1}</td>
                          <td className="px-4 py-3">
                            <p className="font-bold text-zinc-100">{p.partnerName}</p>
                            <p className="text-xs text-zinc-500">{p.orders.length} phiếu nhập</p>
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-zinc-300">{formatVND(p.total)}</td>
                          <td className="px-4 py-3 text-right font-mono text-emerald-400">{formatVND(p.paid)}</td>
                          <td className="px-4 py-3 text-right font-mono font-bold text-rose-400">{formatVND(p.remaining)}</td>
                          <td className="px-4 py-3">
                            <button onClick={() => { setShowDebtorsModal(false); setPayingAllPartner({ id: p.id, name: p.partnerName, remaining: p.remaining, orders: p.orders }); setPayingAllConfirmed(false); setPayingAllCash(false); }}
                              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 text-white rounded-lg text-xs font-bold cursor-pointer transition whitespace-nowrap flex items-center gap-1">
                              <CheckCheck className="w-3.5 h-3.5" /> Thanh toán
                            </button>
                          </td>
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

      {/* Unpaid Salary Modal */}
      <AnimatePresence>
        {showUnpaidSalaryModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between p-5 border-b border-zinc-700">
                <h3 className="font-bold text-zinc-100 flex items-center gap-2"><Users className="w-5 h-5 text-amber-400" /> Nhân viên chưa trả lương ({salaryUnpaidCount})</h3>
                <button onClick={() => setShowUnpaidSalaryModal(false)} className="text-zinc-400 hover:text-zinc-200 cursor-pointer"><X className="w-5 h-5" /></button>
              </div>
              <div className="overflow-auto flex-1">
                {salaryUnpaidCount === 0 ? (
                  <div className="p-12 text-center text-zinc-500"><Users className="w-10 h-10 mx-auto mb-2 stroke-1" /><p className="text-sm">Không có nhân viên chưa được trả lương</p></div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-zinc-800 border-b border-zinc-700 text-xs font-bold text-zinc-400 uppercase tracking-wider sticky top-0">
                      <tr>
                        <th className="px-4 py-3">STT</th>
                        <th className="px-4 py-3">Họ tên</th>
                        <th className="px-4 py-3">Cách tính</th>
                        <th className="px-4 py-3">Từ ngày</th>
                        <th className="px-4 py-3">Đến ngày</th>
                        <th className="px-4 py-3 text-right">Tổng lương</th>
                        <th className="px-4 py-3 text-right">Còn lại</th>
                        <th className="px-4 py-3 w-24"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-700">
                      {salaryEntries.filter(e => getTotalSalary(e) - (e.paidAmount ?? 0) > 0).map((e, i) => {
                        const total = getTotalSalary(e);
                        const remaining = total - (e.paidAmount ?? 0);
                        return (
                          <tr key={e.id} className="hover:bg-zinc-800/30 transition">
                            <td className="px-4 py-3 text-zinc-500 text-xs">{i + 1}</td>
                            <td className="px-4 py-3">
                              <p className="font-bold text-zinc-100">{e.fullName}</p>
                              {e.phone && <p className="text-xs text-zinc-500 font-mono">{e.phone}</p>}
                            </td>
                            <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${e.calcType === 'lump' ? 'bg-blue-900/30 text-blue-300' : 'bg-purple-900/30 text-purple-300'}`}>{e.calcType === 'lump' ? 'Đợt' : 'Ngày'}</span></td>
                            <td className="px-4 py-3 text-xs text-zinc-400 font-mono">{e.dateFrom}</td>
                            <td className="px-4 py-3 text-xs text-zinc-400 font-mono">{e.dateTo}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-zinc-100">{formatVND(total)}</td>
                            <td className="px-4 py-3 text-right font-mono font-bold text-rose-400">{formatVND(remaining)}</td>
                            <td className="px-4 py-3">
                              <button onClick={() => { setShowUnpaidSalaryModal(false); openPaySalary(e); }}
                                className="px-2 py-1 bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/60 rounded-lg text-[11px] font-bold cursor-pointer transition whitespace-nowrap">Trả lương</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Pay All Partner Modal */}
      <AnimatePresence>
        {payingAllPartner && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-[60]">
            <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-700 rounded-2xl shadow-xl w-full max-w-md p-6">
              <h3 className="font-bold text-zinc-100 mb-1 flex items-center gap-2"><CheckCheck className="w-5 h-5 text-emerald-400" /> Thanh toán tất cả công nợ</h3>
              <p className="text-xs text-zinc-400 mb-4">{payingAllPartner.name}</p>
              <div className="bg-zinc-800 rounded-xl p-4 mb-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-zinc-300">Tổng còn nợ:</span><span className="font-mono font-bold text-rose-400">{formatVND(payingAllPartner.remaining)}</span></div>
                <div className="flex justify-between"><span className="text-zinc-300">Số phiếu:</span><span className="font-mono">{payingAllPartner.orders.filter(o => o.totalAmount - o.paidAmount > 0).length} phiếu</span></div>
                <p className="text-xs text-amber-400 border-t border-zinc-700 pt-2">Thanh toán toàn bộ {formatVND(payingAllPartner.remaining)} — không thể điều chỉnh số tiền.</p>
              </div>
              <div className="mb-4">
                <p className="text-xs font-bold text-zinc-400 uppercase mb-2">Hình thức thanh toán</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => setPayingAllCash(true)}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-bold cursor-pointer transition ${payingAllCash ? 'border-amber-500 bg-amber-900/30 text-amber-300' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                    <Banknote className="w-4 h-4" /> Tiền mặt
                  </button>
                  <button type="button" onClick={() => setPayingAllCash(false)}
                    className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-sm font-bold cursor-pointer transition ${!payingAllCash ? 'border-blue-500 bg-blue-900/30 text-blue-300' : 'border-zinc-700 bg-zinc-800 text-zinc-400 hover:bg-zinc-700'}`}>
                    <Building2 className="w-4 h-4" /> Chuyển khoản
                  </button>
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setPayingAllPartner(null)} className="flex-1 px-4 py-2 border border-zinc-600 text-zinc-300 rounded-lg text-sm font-bold cursor-pointer">Hủy</button>
                <button onClick={handlePayAllPartner} disabled={payingAllSaving}
                  className="flex-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded-lg text-sm font-bold cursor-pointer">
                  {payingAllSaving ? 'Đang xử lý...' : 'Xác nhận thanh toán'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
