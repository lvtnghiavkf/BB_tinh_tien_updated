/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { Invoice, Product } from '../types';
import { 
  TrendingUp, TrendingDown, RefreshCcw, Calendar, FileText, Printer, 
  ChevronRight, CircleDollarSign, Search, ShoppingBag, Percent, Receipt
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ReportsProps {
  invoices: Invoice[];
  products: Product[];
  onSelectInvoiceForReprint: (invoice: Invoice) => void;
}

export default function Reports({ invoices, products, onSelectInvoiceForReprint }: ReportsProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [paymentFilter, setPaymentFilter] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'kpi' | 'transactions'>('kpi');
  
  // Hover states for dynamic SVG chart tooltip
  const [hoveredDataIdx, setHoveredDataIdx] = useState<number | null>(null);

  const formatVND = (value: number) => {
    return value.toLocaleString('vi-VN') + ' ₫';
  };

  // Compile calculations
  const stats = useMemo(() => {
    let totalRevenue = 0;
    let totalCost = 0;
    let totalTransactions = invoices.length;
    
    invoices.forEach((inv) => {
      totalRevenue += inv.finalAmount;
      // Calculate total cost for profit
      inv.items.forEach((item) => {
        totalCost += (item.product.costPrice * item.quantity);
      });
    });

    const totalProfit = totalRevenue - totalCost;
    const profitMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
    const avgTicket = totalTransactions > 0 ? totalRevenue / totalTransactions : 0;

    return {
      revenue: totalRevenue,
      profit: totalProfit,
      margin: profitMargin,
      transactions: totalTransactions,
      averageTicket: avgTicket,
    };
  }, [invoices]);

  // Aggregate daily data for chronological chart (e.g., group by day)
  const chartData = useMemo(() => {
    const dailyMap: { [key: string]: { revenue: number; profit: number; transactions: number } } = {};
    
    // Support last 7 days range
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
      dailyMap[dateStr] = { revenue: 0, profit: 0, transactions: 0 };
    }

    invoices.forEach((inv) => {
      try {
        const date = new Date(inv.timestamp);
        const dateStr = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        
        // Compute cost
        let cost = 0;
        inv.items.forEach((item) => {
          cost += (item.product.costPrice * item.quantity);
        });
        const profit = inv.finalAmount - cost;

        if (dailyMap[dateStr]) {
          dailyMap[dateStr].revenue += inv.finalAmount;
          dailyMap[dateStr].profit += profit;
          dailyMap[dateStr].transactions += 1;
        } else {
          // Fallback if transaction spans outside last 7 days (keep chart index friendly)
          dailyMap[dateStr] = { revenue: inv.finalAmount, profit, transactions: 1 };
        }
      } catch (e) {
        console.error(e);
      }
    });

    return Object.keys(dailyMap).map((key) => ({
      date: key,
      revenue: dailyMap[key].revenue,
      profit: dailyMap[key].profit,
      transactions: dailyMap[key].transactions,
    }));
  }, [invoices]);

  // Top Selling Products calculations
  const topProducts = useMemo(() => {
    const counts: { [key: string]: { name: string; sku: string; quantity: number; revenue: number } } = {};
    
    invoices.forEach((inv) => {
      inv.items.forEach((item) => {
        const id = item.product.id;
        if (!counts[id]) {
          counts[id] = {
            name: item.product.name,
            sku: item.product.sku,
            quantity: 0,
            revenue: 0,
          };
        }
        counts[id].quantity += item.quantity;
        counts[id].revenue += (item.quantity * item.product.sellingPrice);
      });
    });

    return Object.values(counts)
      .sort((a, b) => b.quantity - a.quantity)
      .slice(0, 5); // top 5
  }, [invoices]);

  // Payment methods chart aggregation
  const paymentMethodStats = useMemo(() => {
    let cashRev = 0, qrRev = 0, cardRev = 0;
    
    invoices.forEach((inv) => {
      if (inv.paymentMethod === 'CASH') cashRev += inv.finalAmount;
      if (inv.paymentMethod === 'QR') qrRev += inv.finalAmount;
      if (inv.paymentMethod === 'CARD') cardRev += inv.finalAmount;
    });

    const total = cashRev + qrRev + cardRev || 1;
    return [
      { name: 'Tiền mặt', value: cashRev, percent: Math.round((cashRev / total) * 100), color: 'bg-emerald-500', fill: '#10b981' },
      { name: 'Chuyển khoản QR', value: qrRev, percent: Math.round((qrRev / total) * 100), color: 'bg-indigo-500', fill: '#6366f1' },
      { name: 'Thẻ ngân hàng (Card)', value: cardRev, percent: Math.round((cardRev / total) * 100), color: 'bg-amber-500', fill: '#f59e0b' },
    ];
  }, [invoices]);

  // Filtered invoices
  const filteredInvoices = useMemo(() => {
    return invoices.filter((inv) => {
      const matchesSearch = !searchTerm || 
        inv.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.customerName && inv.customerName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (inv.customerPhone && inv.customerPhone.includes(searchTerm));
      
      const matchesPayment = !paymentFilter || inv.paymentMethod === paymentFilter;

      return matchesSearch && matchesPayment;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()); // descending (newest first)
  }, [invoices, searchTerm, paymentFilter]);


  // Custom SVG Chart parameters
  const svgChartDimensions = { width: 500, height: 200, paddingLeft: 60, paddingRight: 20, paddingTop: 20, paddingBottom: 30 };
  const maxRevenueInChart = Math.max(...chartData.map(d => d.revenue), 100000);
  
  const generateChartPoints = (key: 'revenue' | 'profit') => {
    const { width, height, paddingLeft, paddingRight, paddingTop, paddingBottom } = svgChartDimensions;
    const workingWidth = width - paddingLeft - paddingRight;
    const workingHeight = height - paddingTop - paddingBottom;
    const xStep = workingWidth / (chartData.length - 1);

    return chartData.map((d, idx) => {
      const x = paddingLeft + (idx * xStep);
      const ratio = d[key] / maxRevenueInChart;
      const y = height - paddingBottom - (ratio * workingHeight);
      return { x, y, value: d[key], date: d.date };
    });
  };

  const revenuePoints = generateChartPoints('revenue');
  const profitPoints = generateChartPoints('profit');

  const printAreaInvoice = (invoice: Invoice) => {
    onSelectInvoiceForReprint(invoice);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Báo cáo doanh thu</h1>
          <p className="text-slate-500 text-sm mt-1">Phân tích kinh doanh, số lượng khách, biểu đồ doanh thu theo thời gian thực tế.</p>
        </div>

        {/* Tab Selection */}
        <div className="flex border border-slate-200 rounded-lg bg-white p-1 self-start sm:self-auto shadow-xs">
          <button
            onClick={() => setActiveTab('kpi')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition inline-flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'kpi' 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" /> Tổng quan
          </button>
          <button
            onClick={() => setActiveTab('transactions')}
            className={`px-4 py-1.5 text-xs font-bold rounded-md transition inline-flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'transactions' 
                ? 'bg-blue-600 text-white shadow-xs' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" /> Lịch sử hóa đơn ({invoices.length})
          </button>
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
                  <p className="text-xs font-bold text-slate-405 tracking-wider">DOANH THU (REALTIME)</p>
                  <p className="text-xl font-extrabold text-blue-600 font-mono">{formatVND(stats.revenue)}</p>
                  <p className="text-[10px] text-emerald-600 font-bold flex items-center gap-0.5">
                    <TrendingUp className="w-3.5 h-3.5" /> Chuyển biến tích cực
                  </p>
                </div>
                <div className="p-3.5 bg-blue-50 text-blue-600 rounded-xl">
                  <CircleDollarSign className="w-6 h-6 animate-none" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-405 tracking-wider">LỢI NHUẬN THU THỰC</p>
                  <p className="text-xl font-extrabold text-emerald-600 font-mono">{formatVND(stats.profit)}</p>
                  <p className="text-[10px] text-slate-400">Đã trừ vốn nhập gốc</p>
                </div>
                <div className="p-3.5 bg-emerald-50 text-emerald-600 rounded-xl">
                  <TrendingUp className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-405 tracking-wider">SỐ HÓA ĐƠN ĐÃ BÁN</p>
                  <p className="text-2xl font-extrabold text-slate-800 font-mono">{stats.transactions}</p>
                  <p className="text-[10px] text-slate-400">Giao dịch thành công</p>
                </div>
                <div className="p-3.5 bg-slate-100 text-slate-600 rounded-xl">
                  <Receipt className="w-6 h-6" />
                </div>
              </div>

              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-bold text-slate-405 tracking-wider">GIÁ TRỊ ĐƠN TRUNG BÌNH</p>
                  <p className="text-lg font-bold text-slate-850 font-mono">{formatVND(stats.averageTicket)}</p>
                  <p className="text-[10px] text-blue-600 font-semibold italic">Tỉ suất lợi nhuận: {Math.round(stats.margin)}%</p>
                </div>
                <div className="p-3.5 bg-purple-50 text-purple-600 rounded-xl">
                  <Percent className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Daily Sales Trends - Dynamic Interactive SVG Chart */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-sm">Biểu đồ doanh thu 7 ngày qua</h3>
                    <p className="text-[11px] text-slate-400 mt-0.5">Biễn động doanh thu thực tế (Xanh dương) & Lợi nhuận ròng (Xanh lá)</p>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] bg-slate-50 border border-slate-150 px-2 py-1 rounded-md font-semibold text-slate-500">
                    <Calendar className="w-3.5 h-3.5" /> 7 Ngày gần nhất
                  </div>
                </div>

                {/* SVG Render */}
                <div className="relative pt-2 h-[220px]">
                  <svg 
                    viewBox={`0 0 ${svgChartDimensions.width} ${svgChartDimensions.height}`} 
                    className="w-full h-full overflow-visible"
                  >
                    {/* Gridlines */}
                    {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                      const { width, height, paddingLeft, paddingRight, paddingTop, paddingBottom } = svgChartDimensions;
                      const workingHeight = height - paddingTop - paddingBottom;
                      const y = height - paddingBottom - (ratio * workingHeight);
                      return (
                        <g key={ratio} className="opacity-15">
                          <line 
                            x1={paddingLeft} 
                            y1={y} 
                            x2={width - paddingRight} 
                            y2={y} 
                            stroke="#475569" 
                            strokeWidth="1" 
                            strokeDasharray="4,4"
                          />
                          <text 
                            x={paddingLeft - 8} 
                            y={y + 4} 
                            fill="#1e293b" 
                            fontSize="8" 
                            fontFamily="monospace"
                            textAnchor="end"
                          >
                            {Math.round((ratio * maxRevenueInChart) / 1000)}k
                          </text>
                        </g>
                      );
                    })}

                    {/* X Axis labels */}
                    {chartData.map((d, idx) => {
                      const { width, paddingLeft, paddingRight, height, paddingBottom } = svgChartDimensions;
                      const workingWidth = width - paddingLeft - paddingRight;
                      const xStep = workingWidth / (chartData.length - 1);
                      const x = paddingLeft + (idx * xStep);
                      return (
                        <text
                          key={idx}
                          x={x}
                          y={height - paddingBottom + 16}
                          fontSize="9"
                          fontWeight="bold"
                          fill="#64748b"
                          textAnchor="middle"
                        >
                          {d.date}
                        </text>
                      );
                    })}

                    {/* Area path for Revenue (Gradient background) */}
                    {revenuePoints.length > 1 && (
                      <g className="opacity-5">
                        <path
                          d={`
                            M ${revenuePoints[0].x} ${svgChartDimensions.height - svgChartDimensions.paddingBottom}
                            ${revenuePoints.map(p => `L ${p.x} ${p.y}`).join(' ')}
                            L ${revenuePoints[revenuePoints.length - 1].x} ${svgChartDimensions.height - svgChartDimensions.paddingBottom}
                            Z
                          `}
                          fill="#3b82f6"
                        />
                      </g>
                    )}

                    {/* Action Lines */}
                    {revenuePoints.length > 1 && (
                      <path
                        d={revenuePoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                        fill="none"
                        stroke="#2563eb"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                    )}

                    {profitPoints.length > 1 && (
                      <path
                        d={profitPoints.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ')}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeDasharray="1,1"
                      />
                    )}

                    {/* Interactive dots */}
                    {revenuePoints.map((p, idx) => (
                      <g key={idx}>
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={hoveredDataIdx === idx ? 6 : 4}
                          fill="#ffffff"
                          stroke="#2563eb"
                          strokeWidth="2"
                          onMouseEnter={() => setHoveredDataIdx(idx)}
                          onMouseLeave={() => setHoveredDataIdx(null)}
                          className="transition-all duration-150 cursor-pointer"
                        />
                        <circle
                          cx={profitPoints[idx].x}
                          cy={profitPoints[idx].y}
                          r={hoveredDataIdx === idx ? 5 : 3.5}
                          fill="#ffffff"
                          stroke="#10b981"
                          strokeWidth="1.5"
                          onMouseEnter={() => setHoveredDataIdx(idx)}
                          onMouseLeave={() => setHoveredDataIdx(null)}
                          className="transition-all duration-150 cursor-pointer"
                        />
                        {/* Interactive focus column trigger */}
                        <rect
                          x={p.x - 15}
                          y={svgChartDimensions.paddingTop}
                          width={30}
                          height={svgChartDimensions.height - svgChartDimensions.paddingTop - svgChartDimensions.paddingBottom}
                          fill="transparent"
                          onMouseEnter={() => setHoveredDataIdx(idx)}
                          onMouseLeave={() => setHoveredDataIdx(null)}
                          className="cursor-pointer"
                        />
                      </g>
                    ))}
                  </svg>

                  {/* HTML Tooltip overlay */}
                  {hoveredDataIdx !== null && (
                    <div 
                      className="absolute bg-slate-900/95 text-white p-3 rounded-xl shadow-lg border border-slate-700 pointer-events-none text-xs block z-20 space-y-1"
                      style={{
                        left: `${(hoveredDataIdx / (chartData.length - 1)) * 70 + 10}%`,
                        top: '5%'
                      }}
                    >
                      <p className="font-bold border-b border-slate-750 pb-1 text-[10px] text-slate-400">NGÀY {chartData[hoveredDataIdx].date}</p>
                      <p className="flex justify-between gap-4">
                        <span>Doanh thu:</span>
                        <span className="font-mono font-bold text-sky-400">{formatVND(chartData[hoveredDataIdx].revenue)}</span>
                      </p>
                      <p className="flex justify-between gap-4">
                        <span>Lợi nhuận:</span>
                        <span className="font-mono font-bold text-emerald-400">{formatVND(chartData[hoveredDataIdx].profit)}</span>
                      </p>
                      <p className="flex justify-between gap-4">
                        <span>Số giao dịch:</span>
                        <span className="font-mono font-bold">{chartData[hoveredDataIdx].transactions} đơn</span>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Payment Method distribution */}
              <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs flex flex-col justify-between">
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Cơ cấu thanh toán</h3>
                  <p className="text-[11px] text-slate-400 mt-0.5">Xếp hạng phương thức thanh toán khách ưa chuộng nhất.</p>
                </div>

                <div className="my-6 space-y-4">
                  {paymentMethodStats.map((item) => (
                    <div key={item.name} className="space-y-1.5">
                      <div className="flex justify-between text-xs font-semibold">
                        <span className="text-slate-600 flex items-center gap-2">
                          <span className={`w-3 h-3 rounded-full ${item.color}`}></span>
                          {item.name}
                        </span>
                        <span className="text-slate-800">{item.percent}% <span className="text-slate-450 font-mono">({formatVND(item.value)})</span></span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                        <div 
                           className={`h-full ${item.color} rounded-full`}
                           style={{ width: `${item.percent}%` }}
                        ></div>
                      </div>
                    </div>
                  ))}
                </div>

                <p className="text-[11px] text-slate-400 italic text-center pb-1">
                  Mã QR chuyển khoản trực tiếp tăng nhanh trong hành vi tiêu dùng.
                </p>
              </div>
            </div>

            {/* Top seller rank list */}
            <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
              <div className="flex items-center gap-2 pb-3 border-b border-slate-200 mb-4 text-slate-800">
                <ShoppingBag className="w-5 h-5 text-blue-600 animate-none shrink-0" />
                <h3 className="font-bold text-sm">Top 5 sản phẩm bán chạy nhất</h3>
              </div>

              {topProducts.length === 0 ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  Chưa ghi nhận sản phẩm bán ra trong kỳ báo cáo.
                </div>
              ) : (
                <div className="space-y-4">
                  {topProducts.map((p, idx) => {
                    const maxQtySold = topProducts[0]?.quantity || 1;
                    const percentWidth = (p.quantity / maxQtySold) * 100;

                    return (
                      <div key={p.sku} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50/50 rounded-lg hover:bg-slate-50 transition border border-slate-200">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-black flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-bold text-slate-800 text-xs sm:text-sm truncate">{p.name}</p>
                            <span className="text-[11px] text-slate-450 font-mono">Mã SKU: {p.sku}</span>
                          </div>
                        </div>

                        {/* Quantity indicator visual bar */}
                        <div className="flex items-center gap-4 sm:text-right shrink-0">
                          <div className="hidden sm:block w-32 bg-slate-150 h-1.5 rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-600 rounded-full" style={{ width: `${percentWidth}%` }}></div>
                          </div>
                          <div>
                            <p className="text-xs sm:text-sm font-black text-slate-800">{p.quantity} <span className="font-light text-[11px] text-slate-400 font-sans">bán ra</span></p>
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
            {/* Filters */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center gap-3">
              <div className="relative flex-1 w-full bg-white">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                  <Search className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="Tra cứu hóa đơn: mã HD, tên khách, số điện thoại..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs sm:text-sm text-slate-750 font-medium transition"
                />
              </div>

              <select
                value={paymentFilter}
                onChange={(e) => setPaymentFilter(e.target.value)}
                className="w-full sm:w-auto px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-xs sm:text-sm text-slate-750 font-medium cursor-pointer"
              >
                <option value="">Tất cả hình thức</option>
                <option value="CASH">Tiền mặt</option>
                <option value="QR">VietQR Chuyển khoản</option>
                <option value="CARD">Quẹt thẻ ngân hàng</option>
              </select>
            </div>

            {/* Transactions records list */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
              <div className="overflow-x-auto">
                {filteredInvoices.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    <FileText className="w-10 h-10 mx-auto stroke-1 text-slate-300 mb-2" />
                    <p className="text-xs font-semibold">Không tìm thấy mã hóa đơn khớp bộ lọc</p>
                  </div>
                ) : (
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                        <th className="px-5 py-3.5 font-mono">Mã Hóa Đơn</th>
                        <th className="px-5 py-3.5">Thời Gian Bán</th>
                        <th className="px-5 py-3.5">Khách Hàng</th>
                        <th className="px-5 py-3.5">Hàng Hóa Mua</th>
                        <th className="px-5 py-3.5 text-right font-mono">Tổng Tiền</th>
                        <th className="px-5 py-3.5 text-center">Hình thức</th>
                        <th className="px-5 py-3.5 text-right">In lại</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-105 text-sm">
                      {filteredInvoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50/55 transition">
                          <td className="px-5 py-3.5 font-mono font-bold text-slate-800">
                            {inv.id}
                          </td>
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
                              <span className="text-slate-450 text-xs">Khách lẻ mua trực tiếp</span>
                            )}
                          </td>
                          <td className="px-5 py-3.5 max-w-xs truncate text-xs text-slate-600">
                            {inv.items.map((it) => `${it.product.name} (x${it.quantity})`).join(', ')}
                          </td>
                          <td className="px-5 py-3.5 text-right font-mono font-bold text-slate-800 whitespace-nowrap">
                            {formatVND(inv.finalAmount)}
                          </td>
                          <td className="px-5 py-3.5 text-center whitespace-nowrap text-xs">
                            <span className={`px-2 py-1 rounded-md font-bold text-[10px] ${
                              inv.paymentMethod === 'CASH' 
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                                : inv.paymentMethod === 'QR' 
                                ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                                : 'bg-amber-50 text-amber-700 border border-amber-100'
                            }`}>
                              {inv.paymentMethod === 'CASH' ? 'Tiền mặt' : inv.paymentMethod === 'QR' ? 'VietQR CK' : 'Thẻ'}
                            </span>
                          </td>
                          <td className="px-5 py-3.5 text-right whitespace-nowrap">
                            <button
                              onClick={() => printAreaInvoice(inv)}
                              className="px-3 py-1.5 bg-slate-50 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 hover:border-blue-200 rounded-lg text-xs font-bold transition inline-flex items-center gap-1 cursor-pointer"
                              title="In hóa đơn chi tiết"
                            >
                              <Printer className="w-3.5 h-3.5" /> <span>Kiểm tra & In</span>
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
