/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Invoice, StoreConfig } from '../types';

interface InvoicePrintProps {
  invoice: Invoice;
  config: StoreConfig;
}

export default function InvoicePrint({ invoice, config }: InvoicePrintProps) {
  // Format currency
  const formatVND = (value: number) => {
    return value.toLocaleString('vi-VN') + ' ₫';
  };

  // Format date
  const formatDate = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('vi-VN') + ' ' + date.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    } catch (e) {
      return isoString;
    }
  };

  // VietQR generation url (compact template)
  const vietQrUrl = `https://img.vietqr.io/image/${config.bankId}-${config.bankAccount}-compact.png?amount=${invoice.finalAmount}&addInfo=${encodeURIComponent(invoice.id)}&accountName=${encodeURIComponent(config.bankAccountName)}`;

  return (
    <div className="w-[80mm] max-w-full mx-auto p-4 bg-white text-black font-mono select-none" style={{ fontSize: '13px', lineHeight: '1.4' }}>
      {/* Header */}
      <div className="text-center mb-4">
        <h2 className="text-base font-extrabold uppercase tracking-wider">{config.name}</h2>
        <p className="text-xs text-stone-600 mt-1">{config.address}</p>
        <p className="text-xs text-stone-600">SĐT: {config.phone}</p>
        <div className="border-b border-dashed border-stone-400 my-3"></div>
        <h3 className="text-sm font-bold uppercase tracking-wide">HÓA ĐƠN THANH TOÁN</h3>
        <p className="text-xs text-stone-500 mt-0.5">Số: {invoice.id}</p>
        <p className="text-[11px] text-stone-500">{formatDate(invoice.timestamp)}</p>
      </div>

      {/* Customer info */}
      {(invoice.customerName || invoice.customerPhone) && (
        <div className="text-xs mb-3 space-y-1">
          {invoice.customerName && <p><span className="font-semibold">Khách hàng:</span> {invoice.customerName}</p>}
          {invoice.customerPhone && <p><span className="font-semibold">SĐT:</span> {invoice.customerPhone}</p>}
        </div>
      )}

      <div className="border-b border-dashed border-stone-400 my-2"></div>

      {/* Items List */}
      <table className="w-full text-xs text-left">
        <thead>
          <tr className="border-b border-stone-300 font-semibold">
            <th className="py-1">Sản phẩm</th>
            <th className="text-right py-1">SL/ĐG</th>
            <th className="text-right py-1">T.Tiền</th>
          </tr>
        </thead>
        <tbody>
          {invoice.items.map((item, index) => (
            <tr key={index} className="align-top border-b border-stone-100">
              <td className="py-1.5 pr-2">
                <span className="font-medium">{item.product.name}</span>
                <span className="block text-[11px] text-stone-500">{item.product.sku} ({item.product.unit})</span>
              </td>
              <td className="text-right py-1.5 whitespace-nowrap">
                {item.quantity} x {formatVND(item.product.sellingPrice)}
              </td>
              <td className="text-right py-1.5 whitespace-nowrap">
                {formatVND(item.quantity * item.product.sellingPrice)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="border-b border-dashed border-stone-400 my-3"></div>

      {/* Totals */}
      <div className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <span>Tổng cộng:</span>
          <span>{formatVND(invoice.totalAmount)}</span>
        </div>
        {invoice.discountAmount > 0 && (
          <div className="flex justify-between text-stone-700 italic">
            <span>Giảm giá ({invoice.discountPercent}%):</span>
            <span>-{formatVND(invoice.discountAmount)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold border-t border-stone-200 pt-1.5">
          <span>TỔNG THANH TOÁN:</span>
          <span>{formatVND(invoice.finalAmount)}</span>
        </div>
      </div>

      <div className="border-b border-dashed border-stone-400 my-3"></div>

      {/* Payment info */}
      <div className="text-center space-y-2">
        <p className="text-xs font-semibold">
          Hình thức: {invoice.paymentMethod === 'CASH' ? 'Tiền mặt' : invoice.paymentMethod === 'CARD' ? 'Thẻ ngân hàng' : 'Chuyển khoản QR'}
        </p>
        
        {invoice.paymentMethod === 'QR' && (
          <div className="flex flex-col items-center justify-center my-2 p-2 bg-stone-50 rounded">
            <p className="text-[10px] text-stone-500 mb-1">Mã Chuyển Khoản VietQR</p>
            <img 
              src={vietQrUrl} 
              alt="VietQR code" 
              className="w-32 h-32 object-contain"
              referrerPolicy="no-referrer"
            />
            <p className="text-[10px] text-stone-600 mt-1 uppercase font-bold">{config.bankId}</p>
            <p className="text-[11px] font-mono text-stone-700 font-semibold">{config.bankAccount}</p>
          </div>
        )}

        <p className="text-xs italic font-medium mt-3">Xin Cảm Ơn Quý Khách!</p>
        <p className="text-[11px] text-stone-500">Hẹn Gặp Lại Quý Khách Lần Sau</p>
        <p className="text-[9px] text-stone-400 mt-1">Phần mềm cung cấp bởi VietPOS</p>
      </div>
    </div>
  );
}
