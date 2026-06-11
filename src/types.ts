/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  id: string;
  sku: string;
  name: string;
  brand: string; // Nhãn hiệu (Coca-Cola, Hảo Hảo, TH...)
  category: string;
  costPrice: number; // Giá nhập
  sellingPrice: number; // Giá bán
  stock: number; // Số lượng tồn kho
  minStock: number; // Định mức tồn tối thiểu
  unit: string; // Đơn vị tính (Cái, Chai, Hộp, kg...)
  hidden?: boolean; // Ẩn sản phẩm khỏi màn Bán hàng (không xóa hẳn)
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export type PaymentMethod = 'CASH' | 'QR' | 'CARD';

export interface Invoice {
  id: string;
  timestamp: string; // ISO string
  items: CartItem[];
  totalAmount: number; // Trước giảm giá
  discountPercent: number; // Phần trăm giảm giá hóa đơn
  discountAmount: number; // Số tiền giảm giá
  finalAmount: number; // Tiền phải thanh toán
  paymentMethod: PaymentMethod;
  customerName?: string;
  customerPhone?: string;
}

export interface StoreConfig {
  name: string;
  phone: string;
  address: string;
  bankId: string; // MB, VCB, TCB, ACB, etc.
  bankAccount: string;
  bankAccountName: string; // Tên chủ tài khoản viết hoa không dấu
}

export interface SalesReport {
  date: string; // YYYY-MM-DD
  revenue: number; // Doanh thu
  profit: number; // Lợi nhuận
  transactionCount: number;
}

export type UserRole = 'manager' | 'sales';

export interface StaffUser {
  id: string;
  username: string;
  displayName: string;
  role: UserRole;
  pin: string;
}
