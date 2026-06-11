/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product, StoreConfig, Invoice } from './types';

export const POPULAR_BANKS = [
  { id: 'MB', name: 'MBBank - Ngân hàng Quân Đội' },
  { id: 'VCB', name: 'Vietcombank - Ngoại Thương Việt Nam' },
  { id: 'TCB', name: 'Techcombank - Kỹ Thương' },
  { id: 'ACB', name: 'ACB - Á Châu' },
  { id: 'BIDV', name: 'BIDV - Đầu tư và Phát triển VN' },
  { id: 'CTG', name: 'VietinBank - Công Thương Việt Nam' },
  { id: 'VPB', name: 'VPBank - Thịnh Vượng' },
  { id: 'TPB', name: 'TPBank - Tiên Phong' },
  { id: 'VIB', name: 'VIB - Quốc Tế Việt Nam' },
  { id: 'MSB', name: 'MSB - Hàng Hải Việt Nam' },
];

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-1',
    sku: 'SP00001',
    name: 'Nước ngọt Coca-Cola 390ml',
    brand: 'Coca-Cola',
    category: 'Nước giải khát',
    costPrice: 6500,
    sellingPrice: 10000,
    stock: 120,
    minStock: 20,
    unit: 'Chai',
  },
  {
    id: 'prod-2',
    sku: 'SP00002',
    name: 'Bia Heineken Lon 330ml',
    brand: 'Heineken',
    category: 'Nước giải khát',
    costPrice: 15500,
    sellingPrice: 22000,
    stock: 85,
    minStock: 15,
    unit: 'Lon',
  },
  {
    id: 'prod-3',
    sku: 'SP00003',
    name: 'Mì gói Hảo Hảo tôm chua cay',
    brand: 'Hảo Hảo',
    category: 'Mì ăn liền',
    costPrice: 3200,
    sellingPrice: 4500,
    stock: 250,
    minStock: 50,
    unit: 'Gói',
  },
  {
    id: 'prod-4',
    sku: 'SP00004',
    name: 'Sữa tươi TH True Milk ít đường 180ml',
    brand: 'TH true MILK',
    category: 'Sữa & Sản phẩm từ Sữa',
    costPrice: 6800,
    sellingPrice: 9000,
    stock: 140,
    minStock: 30,
    unit: 'Hộp',
  },
  {
    id: 'prod-5',
    sku: 'SP00005',
    name: 'Snack khoai tây Lay\'s vị Tự Nhiên 54g',
    brand: "Lay's",
    category: 'Bánh kẹo & Ăn vặt',
    costPrice: 14000,
    sellingPrice: 20000,
    stock: 8, // Thấp để test cảnh báo tồn kho
    minStock: 15,
    unit: 'Gói',
  },
  {
    id: 'prod-6',
    sku: 'SP00006',
    name: 'Nước khoáng thiên nhiên Lavie 500ml',
    brand: 'Lavie',
    category: 'Nước giải khát',
    costPrice: 3500,
    sellingPrice: 6000,
    stock: 12, // Thấp để test cảnh báo tồn kho
    minStock: 20,
    unit: 'Chai',
  },
  {
    id: 'prod-7',
    sku: 'SP00007',
    name: 'Bánh mì sandwich Kinh Đô lát mềm',
    brand: 'Kinh Đô',
    category: 'Bánh kẹo & Ăn vặt',
    costPrice: 15000,
    sellingPrice: 23000,
    stock: 45,
    minStock: 10,
    unit: 'Túi',
  },
  {
    id: 'prod-8',
    sku: 'SP00008',
    name: 'Kem đánh răng Colgate Colgate MaxFresh 137g',
    brand: 'Colgate',
    category: 'Hóa mỹ phẩm',
    costPrice: 28000,
    sellingPrice: 38000,
    stock: 60,
    minStock: 10,
    unit: 'Hộp',
  },
  {
    id: 'prod-9',
    sku: 'SP00009',
    name: 'Băng vệ sinh Diana siêu thấm cánh 8m',
    brand: 'Diana',
    category: 'Hóa mỹ phẩm',
    costPrice: 16000,
    sellingPrice: 22000,
    stock: 35,
    minStock: 8,
    unit: 'Gói',
  },
  {
    id: 'prod-10',
    sku: 'SP00010',
    name: 'Khăn giấy rút Bless You 250 tờ',
    brand: 'Bless You',
    category: 'Đồ dùng gia đình',
    costPrice: 19500,
    sellingPrice: 28000,
    stock: 55,
    minStock: 12,
    unit: 'Gói',
  }
];

export const INITIAL_STORE_CONFIG: StoreConfig = {
  name: 'MiniMart GreenLife',
  phone: '0987654321',
  address: 'Số 123 Đường Nguyễn Trãi, Thanh Xuân, Hà Nội',
  bankId: 'MB', // Default MBBank for easy VietQR mapping
  bankAccount: '1902040506079',
  bankAccountName: 'NGUYEN VAN POS'
};

// Generate realistic mock sales transactions across the last few days to populate the reporter
export function getMockInvoices(products: Product[]): Invoice[] {
  const now = new Date();
  
  // Helpers
  const subtractDays = (d: Date, days: number) => {
    const copy = new Date(d.getTime());
    copy.setDate(copy.getDate() - days);
    return copy;
  };

  const getDayAtHour = (d: Date, hour: number, minute: number) => {
    const copy = new Date(d.getTime());
    copy.setHours(hour, minute, 0, 0);
    return copy;
  };

  const invoices: Invoice[] = [];
  
  // Today's invoices (so active in real-time)
  const today = now;
  invoices.push({
    id: 'HD-10024',
    timestamp: getDayAtHour(today, 8, 15).toISOString(),
    items: [
      { product: products[0], quantity: 3 }, // Coca-cola (3 * 10k = 30k)
      { product: products[2], quantity: 5 }  // Hảo hảo (5 * 4.5k = 22.5k)
    ],
    totalAmount: 52500,
    discountPercent: 0,
    discountAmount: 0,
    finalAmount: 52500,
    paymentMethod: 'CASH',
    customerName: 'Anh Hoàng Kỳ',
    customerPhone: '0912345678'
  });

  invoices.push({
    id: 'HD-10025',
    timestamp: getDayAtHour(today, 10, 45).toISOString(),
    items: [
      { product: products[3], quantity: 10 }, // TH Milk (10 * 9k = 90k)
      { product: products[6], quantity: 1 }   // Bánh mì (1 * 23k = 23k)
    ],
    totalAmount: 113000,
    discountPercent: 5,
    discountAmount: 5650,
    finalAmount: 107350,
    paymentMethod: 'QR',
    customerName: 'Chị Mai Lan',
    customerPhone: '0977888999'
  });

  invoices.push({
    id: 'HD-10026',
    timestamp: getDayAtHour(today, 13, 20).toISOString(),
    items: [
      { product: products[1], quantity: 6 },  // Heineken (6 * 22k = 132k)
      { product: products[4], quantity: 2 }   // Lay's (2 * 20k = 40k)
    ],
    totalAmount: 172000,
    discountPercent: 0,
    discountAmount: 0,
    finalAmount: 172000,
    paymentMethod: 'QR',
    customerName: 'Vũ Quốc Anh',
  });

  // Yesterday's invoices
  const yesterday = subtractDays(today, 1);
  invoices.push({
    id: 'HD-10015',
    timestamp: getDayAtHour(yesterday, 9, 30).toISOString(),
    items: [
      { product: products[7], quantity: 2 }, // Kem đánh răng (2 * 38k = 76k)
      { product: products[9], quantity: 3 }  // Khăn giấy (3 * 28k = 84k)
    ],
    totalAmount: 160000,
    discountPercent: 10,
    discountAmount: 16000,
    finalAmount: 144000,
    paymentMethod: 'CARD',
    customerName: 'Khách vãng lai'
  });

  invoices.push({
    id: 'HD-10016',
    timestamp: getDayAtHour(yesterday, 12, 10).toISOString(),
    items: [
      { product: products[0], quantity: 4 }, // Coca
      { product: products[2], quantity: 10 }, // Hảo Hảo
      { product: products[3], quantity: 4 }  // TH True Milk
    ],
    totalAmount: 121000,
    discountPercent: 0,
    discountAmount: 0,
    finalAmount: 121000,
    paymentMethod: 'CASH',
  });

  invoices.push({
    id: 'HD-10017',
    timestamp: getDayAtHour(yesterday, 15, 40).toISOString(),
    items: [
      { product: products[1], quantity: 24 }, // Heineken (Full Thùng)
      { product: products[4], quantity: 5 }   // Lay's
    ],
    totalAmount: 628000,
    discountPercent: 5,
    discountAmount: 31400,
    finalAmount: 596600,
    paymentMethod: 'QR',
    customerName: 'Nhà hàng Hoa Mai',
    customerPhone: '0901239876'
  });

  invoices.push({
    id: 'HD-10018',
    timestamp: getDayAtHour(yesterday, 19, 0).toISOString(),
    items: [
      { product: products[0], quantity: 2 }, // Coca
      { product: products[6], quantity: 2 }  // Bánh mì Kinh đô
    ],
    totalAmount: 66000,
    discountPercent: 0,
    discountAmount: 0,
    finalAmount: 66000,
    paymentMethod: 'CASH',
  });

  // 2 days ago
  const twoDaysAgo = subtractDays(today, 2);
  invoices.push({
    id: 'HD-10008',
    timestamp: getDayAtHour(twoDaysAgo, 10, 15).toISOString(),
    items: [
      { product: products[8], quantity: 2 }, // Diana
      { product: products[9], quantity: 1 }  // Khăn giấy
    ],
    totalAmount: 72000,
    discountPercent: 0,
    discountAmount: 0,
    finalAmount: 72000,
    paymentMethod: 'CASH'
  });

  invoices.push({
    id: 'HD-10009',
    timestamp: getDayAtHour(twoDaysAgo, 14, 30).toISOString(),
    items: [
      { product: products[1], quantity: 12 }, // Heineken (12 * 22 = 264)
      { product: products[0], quantity: 6 },  // Coca-cola (6 * 10 = 60)
      { product: products[4], quantity: 4 }   // Lay's (4 * 20 = 80)
    ],
    totalAmount: 404000,
    discountPercent: 8,
    discountAmount: 32320,
    finalAmount: 371680,
    paymentMethod: 'QR',
    customerName: 'Nguyễn Lâm',
    customerPhone: '0979797979'
  });

  invoices.push({
    id: 'HD-10010',
    timestamp: getDayAtHour(twoDaysAgo, 18, 50).toISOString(),
    items: [
      { product: products[2], quantity: 20 }, // 20 Hảo Hảo
      { product: products[3], quantity: 12 }  // 12 Milk
    ],
    totalAmount: 198000,
    discountPercent: 0,
    discountAmount: 0,
    finalAmount: 198000,
    paymentMethod: 'CASH'
  });

  // Sort chronologically
  return invoices.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
