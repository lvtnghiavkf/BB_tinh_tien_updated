/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Invoice, Product } from '../types';
import {
  TrendingUp, RefreshCcw, Calendar, FileText, Printer,
  CircleDollarSign, Search, ShoppingBag, Percent, Receipt,
  ChevronLeft, ChevronRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ReportsProps {
  invoices: Invoice[];
  products: Product[];
  onSelectInvoiceForReprint: (invoice: Invoice) => void;
}

type RangePreset = 'today' | '7days' | '30days' | 'custom';

function toDateStr(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export default function Reports({ invoices, products, onSelectInvoiceForReprint }: ReportsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'kpi' | 'transactions'>('kpi');
  const [hoveredDataIdx, setHoveredDataIdx] = useState<number | null>(null);

  // Date range
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  const [rangePreset, setRangePreset] = useState<RangePreset>('30days');
  const [customFrom, setCustomFrom] = useState(toDateStr(addDays(today, -30)));
  const [customTo, setCustomTo] = useState(toDateStr(today));

  const { dateFrom, dateTo } = useMemo(() => {
    const end = new Date(today);
    end.setHours(23, 59, 59, 999);

    if (rangePreset === 'today') {
      const start = new Date(today);
      start.setHours(0, 0, 0, 0);
      return { dateFrom: start, dateTo: end };
    }
    if (rangePreset === '7days') {
      const start = addDays(end, -6);
      start.setHours(0, 0, 0, 0);
      return { dateFrom: start, dateTo: end };
    }
    if (rangePreset === '30days') {
      const start = addDays(end, -29);
      start.setHours(0, 0, 0, 0);
      return { dateFrom: start, dateTo: end };
    }
    // custom
    const start = new Date(customFrom + 'T00:00:00');
    const endC = new Date(customTo + 'T23:59:59');
    return { dateFrom: start, dateTo: endC };
  }, [rangePreset, customFrom, customTo]);

  // Invoices filtered by date range
  const rangeInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const t = new Date(inv.timestamp).getTime();
      return t >= dateFrom.getTime() && t <= dateTo.getTime();
    });
  }, [invoices, dateFrom, dateTo]);

  const formatVND = (value: number) => value.toLocaleString('vi-VN') + ' ₫';

  // Stats within range
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;

    rangeInvoices.forEach((inv) => {
      totalRevenue += inv.finalAmount;
      inv.items.forEach((item) => {
        totalCost += item.product.costPrice * item.quantity;
      });
    });

    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const avgTicket = rangeInvoices.length > 0 ? totalRevenue / rangeInvoices.length : 0;

    return {
      revenue: totalRevenue,
      profit: totalProfit,
      margin: profitMargin,
      transactions: rangeInvoices.length,
      averageTicket: avgTicket,
    };
  }, [rangeInvoices]);

  // Daily chart data within range
  const chartData = useMemo(() => {
    const diffMs = dateTo.getTime() - dateFrom.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    const days = Math.min(diffDays, 60);

    const dailyMap: Record<string, { revenue: number; profit: number; transactions: number }> = {};

    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(dateTo);
      d.setDate(d.getDate() - i);
      const key = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      if (!dailyMap[key]) {
        dailyMap[key] = { revenue: 0, profit: 0, transactions: 0 };
      }
    }

    rangeInvoices.forEach((inv) => {
      try {
        const date = new Date(inv.timestamp);
        const key = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        let cost = 0;
        inv.items.forEach((item) => { cost += item.product.costPrice * item.quantity; });
        const profit = inv.finalAmount - cost;
        if (dailyMap[key]) {
          dailyMap[key].revenue += inv.finalAmount;
          dailyMap[key].profit += profit;
          dailyMap[key].transactions += 1;
        }
      } catch (e) {
        console.error(e);
      }
    });

    return Object.keys(dailyMap).map((key) => ({
      date: key,
      ...dailyMap[key],
    }));
  }, [rangeInvoices, dateFrom, dateTo]);

  // Top products
  const topProducts = useMemo(() => {
    const counts: Record<string, { name: string; sku: string; quantity: number; revenue: number }> = {};
    rangeInvoices.forEach((inv) => {
      inv.items.forEach((item) => {
        const id = item.product.id;
        if (!counts[id]) {
          counts[id] = { name: item.product.name, sku: item.product.sku, quantity: 0, revenue: 0 };
        }
        counts[id].quantity += item.quantity;
        counts[id].revenue += item.quantity * item.product.sellingPrice;
      });
    });
    return Object.values(counts).sort((a, b) => b.quantity - a.quantity).slice(0, 5);
  }, [rangeInvoices]);

  // Payment method stats
  const paymentMethodStats = useMemo(() => {
    let cashRev = 0, qrRev = 0, cardRev = 0;
    rangeInvoices.forEach((inv) => {
      if (inv.paymentMethod === 'CASH') cashRev += inv.finalAmount;
      if (inv.paymentMethod === 'QR') qrRev += inv.finalAmount;
      if (inv.paymentMethod === 'CARD') cardRev += inv.finalAmount;
    });
    const total = cashRev + qrRev + cardRev || 1;
    return [
      { name: 'Tiền mặt', value: cashRev, percent: Math.round((cashRev / total) * 100), color: 'bg-emerald-500' },
      { name: 'Chuyển khoản QR', value: qrRev, percent: Math.round((qrRev / total) * 100), color: 'bg-indigo-500' },
      { name: 'Thẻ ngân hàng', value: cardRev, percent: Math.round((cardRev / total) * 100), color: 'bg-amber-500' },
    ];
  }, [rangeInvoices]);

  // Filtered invoices for transaction list
  const filteredInvoices = useMemo(() => {
    return rangeInvoices.filter((inv) => {
      const matchesSearch = !searchTerm ||
        inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.customerName && inv.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (inv.customerPhone && inv.customerPhone.includes(searchTerm));
      const matchesPayment = !paymentFilter || inv.paymentMethod === paymentFilter;
      return matchesSearch && matchesPayment;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [rangeInvoices, searchTerm, paymentFilter]);

  // SVG chart
  const svgDim = { width: 500, height: 200, pL: 60, pR: 20, pT: 20, pB: 30 };
  const maxRev = Math.max(...chartData.map((d) => d.revenue), 100000);

  const genPoints = (key: 'revenue' | 'profit') => {
    const { width, height, pL, pR, pT, pB } = svgDim;
    const ww = width - pL - pR;
    const wh = height - pT - pB;
    const step = chartData.length > 1 ? ww / (chartData.length - 1) : ww;
    return chartData.map((d, idx) => ({
      x: pL + idx * step,
      y: height - pB - (d[key] / maxRev) * wh,
      value: d[key],
      date: d.date,
    }));
  };

  const revPts = genPoints('revenue');
  const profPts = genPoints('profit');

  const presetLabel: Record<RangePreset, string> = {
    today: 'Hôm nay',
    '7days': '7 ngày',
    '30days': '30 ngày',
    custom: 'Tùy chọn',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Báo cáo doanh thu</h1>
          <p className="text-slate-500 text-sm mt-1">Phân tích kinh doanh và doanh thu theo khoảng thời gian.</p>
        </div>
        <div className="flex border border-slate-200 rounded-lg bg-white p-1 self-start sm:self-auto shadow-xs">
          <button
            onClick={() => setActiveTab('kpi')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition inline-flex items-center gap-1.5 cursor-pointer ${activeTab === 'kpi' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Tổng quan
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition inline-flex items-center gap-1.5 cursor-pointer ${activeTab === 'transactions' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <FileText className="w-3.5 h-3.5" /> Lịch sử ({rangeInvoices.length})
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 flex-wrap">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-4 h-4 text-blue-500 shrink-0" />
            <span className="text-xs font-bold text-slate-600 whitespace-nowrap">Khoảng thời gian:</span>
          </div>

          {/* Preset buttons */}
          <div className="flex gap-1 bg-slate-100 rounded-lg p-1 border border-slate-200">
            {(['today', '7days', '30days', 'custom'] as RangePreset[]).map((p) => (
              <button
                key={p}
                onClick={() => setRangePreset(p)}
                className={`px-3 py-1 rounded-md text-xs font-bold transition cursor-pointer ${
                  rangePreset === p ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {presetLabel[p]}
              </button>
            ))}
          </div>

          {/* Custom range pickers */}
          {rangePreset === 'custom' && (
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Từ ngày:</span>
                <input
                  type="date"
                  value={customFrom}
                  max={customTo}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 cursor-pointer"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-slate-500 font-medium whitespace-nowrap">Đến ngày:</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom}
                  max={toDateStr(new Date())}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="px-2 py-1 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 cursor-pointer"
                />
              </div>
            </div>
          )}

          <p className="text-[11px] text-slate-400 ml-auto whitespace-nowrap">
            {rangePreset !== 'custom'
              ? `${dateFrom.toLocaleDateString('vi-VN')} — ${dateTo.toLocaleDateString('vi-VN')}`
              : `${new Date(customFrom + 'T00:00:00').toLocaleDateString('vi-VN')} — ${new Date(customTo + 'T00:00:00').toLocaleDateString('vi-VN')}`}
          </p>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'kpi' ? (
          <motion.div
            key="kpi-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-6"
          >
            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-400 tracking-wider uppercase">DOANH THU</p>
                  <p className="text-xl font-extrabold text-blue-600 font-mono">{formatVND(stats.revenue)}</p>
                  <p className="text-[10px] text-slate-400">{stats.transactions} giao dịch</p>
                </div>
                <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl">
                  <CircleDollarSign className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-400 tracking-wider uppercase">LỢI NHUẬN</p>
                  <p className="text-xl font-extrabold text-emerald-600 font-mono">{formatVND(stats.profit)}</p>
                  <p className="text-[10px] text-slate-400">Đã trừ vốn nhập gốc</p>
                </div>
                <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-400 tracking-wider uppercase">SỐ HÓA ĐƠN</p>
                  <p className="text-2xl font-extrabold text-slate-800 font-mono">{stats.transactions}</p>
                  <p className="text-[10px] text-slate-400">Giao dịch thành công</p>
                </div>
                <div className="p-3.5 bg-slate-100 text-slate-600 rounded-xl">
                  <Receipt className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-400 tracking-wider uppercase">ĐƠN TRUNG BÌNH</p>
                  <p className="text-lg font-bold text-slate-800 font-mono">{formatVND(stats.averageTicket)}</p>
                  <p className="text-[10px] text-blue-600 font-semibold italic">Lợi nhuận: {Math.round(stats.margin)}%</p>
                </div>
                <div className="p-3.5 bg-purple-50 text-purple-600 rounded-xl">
                  <Percent className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-sm">Biểu đồ doanh thu theo ngày</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Doanh thu (xanh dương) & Lợi nhuận (xanh lá)</p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] bg-slate-50 border border-slate-150 px-2 py-1 rounded-md font-semibold text-slate-500">
                    <Calendar className="w-3.5 h-3.5" /> {presetLabel[rangePreset]}
                  </div>
                </div>

                <div className="relative pt-2 h-[220px]">
                  <svg viewBox={`0 0 ${svgDim.width} ${svgDim.height}`} className="w-full h-full overflow-visible">
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                      const y = svgDim.height - svgDim.pB - (ratio * (svgDim.height - svgDim.pT - svgDim.pB));
                      return (
                        <g key={ratio} className="opacity-15">
                          <line x1={svgDim.pL} y1={y} x2={svgDim.width - svgDim.pR} y2={y} stroke="#475569" strokeWidth="1" strokeDasharray="4,4" />
                          <text x={svgDim.pL - 8} y={y + 4} fill="#1e293b" fontSize="8" fontFamily="monospace" textAnchor="end">
                            {Math.round((ratio * maxRev) / 1000)}k
                          </text>
                        </g>
                      );
                    })}

                    {chartData.map((d, idx) => {
                      const step = chartData.length > 1 ? (svgDim.width - svgDim.pL - svgDim.pR) / (chartData.length - 1) : 0;
                      const x = svgDim.pL + idx * step;
                      // Only show label every N ticks if many days
                      const showLabel = chartData.length <= 14 || idx % Math.ceil(chartData.length / 14) === 0;
                      return showLabel ? (
                        <text key={idx} x={x} y={svgDim.height - svgDim.pB + 16} fontSize="9" fontWeight="bold" fill="#64748b" textAnchor="middle">
                          {d.date}
                        </text>
                      ) : null;
                    })}

                    {revPts.length > 1 && (
                      <>
                        <path
                          d={`M ${revPts[0].x} ${svgDim.height - svgDim.pB} ${revPts.map(p => `L ${p.x} ${p.y}`).join(' ')} L ${revPts[revPts.length-1].x} ${svgDim.height - svgDim.pB} Z`}
                          fill="#3b82f6" opacity="0.05"
                        />
                        <path d={revPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} fill="none" stroke="#2563eb" strokeWidth="2.5" strokeLinecap="round" />
                      </>
                    )}
                    {profPts.length > 1 && (
                      <path d={profPts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')} fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeDasharray="1,1" />
                    )}

                    {revPts.map((p, idx) => (
                      <g key={idx}>
                        <circle cx={p.x} cy={p.y} r={hoveredDataIdx === idx ? 6 : 4} fill="#ffffff" stroke="#2563eb" strokeWidth="2"
                          onMouseEnter={() => setHoveredDataIdx(idx)} onMouseLeave={() => setHoveredDataIdx(null)}
                          className="transition-all duration-150 cursor-pointer" />
                        <circle cx={profPts[idx].x} cy={profPts[idx].y} r={hoveredDataIdx === idx ? 5 : 3.5} fill="#ffffff" stroke="#10b981" strokeWidth="1.5"
                          onMouseEnter={() => setHoveredDataIdx(idx)} onMouseLeave={() => setHoveredDataIdx(null)}
                          className="transition-all duration-150 cursor-pointer" />
                        <rect x={p.x - 15} y={svgDim.pT} width={30} height={svgDim.height - svgDim.pT - svgDim.pB}
                          fill="transparent" onMouseEnter={() => setHoveredDataIdx(idx)} onMouseLeave={() => setHoveredDataIdx(null)} className="cursor-pointer" />
                      </g>
                    ))}
                  </svg>

                  {hoveredDataIdx !== null && (
                    <div
                      className="absolute bg-slate-900/95 text-white p-3 rounded-xl shadow-lg border border-slate-700 pointer-events-none text-xs z-20 space-y-1"
                      style={{ left: `${(hoveredDataIdx / Math.max(chartData.length - 1, 1)) * 70 + 10}%`, top: '5%' }}
                    >
                      <p className="font-bold border-b border-slate-700 pb-1 text-[10px] text-slate-400">NGÀY {chartData[hoveredDataIdx].date}</p>
                      <p className="flex justify-between gap-4"><span>Doanh thu:</span><span className="font-mono font-bold text-sky-400">{formatVND(chartData[hoveredDataIdx].revenue)}</span></p>
                      <p className="flex justify-between gap-4"><span>Lợi nhuận:</span><span className="font-mono font-bold text-emerald-400">{formatVND(chartData[hoveredDataIdx].profit)}</span></p>
                      <p className="flex justify-between gap-4"><span>Giao dịch:</span><span className="font-mono font-bold">{chartData[hoveredDataIdx].transactions} đơn</span></p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Method Distribution */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Cơ cấu thanh toán</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Phương thức thanh toán trong kỳ.</p>
                </div>
                <div className="my-6 space-y-4">
                  {paymentMethodStats.map((item) => (
                    <div key={item.name} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-600 flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${item.color}`}></span>
                          {item.name}
                        </span>
                        <span className="text-slate-800">{item.percent}% <span className="text-slate-400 font-mono">({formatVND(item.value)})</span></span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.percent}%` }}></div>
                      </div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-slate-400 italic text-center pb-1">
                  Mã QR chuyển khoản tăng nhanh trong hành vi tiêu dùng.
                </p>
              </div>
            </div>

            {/* Top 5 Products */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-200 mb-4 text-slate-800">
                <ShoppingBag className="w-5 h-5 text-blue-600 shrink-0" />
                <h3 className="font-bold text-sm">Top 5 sản phẩm bán chạy</h3>
              </div>

              {topProducts.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">Chưa có giao dịch trong kỳ báo cáo.</div>
              ) : (
                <div className="space-y-4">
                  {topProducts.map((p, idx) => {
                    const maxQty = topProducts[0]?.quantity || 1;
                    return (
                      <div key={p.sku} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50/50 rounded-lg hover:bg-slate-50 transition border border-slate-200">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 text-xs sm:text-sm truncate">{p.name}</p>
                            <span className="text-[11px] text-slate-450 font-mono">SKU: {p.sku}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-4 shrink-0">
                          <div className="hidden sm:block w-32 bg-slate-150 h-1.5 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${(p.quantity / maxQty) * 100}%` }}></div>
                          </div>
                          <div>
                            <p className="text-xs sm:text-sm font-black text-slate-800">{p.quantity} <span className="font-light text-[11px] text-slate-400">bán ra</span></p>
                            <p className="text-[10px] text-emerald-600 font-mono font-medium">{formatVND(p.revenue)}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="transactions-tab"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            className="space-y-4"
          >
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Tra cứu: mã HD, tên khách, số điện thoại..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs sm:text-sm font-medium transition"
                />
              </div>
              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs sm:text-sm font-medium cursor-pointer"
              >
                <option value="">Tất cả hình thức</option>
                <option value="CASH">Tiền mặt</option>
                <option value="QR">VietQR Chuyển khoản</option>
                <option value="CARD">Quẹt thẻ ngân hàng</option>
              </select>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
              <div className="overflow-x-auto">
                {filteredInvoices.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    <FileText className="w-10 h-10 mx-auto stroke-1 text-slate-300 mb-2" />
                    <p className="text-xs font-semibold">Không tìm thấy hóa đơn khớp bộ lọc</p>
                  </div>
                ) : (
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                        <th className="px-5 py-3.5 font-mono">Mã Hóa Đơn</th>
                        <th className="px-5 py-3.5">Thời Gian</th>
                        <th className="px-5 py-3.5">Khách Hàng</th>
                        <th className="px-5 py-3.5">Hàng Hóa</th>
                        <th className="px-5 py-3.5 text-right font-mono">Tổng Tiền</th>
                        <th className="px-5 py-3.5 text-center">Hình thức</th>
                        <th className="px-5 py-3.5 text-right">In lại</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {filteredInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/55 transition">
                          <td className="px-5 py-3.5 font-mono font-bold text-slate-800">{inv.id}</td>
                          <td className="px-5 py-3.5 text-slate-500 whitespace-nowrap text-xs font-mono">
                            {new Date(inv.timestamp).toLocaleDateString('vi-VN')} {new Date(inv.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td className="px-5 py-3.5">
                            {inv.customerName ? (
                              <div>
                                <p className="font-semibold text-slate-800">{inv.customerName}</p>
                                {inv.customerPhone && <p className="text-[10px] text-slate-400 font-mono">{inv.customerPhone}</p>}
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs">Khách lẻ</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 max-w-xs truncate text-xs text-slate-600">
                            {inv.items.map((it) => `${it.product.name} (x${it.quantity})`).join(', ')}
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                            {formatVND(inv.finalAmount)}
                            {inv.discountAmount > 0 && (
                              <span className="block text-[10px] text-emerald-600 font-normal">-{formatVND(inv.discountAmount)}</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 text-center whitespace-nowrap text-xs">
                            <span className={`px-2 py-1 rounded-md font-bold text-[10px] ${
                              inv.paymentMethod === 'CASH' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                              : inv.paymentMethod === 'QR' ? 'bg-blue-50 text-blue-700 border border-blue-100'
                              : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                              {inv.paymentMethod === 'CASH' ? 'Tiền mặt' : inv.paymentMethod === 'QR' ? 'VietQR CK' : 'Thẻ'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <button
                              onClick={() => onSelectInvoiceForReprint(inv)}
                              className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Printer className="w-3.5 h-3.5" /> In lại
                            </button>
                          </td>
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
    </div>
  );
}
