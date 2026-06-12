/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { StoreConfig, StaffUser } from '../types';
import { POPULAR_BANKS } from '../data';
import {
  Store, Phone, MapPin, CreditCard, User, CheckCircle2, AlertCircle,
  Users, Plus, Edit2, Trash2, Eye, EyeOff, ShieldCheck, ShoppingCart, X
} from 'lucide-react';
import { getStaffList, saveStaffList } from '../lib/auth';
import { motion, AnimatePresence } from 'motion/react';

interface SettingsProps {
  config: StoreConfig;
  onSaveConfig: (updatedConfig: StoreConfig) => void;
}

export default function Settings({ config, onSaveConfig }: SettingsProps) {
  const [formData, setFormData] = useState<StoreConfig>({ ...config });
  const [isSaved, setIsSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Staff management
  const [staffList, setStaffList] = useState<StaffUser[]>([]);
  const [isStaffFormOpen, setIsStaffFormOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<StaffUser | null>(null);
  const [staffUsername, setStaffUsername] = useState('');
  const [staffDisplayName, setStaffDisplayName] = useState('');
  const [staffRole, setStaffRole] = useState<'manager' | 'sales'>('sales');
  const [staffPin, setStaffPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [staffError, setStaffError] = useState('');

  useEffect(() => {
    setStaffList(getStaffList());
  }, []);

  // ── Store Config ─────────────────────────────────────────────────────────────

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSaved(false);

    if (!formData.name.trim()) { setErrorMsg('Vui lòng nhập tên cửa hàng.'); return; }
    if (!formData.phone.trim()) { setErrorMsg('Vui lòng nhập số điện thoại.'); return; }
    if (!formData.address.trim()) { setErrorMsg('Vui lòng nhập địa chỉ cửa hàng.'); return; }
    if (!formData.bankAccount.trim()) { setErrorMsg('Vui lòng nhập số tài khoản ngân hàng.'); return; }
    if (!formData.bankAccountName.trim()) { setErrorMsg('Vui lòng nhập tên chủ tài khoản.'); return; }

    const upperAccountName = formData.bankAccountName
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/Đ/g, 'D');

    const updatedConfig = { ...formData, bankAccountName: upperAccountName };
    setFormData(updatedConfig);
    onSaveConfig(updatedConfig);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 4000);
  };

  // ── Staff Management ──────────────────────────────────────────────────────────

  const openAddStaff = () => {
    setEditingStaff(null);
    setStaffUsername('');
    setStaffDisplayName('');
    setStaffRole('sales');
    setStaffPin('');
    setStaffError('');
    setShowPin(false);
    setIsStaffFormOpen(true);
  };

  const openEditStaff = (s: StaffUser) => {
    setEditingStaff(s);
    setStaffUsername(s.username);
    setStaffDisplayName(s.displayName);
    setStaffRole(s.role);
    setStaffPin(s.pin);
    setStaffError('');
    setShowPin(false);
    setIsStaffFormOpen(true);
  };

  const handleSaveStaff = (e: React.FormEvent) => {
    e.preventDefault();
    setStaffError('');

    if (!staffUsername.trim()) { setStaffError('Vui lòng nhập tên đăng nhập.'); return; }
    if (!staffDisplayName.trim()) { setStaffError('Vui lòng nhập tên hiển thị.'); return; }
    if (!staffPin.trim()) { setStaffError('Vui lòng nhập mã PIN.'); return; }

    const duplicate = staffList.find(
      (s) => s.username.toLowerCase() === staffUsername.toLowerCase().trim() &&
             s.id !== editingStaff?.id
    );
    if (duplicate) { setStaffError('Tên đăng nhập đã tồn tại.'); return; }

    let updated: StaffUser[];
    if (editingStaff) {
      updated = staffList.map((s) =>
        s.id === editingStaff.id
          ? { ...s, username: staffUsername.trim(), displayName: staffDisplayName.trim(), role: staffRole, pin: staffPin.trim() }
          : s
      );
    } else {
      const newStaff: StaffUser = {
        id: `staff-${Date.now()}`,
        username: staffUsername.trim(),
        displayName: staffDisplayName.trim(),
        role: staffRole,
        pin: staffPin.trim(),
      };
      updated = [...staffList, newStaff];
    }

    saveStaffList(updated);
    setStaffList(updated);
    setIsStaffFormOpen(false);
  };

  const handleDeleteStaff = (s: StaffUser) => {
    if (staffList.length <= 1) {
      alert('Phải có ít nhất 1 tài khoản trong hệ thống.');
      return;
    }
    if (!confirm(`Xóa tài khoản "${s.displayName}" (${s.username})?`)) return;
    const updated = staffList.filter((x) => x.id !== s.id);
    saveStaffList(updated);
    setStaffList(updated);
  };

  return (
    <div className="max-w-4xl mx-auto py-4 px-2 space-y-8">
      {/* Store Config Section */}
      <div>
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Cấu hình hệ thống</h1>
          <p className="text-slate-500 text-sm mt-1">
            Thiết lập thông tin cửa hàng và tài khoản ngân hàng nhận VietQR.
          </p>
        </div>

        <form onSubmit={handleSave} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Store Info */}
            <div className="bg-white p-6 rounded-xl border border-slate-200 space-y-4 shadow-xs">
              <div className="flex items-center gap-3 border-b border-slate-200 pb-3 mb-2">
                <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                  <Store className="w-5 h-5" />
                </div>
                <h2 className="font-bold text-slate-800 text-base">Thông tin cửa hàng</h2>
              </div>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">TÊN CỬA HÀNG <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Store className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" name="name" value={formData.name} onChange={handleInputChange} placeholder="Ví dụ: MiniMart GreenLife"
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-medium transition" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">SỐ ĐIỆN THOẠI <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" name="phone" value={formData.phone} onChange={handleInputChange} placeholder="0987654321"
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-medium transition" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">ĐỊA CHỈ <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" name="address" value={formData.address} onChange={handleInputChange} placeholder="123 Nguyễn Trãi, Hà Nội"
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-medium transition" />
                  </div>
                </div>
              </div>
            </div>

            {/* Bank Info */}
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
                  <select name="bankId" value={formData.bankId} onChange={handleInputChange}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-medium transition cursor-pointer">
                    {POPULAR_BANKS.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">SỐ TÀI KHOẢN <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" name="bankAccount" value={formData.bankAccount} onChange={handleInputChange} placeholder="Số tài khoản"
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-medium transition" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">CHỦ TÀI KHOẢN (VIẾT HOA KHÔNG DẤU) <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input type="text" name="bankAccountName" value={formData.bankAccountName} onChange={handleInputChange} placeholder="NGUYEN VAN A"
                      className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 text-sm font-medium transition" />
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 italic">Tự động chuyển sang chữ hoa không dấu khi lưu.</p>
                </div>
              </div>
            </div>
          </div>

          {errorMsg && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-4 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <p>{errorMsg}</p>
            </motion.div>
          )}
          {isSaved && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-100 rounded-lg text-emerald-800 text-sm">
              <CheckCircle2 className="w-5 h-5 shrink-0" />
              <div>
                <p className="font-semibold">Cập nhật thành công!</p>
                <p className="text-xs text-emerald-600 mt-0.5">Thông tin đã được lưu và áp dụng ngay.</p>
              </div>
            </motion.div>
          )}

          <div className="flex justify-end pt-2 border-t border-slate-200">
            <button type="submit" className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-sm transition shadow-xs cursor-pointer">
              Lưu cấu hình
            </button>
          </div>
        </form>
      </div>

      {/* Staff Management Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-extrabold text-slate-800 tracking-tight flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" /> Quản lý nhân viên
            </h2>
            <p className="text-slate-500 text-sm mt-1">Tài khoản đăng nhập và phân quyền cho từng nhân viên.</p>
          </div>
          <button
            onClick={openAddStaff}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2.5 rounded-lg text-sm transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Thêm nhân viên
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold text-xs uppercase tracking-wider">
                <th className="px-5 py-3.5">Nhân viên</th>
                <th className="px-5 py-3.5">Tên đăng nhập</th>
                <th className="px-5 py-3.5">Vai trò</th>
                <th className="px-5 py-3.5">Mã PIN</th>
                <th className="px-5 py-3.5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {staffList.map((s) => (
                <tr key={s.id} className="hover:bg-zinc-800/40 transition">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold ${s.role === 'manager' ? 'bg-blue-600' : 'bg-emerald-600'}`}>
                        {s.displayName.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-slate-800">{s.displayName}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-slate-600">{s.username}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${
                      s.role === 'manager'
                        ? 'bg-blue-50 text-blue-700 border-blue-200'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    }`}>
                      {s.role === 'manager'
                        ? <><ShieldCheck className="w-3 h-3" /> Quản lý</>
                        : <><ShoppingCart className="w-3 h-3" /> Nhân viên bán hàng</>}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 font-mono text-slate-400">{'•'.repeat(s.pin.length)}</td>
                  <td className="px-5 py-3.5 text-right space-x-2 whitespace-nowrap">
                    <button
                      onClick={() => openEditStaff(s)}
                      className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg transition inline-flex items-center cursor-pointer"
                      title="Chỉnh sửa"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteStaff(s)}
                      className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition inline-flex items-center cursor-pointer"
                      title="Xóa tài khoản"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-slate-400 mt-3 italic">
          Lưu ý: Tài khoản và mã PIN được lưu trên thiết bị (localStorage). Mỗi thiết bị cần đăng nhập riêng.
        </p>
      </div>

      {/* Staff Form Modal */}
      <AnimatePresence>
        {isStaffFormOpen && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-2xl shadow-xl border border-slate-100 w-full max-w-md overflow-hidden"
            >
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-extrabold text-slate-800 text-base flex items-center gap-2">
                  <Users className="w-4 h-4 text-blue-600" />
                  {editingStaff ? 'Chỉnh sửa tài khoản' : 'Thêm nhân viên mới'}
                </h3>
                <button onClick={() => setIsStaffFormOpen(false)} className="text-slate-400 hover:text-slate-600 font-bold p-1 cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSaveStaff} className="p-5 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">TÊN HIỂN THỊ <span className="text-red-500">*</span></label>
                  <input type="text" value={staffDisplayName} onChange={(e) => setStaffDisplayName(e.target.value)} placeholder="Nguyễn Văn A"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">TÊN ĐĂNG NHẬP <span className="text-red-500">*</span></label>
                  <input type="text" value={staffUsername} onChange={(e) => setStaffUsername(e.target.value)} placeholder="nhanvien01"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition" />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">MÃ PIN <span className="text-red-500">*</span></label>
                  <div className="relative">
                    <input
                      type={showPin ? 'text' : 'password'}
                      value={staffPin}
                      onChange={(e) => setStaffPin(e.target.value)}
                      placeholder="Mã PIN đăng nhập..."
                      className="w-full px-3 py-2 pr-10 border border-slate-200 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition tracking-widest"
                    />
                    <button type="button" onClick={() => setShowPin((v) => !v)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer">
                      {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2">VAI TRÒ</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setStaffRole('manager')}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition cursor-pointer ${
                        staffRole === 'manager' ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <ShieldCheck className="w-5 h-5" />
                      <span className="text-xs font-bold">Quản lý</span>
                      <span className="text-[10px] text-center text-current opacity-70">Toàn quyền hệ thống</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setStaffRole('sales')}
                      className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition cursor-pointer ${
                        staffRole === 'sales' ? 'border-emerald-600 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <ShoppingCart className="w-5 h-5" />
                      <span className="text-xs font-bold">Nhân viên bán hàng</span>
                      <span className="text-[10px] text-center text-current opacity-70">Bán hàng & Báo cáo</span>
                    </button>
                  </div>
                </div>

                {staffError && (
                  <div className="flex items-center gap-2 p-3 bg-rose-50 border border-rose-100 rounded-lg text-rose-700 text-xs font-medium">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {staffError}
                  </div>
                )}

                <div className="pt-3 border-t border-slate-200 flex justify-end gap-3">
                  <button type="button" onClick={() => setIsStaffFormOpen(false)}
                    className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg text-xs font-bold transition cursor-pointer">
                    Hủy
                  </button>
                  <button type="submit"
                    className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold transition cursor-pointer">
                    {editingStaff ? 'Lưu thay đổi' : 'Thêm nhân viên'}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
