/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { StoreConfig } from '../types';
import { POPULAR_BANKS } from '../data';
import { Store, Phone, MapPin, CreditCard, User, CheckCircle2, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface SettingsProps {
  config: StoreConfig;
  onSaveConfig: (updatedConfig: StoreConfig) => void;
}

export default function Settings({ config, onSaveConfig }: SettingsProps) {
  const [formData, setFormData] = useState<StoreConfig>({ ...config });
  const [isSaved, setIsSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSaved(false);

    // Basic Validation
    if (!formData.name.trim()) {
      setErrorMsg('Vui lòng nhập tên cửa hàng.');
      return;
    }
    if (!formData.phone.trim()) {
      setErrorMsg('Vui lòng nhập số điện thoại.');
      return;
    }
    if (!formData.address.trim()) {
      setErrorMsg('Vui lòng nhập địa chỉ cửa hàng.');
      return;
    }
    if (!formData.bankAccount.trim()) {
      setErrorMsg('Vui lòng nhập số tài khoản ngân hàng để tạo mã QR.');
      return;
    }
    if (!formData.bankAccountName.trim()) {
      setErrorMsg('Vui lòng nhập tên chủ tài khoản.');
      return;
    }

    // Standardize bank account name (uppercase string, remove diacritics is ideal but let's just make it uppercase for Vietnamese banks standard requirements)
    const upperAccountName = formData.bankAccountName
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accent marks
      .replace(/Đ/g, 'D');

    const updatedConfig = {
      ...formData,
      bankAccountName: upperAccountName,
    };

    setFormData(updatedConfig);
    onSaveConfig(updatedConfig);
    setIsSaved(true);

    setTimeout(() => {
      setIsSaved(false);
    }, 4000);
  };

  return (
    <div className="max-w-4xl mx-auto py-4 px-2">
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Cấu hình hệ thống</h1>
        <p className="text-slate-500 text-sm mt-1">
          Thiết lập thông tin cửa hàng hiển thị trên hóa đơn và thông tin tài khoản ngân hàng nhận thanh toán qua mã VietQR.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Store Info Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4 shadow-xs">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-3 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <Store className="w-5 h-5 animate-none" />
              </div>
              <h2 className="font-bold text-slate-800 text-base">Thông tin cửa hàng</h2>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">TÊN CỬA HÀNG <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none font-medium">
                    <Store className="w-4 h-4 animate-none" />
                  </span>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    placeholder="Ví dụ: MiniMart GreenLife"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm text-slate-750 font-medium transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">SỐ ĐIỆN THOẠI <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                    <Phone className="w-4 h-4 animate-none" />
                  </span>
                  <input
                    type="text"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    placeholder="Ví dụ: 0987654321"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm text-slate-750 font-medium transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">ĐỊA CHỈ <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                    <MapPin className="w-4 h-4 animate-none" />
                  </span>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    placeholder="Ví dụ: 123 Nguyễn Trãi, Thanh Xuân, Hà Nội"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm text-slate-750 font-medium transition"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Bank VietQR Transfer Card */}
          <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4 shadow-xs">
            <div className="flex items-center gap-3 border-b border-slate-200 pb-3 mb-2">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <CreditCard className="w-5 h-5" />
              </div>
              <h2 className="font-bold text-slate-800 text-base">Tài khoản nhận VietQR</h2>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">NGÂN HÀNG <span className="text-red-500">*</span></label>
                <select
                  name="bankId"
                  value={formData.bankId}
                  onChange={handleInputChange}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm text-slate-750 font-medium transition cursor-pointer"
                >
                  {POPULAR_BANKS.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">SỐ TÀI KHOẢN <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                    <CreditCard className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    name="bankAccount"
                    value={formData.bankAccount}
                    onChange={handleInputChange}
                    placeholder="Số tài khoản ngân hàng"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm text-slate-750 font-medium transition"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">CHỦ TÀI KHOẢN (VIẾT HOA KHÔNG DẤU) <span className="text-red-500">*</span></label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400 pointer-events-none">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    name="bankAccountName"
                    value={formData.bankAccountName}
                    onChange={handleInputChange}
                    placeholder="Ví dụ: NGUYEN VAN A"
                    className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm text-slate-750 font-medium transition"
                  />
                </div>
                <p className="text-[10px] text-slate-400 mt-1 italic">
                  Tự động chuyển đổi sang chữ viết hoa không dấu để đáp ứng cổng thanh toán điện tử VietQR.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Validation and Success Banners */}
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 text-sm"
          >
            <AlertCircle className="w-5 h-5 shrink-0" />
            <p>{errorMsg}</p>
          </motion.div>
        )}

        {isSaved && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-800 text-sm"
          >
            <CheckCircle2 className="w-5 h-5 shrink-0" />
            <div>
              <p className="font-semibold">Cập nhật thành công!</p>
              <p className="text-xs text-emerald-600 mt-0.5">Thông tin mới đã được lưu vào bộ nhớ cục bộ và áp dụng ngay lập tức cho các hóa đơn tiếp theo.</p>
            </div>
          </motion.div>
        )}

        {/* Bottom Bar */}
        <div className="flex justify-end pt-2 border-t border-slate-200">
          <button
            type="submit"
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm transition shadow-xs cursor-pointer"
          >
            Lưu cấu hình
          </button>
        </div>
      </form>
    </div>
  );
}
