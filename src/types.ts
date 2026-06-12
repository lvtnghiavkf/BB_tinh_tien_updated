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
  barcode?: string; // Mã vạch riêng (khác SKU)
  imageUrl?: string; // URL hình ảnh sản phẩm
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
  notes?: string;
  status?: 'completed' | 'cancelled';
  paymentStatus?: 'paid' | 'unpaid';
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

export interface Customer {
  id: string;
  code?: string;
  fullName: string;
  birthDate?: string; // YYYY-MM-DD
  phone: string;
  email?: string;
  address?: string;
  notes?: string;
  createdAt: string;
}

export interface Partner {
  id: string;
  code?: string;
  fullName: string;
  brands: string[];
  phones: string[];
  emails: string[];
  address?: string;
  bankName?: string;
  bankAccount?: string;
  bankAccountName?: string;
  notes?: string;
  createdAt: string;
}

export interface PurchaseOrderItem {
  productId: string;
  productName: string;
  sku: string;
  quantity: number;
  unitCost: number;
}

export interface PurchaseOrder {
  id: string;
  type: 'import' | 'export';
  partnerId: string;
  partnerName: string;
  timestamp: string;
  items: PurchaseOrderItem[];
  totalAmount: number;
  paidAmount: number;
  notes?: string;
  parentId?: string;    // ID phiếu gốc (nếu là phiếu điều chỉnh)
  revisionNote?: string; // Ghi chú điều chỉnh tự động
}

export interface PaymentLog {
  id: string;
  createdAt: string;           // ISO timestamp
  type: 'debt' | 'salary';
  referenceId: string;         // PO ID hoặc salary entry ID
  referenceName?: string;      // Tên đối tác hoặc nhân viên
  amount: number;              // Số tiền thanh toán lần này
  paymentMethod: 'bank' | 'cash';
  remaining: number;           // Còn nợ sau thanh toán
  notes?: string;              // Ghi chú thêm (kỳ lương, v.v.)
}

export interface SalaryEntry {
  id: string;
  fullName: string;
  phone: string;
  amount: number;
  calcType: 'lump' | 'daily';
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  bankName?: string;
  bankAccount?: string;
  bankAccountName?: string;
  paidAmount: number; // Đã thanh toán
  isPaidCash?: boolean; // Trả tiền mặt
  notes?: string;
  createdAt: string;
}

export interface Expense {
  id: string;
  content: string;   // Nội dung chi phí
  amount: number;
  notes?: string;
  date: string;      // YYYY-MM-DD
  createdAt: string;
}
