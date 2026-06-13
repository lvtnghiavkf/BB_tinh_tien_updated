import { supabase } from './supabase';
import { Product, Invoice, StoreConfig, PaymentMethod, Customer, Partner, PurchaseOrder, PurchaseOrderItem, SalaryEntry, PaymentLog, Expense, ReturnOrder, ReturnItem } from '../types';

// ── Invoices (update) ─────────────────────────────────────────────────────────

export async function updateInvoice(inv: Invoice): Promise<void> {
  const { error } = await supabase.from('invoices').update({
    customer_name: inv.customerName ?? null,
    customer_phone: inv.customerPhone ?? null,
    payment_method: inv.paymentMethod,
    discount_percent: inv.discountPercent,
    discount_amount: inv.discountAmount,
    total_amount: inv.totalAmount,
    final_amount: inv.finalAmount,
    notes: inv.notes ?? null,
    status: inv.status ?? 'completed',
    payment_status: inv.paymentStatus ?? 'paid',
    is_adjusted: inv.isAdjusted ?? false,
  }).eq('id', inv.id);
  if (error) throw error;

  // Replace invoice items
  const { error: delErr } = await supabase.from('invoice_items').delete().eq('invoice_id', inv.id);
  if (delErr) throw delErr;

  if (inv.items.length > 0) {
    const { error: insErr } = await supabase.from('invoice_items').insert(
      inv.items.map(it => ({
        invoice_id: inv.id,
        product_id: it.product.id,
        product_snapshot: it.product,
        quantity: it.quantity,
        unit_price: it.product.sellingPrice,
      })),
    );
    if (insErr) throw insErr;
  }
}

// ── Products ──────────────────────────────────────────────────────────────────

export async function fetchProducts(): Promise<Product[]> {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(r => ({
    id: r.id,
    sku: r.sku,
    name: r.name,
    brand: r.brand ?? '',
    category: r.category,
    costPrice: r.cost_price,
    sellingPrice: r.selling_price,
    stock: r.stock,
    minStock: r.min_stock,
    unit: r.unit,
    hidden: r.hidden ?? false,
    barcode: r.barcode ?? undefined,
    imageUrl: r.image_url ?? undefined,
  }));
}

export async function insertProduct(p: Product): Promise<void> {
  const payload: Record<string, any> = {
    id: p.id, sku: p.sku, name: p.name,
    brand: p.brand ?? '', category: p.category,
    cost_price: p.costPrice, selling_price: p.sellingPrice,
    stock: p.stock, min_stock: p.minStock, unit: p.unit,
    hidden: p.hidden ?? false,
  };
  if (p.barcode !== undefined) payload.barcode = p.barcode || null;
  if (p.imageUrl !== undefined) payload.image_url = p.imageUrl || null;
  const { error } = await supabase.from('products').insert(payload);
  if (error) throw error;
}

export async function updateProduct(p: Product): Promise<void> {
  const payload: Record<string, any> = {
    sku: p.sku, name: p.name, brand: p.brand ?? '',
    category: p.category, cost_price: p.costPrice,
    selling_price: p.sellingPrice, stock: p.stock,
    min_stock: p.minStock, unit: p.unit,
    hidden: p.hidden ?? false,
    updated_at: new Date().toISOString(),
  };
  if (p.barcode !== undefined) payload.barcode = p.barcode || null;
  if (p.imageUrl !== undefined) payload.image_url = p.imageUrl || null;
  const { error } = await supabase.from('products').update(payload).eq('id', p.id);
  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

export async function uploadProductImage(file: File, productId: string): Promise<string> {
  const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  const path = `${productId}.${ext}`;
  const { error } = await supabase.storage
    .from('product-images')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw error;
  const { data } = supabase.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

// ── Store Config ──────────────────────────────────────────────────────────────

export async function fetchStoreConfig(): Promise<StoreConfig | null> {
  const { data, error } = await supabase
    .from('store_config')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error || !data) return null;
  return {
    name: data.name,
    phone: data.phone,
    address: data.address,
    bankId: data.bank_id,
    bankAccount: data.bank_account,
    bankAccountName: data.bank_account_name,
  };
}

export async function saveStoreConfig(c: StoreConfig): Promise<void> {
  const { error } = await supabase.from('store_config').upsert({
    id: 1,
    name: c.name,
    phone: c.phone,
    address: c.address,
    bank_id: c.bankId,
    bank_account: c.bankAccount,
    bank_account_name: c.bankAccountName,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}

// ── Invoices ──────────────────────────────────────────────────────────────────

export async function fetchInvoices(): Promise<Invoice[]> {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, invoice_items(*)')
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data.map(r => ({
    id: r.id,
    timestamp: r.timestamp,
    items: (r.invoice_items ?? []).map((it: any) => ({
      product: it.product_snapshot as Product,
      quantity: it.quantity,
    })),
    totalAmount: r.total_amount,
    discountPercent: r.discount_percent,
    discountAmount: r.discount_amount,
    finalAmount: r.final_amount,
    paymentMethod: r.payment_method as PaymentMethod,
    customerName: r.customer_name ?? undefined,
    customerPhone: r.customer_phone ?? undefined,
    notes: r.notes ?? undefined,
    status: (r.status ?? 'completed') as 'completed' | 'cancelled',
    paymentStatus: (r.payment_status ?? 'paid') as 'paid' | 'unpaid',
    isAdjusted: r.is_adjusted ?? false,
  }));
}

export async function insertInvoice(invoice: Invoice): Promise<void> {
  const { error: invErr } = await supabase.from('invoices').insert({
    id: invoice.id,
    timestamp: invoice.timestamp,
    total_amount: invoice.totalAmount,
    discount_percent: invoice.discountPercent,
    discount_amount: invoice.discountAmount,
    final_amount: invoice.finalAmount,
    payment_method: invoice.paymentMethod,
    customer_name: invoice.customerName ?? null,
    customer_phone: invoice.customerPhone ?? null,
    notes: invoice.notes ?? null,
    status: invoice.status ?? 'completed',
    payment_status: invoice.paymentStatus ?? 'paid',
  });
  if (invErr) throw invErr;

  const { error: itemsErr } = await supabase.from('invoice_items').insert(
    invoice.items.map(item => ({
      invoice_id: invoice.id,
      product_id: item.product.id,
      product_snapshot: item.product,
      quantity: item.quantity,
      unit_price: item.product.sellingPrice,
    }))
  );
  if (itemsErr) throw itemsErr;
}

// ── Customers ─────────────────────────────────────────────────────────────────

export async function fetchCustomers(): Promise<Customer[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(r => ({
    id: r.id,
    code: r.code ?? undefined,
    fullName: r.full_name,
    birthDate: r.birth_date ?? undefined,
    phone: r.phone ?? '',
    email: r.email ?? undefined,
    address: r.address ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function insertCustomer(c: Customer): Promise<void> {
  const payload: Record<string, any> = {
    id: c.id, full_name: c.fullName,
    birth_date: c.birthDate ?? null,
    phone: c.phone, email: c.email ?? null,
    notes: c.notes ?? null, created_at: c.createdAt,
  };
  if (c.address !== undefined) payload.address = c.address || null;
  if (c.code !== undefined) payload.code = c.code || null;
  const { error } = await supabase.from('customers').insert(payload);
  if (error) throw error;
}

export async function updateCustomer(c: Customer): Promise<void> {
  const payload: Record<string, any> = {
    full_name: c.fullName, birth_date: c.birthDate ?? null,
    phone: c.phone, email: c.email ?? null,
    notes: c.notes ?? null, updated_at: new Date().toISOString(),
  };
  if (c.address !== undefined) payload.address = c.address || null;
  if (c.code !== undefined) payload.code = c.code || null;
  const { error } = await supabase.from('customers').update(payload).eq('id', c.id);
  if (error) throw error;
}

export async function deleteCustomer(id: string): Promise<void> {
  const { error } = await supabase.from('customers').delete().eq('id', id);
  if (error) throw error;
}

// ── Partners ──────────────────────────────────────────────────────────────────

export async function fetchPartners(): Promise<Partner[]> {
  const { data, error } = await supabase
    .from('partners')
    .select('*')
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data.map(r => ({
    id: r.id,
    code: r.code ?? undefined,
    fullName: r.full_name,
    brands: r.brands ?? [],
    phones: r.phones ?? [],
    emails: r.emails ?? [],
    address: r.address ?? undefined,
    bankName: r.bank_name ?? undefined,
    bankAccount: r.bank_account ?? undefined,
    bankAccountName: r.bank_account_name ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function insertPartner(p: Partner): Promise<void> {
  const payload: Record<string, any> = {
    id: p.id, full_name: p.fullName,
    brands: p.brands, phones: p.phones, emails: p.emails,
    notes: p.notes ?? null, created_at: p.createdAt,
  };
  if (p.address !== undefined) payload.address = p.address || null;
  if (p.code !== undefined) payload.code = p.code || null;
  if (p.bankName !== undefined) payload.bank_name = p.bankName || null;
  if (p.bankAccount !== undefined) payload.bank_account = p.bankAccount || null;
  if (p.bankAccountName !== undefined) payload.bank_account_name = p.bankAccountName || null;
  const { error } = await supabase.from('partners').insert(payload);
  if (error) throw error;
}

export async function updatePartner(p: Partner): Promise<void> {
  const payload: Record<string, any> = {
    full_name: p.fullName, brands: p.brands, phones: p.phones,
    emails: p.emails, notes: p.notes ?? null,
    updated_at: new Date().toISOString(),
  };
  if (p.address !== undefined) payload.address = p.address || null;
  if (p.code !== undefined) payload.code = p.code || null;
  if (p.bankName !== undefined) payload.bank_name = p.bankName || null;
  if (p.bankAccount !== undefined) payload.bank_account = p.bankAccount || null;
  if (p.bankAccountName !== undefined) payload.bank_account_name = p.bankAccountName || null;
  const { error } = await supabase.from('partners').update(payload).eq('id', p.id);
  if (error) throw error;
}

export async function deletePartner(id: string): Promise<void> {
  const { error } = await supabase.from('partners').delete().eq('id', id);
  if (error) throw error;
}

// ── Purchase Orders ───────────────────────────────────────────────────────────

export async function fetchPurchaseOrders(): Promise<PurchaseOrder[]> {
  const { data, error } = await supabase
    .from('purchase_orders')
    .select('*, purchase_order_items(*)')
    .order('timestamp', { ascending: false });
  if (error) throw error;
  return data.map(r => ({
    id: r.id,
    type: r.type as 'import' | 'export',
    partnerId: r.partner_id ?? '',
    partnerName: r.partner_name ?? '',
    timestamp: r.timestamp,
    items: (r.purchase_order_items ?? []).map((it: any): PurchaseOrderItem => ({
      productId: it.product_id ?? '',
      productName: it.product_name,
      sku: it.sku ?? '',
      quantity: it.quantity,
      unitCost: it.unit_cost,
    })),
    totalAmount: r.total_amount,
    paidAmount: r.paid_amount,
    notes: r.notes ?? undefined,
    parentId: r.parent_id ?? undefined,
    revisionNote: r.revision_note ?? undefined,
  }));
}

export async function insertPurchaseOrder(o: PurchaseOrder): Promise<void> {
  const payload: Record<string, any> = {
    id: o.id, type: o.type,
    partner_id: o.partnerId || null,
    partner_name: o.partnerName || null,
    timestamp: o.timestamp,
    total_amount: o.totalAmount,
    paid_amount: o.paidAmount,
    notes: o.notes ?? null,
  };
  // Only include revision fields if set (columns may not exist yet)
  if (o.parentId !== undefined) payload.parent_id = o.parentId;
  if (o.revisionNote !== undefined) payload.revision_note = o.revisionNote;
  const { error: oErr } = await supabase.from('purchase_orders').insert(payload);
  if (oErr) throw oErr;

  if (o.items.length > 0) {
    const { error: itemsErr } = await supabase.from('purchase_order_items').insert(
      o.items.map(it => ({
        order_id: o.id,
        product_id: it.productId || null,
        product_name: it.productName,
        sku: it.sku || null,
        quantity: it.quantity,
        unit_cost: it.unitCost,
      }))
    );
    if (itemsErr) throw itemsErr;
  }
}

export async function updatePurchaseOrder(o: PurchaseOrder): Promise<void> {
  const { error } = await supabase.from('purchase_orders').update({
    paid_amount: o.paidAmount,
    notes: o.notes ?? null,
  }).eq('id', o.id);
  if (error) throw error;
}

export async function deletePurchaseOrder(id: string): Promise<void> {
  const { error } = await supabase.from('purchase_orders').delete().eq('id', id);
  if (error) throw error;
}

// ── Salary Entries ────────────────────────────────────────────────────────────

export async function fetchSalaryEntries(): Promise<SalaryEntry[]> {
  const { data, error } = await supabase
    .from('salary_entries')
    .select('*')
    .order('date_from', { ascending: false });
  if (error) throw error;
  return data.map(r => ({
    id: r.id,
    fullName: r.full_name,
    phone: r.phone ?? '',
    amount: r.amount,
    calcType: r.calc_type as 'lump' | 'daily',
    dateFrom: r.date_from,
    dateTo: r.date_to,
    bankName: r.bank_name ?? undefined,
    bankAccount: r.bank_account ?? undefined,
    bankAccountName: r.bank_account_name ?? undefined,
    paidAmount: r.paid_amount ?? 0,
    isPaidCash: r.is_paid_cash ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function insertSalaryEntry(s: SalaryEntry): Promise<void> {
  const payload: Record<string, any> = {
    id: s.id, full_name: s.fullName, phone: s.phone,
    amount: s.amount, calc_type: s.calcType,
    date_from: s.dateFrom, date_to: s.dateTo,
    notes: s.notes ?? null, created_at: s.createdAt,
  };
  if (s.bankName !== undefined) payload.bank_name = s.bankName || null;
  if (s.bankAccount !== undefined) payload.bank_account = s.bankAccount || null;
  if (s.bankAccountName !== undefined) payload.bank_account_name = s.bankAccountName || null;
  if (s.paidAmount !== undefined) payload.paid_amount = s.paidAmount;
  if (s.isPaidCash !== undefined) payload.is_paid_cash = s.isPaidCash;
  const { error } = await supabase.from('salary_entries').insert(payload);
  if (error) throw error;
}

export async function updateSalaryEntry(s: SalaryEntry): Promise<void> {
  const payload: Record<string, any> = {
    full_name: s.fullName, phone: s.phone, amount: s.amount,
    calc_type: s.calcType, date_from: s.dateFrom, date_to: s.dateTo,
    notes: s.notes ?? null, updated_at: new Date().toISOString(),
  };
  if (s.bankName !== undefined) payload.bank_name = s.bankName || null;
  if (s.bankAccount !== undefined) payload.bank_account = s.bankAccount || null;
  if (s.bankAccountName !== undefined) payload.bank_account_name = s.bankAccountName || null;
  if (s.paidAmount !== undefined) payload.paid_amount = s.paidAmount;
  if (s.isPaidCash !== undefined) payload.is_paid_cash = s.isPaidCash;
  const { error } = await supabase.from('salary_entries').update(payload).eq('id', s.id);
  if (error) throw error;
}

export async function deleteSalaryEntry(id: string): Promise<void> {
  const { error } = await supabase.from('salary_entries').delete().eq('id', id);
  if (error) throw error;
}

// ── Payment Logs ───────────────────────────────────────────────────────────────

export async function insertPaymentLog(log: PaymentLog): Promise<void> {
  const { error } = await supabase.from('payment_logs').insert({
    id: log.id,
    created_at: log.createdAt,
    type: log.type,
    reference_id: log.referenceId,
    reference_name: log.referenceName ?? null,
    amount: log.amount,
    payment_method: log.paymentMethod,
    remaining: log.remaining,
    notes: log.notes ?? null,
  });
  if (error) throw error;
}

export async function fetchPaymentLogs(): Promise<PaymentLog[]> {
  const { data, error } = await supabase
    .from('payment_logs')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(r => ({
    id: r.id,
    createdAt: r.created_at,
    type: r.type as 'debt' | 'salary',
    referenceId: r.reference_id,
    referenceName: r.reference_name ?? undefined,
    amount: r.amount,
    paymentMethod: r.payment_method as 'bank' | 'cash',
    remaining: r.remaining,
    notes: r.notes ?? undefined,
  }));
}

// ── Expenses ──────────────────────────────────────────────────────────────────

export async function fetchExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return data.map(r => ({
    id: r.id,
    code: r.code ?? undefined,
    expenseType: (r.expense_type ?? 'expense') as 'expense' | 'tax',
    content: r.content,
    amount: r.amount,
    notes: r.notes ?? undefined,
    date: r.date,
    createdAt: r.created_at,
  }));
}

export async function insertExpense(e: Expense): Promise<void> {
  const { error } = await supabase.from('expenses').insert({
    id: e.id,
    code: e.code ?? null,
    expense_type: e.expenseType ?? 'expense',
    content: e.content, amount: e.amount,
    notes: e.notes ?? null, date: e.date, created_at: e.createdAt,
  });
  if (error) throw error;
}

export async function updateExpense(e: Expense): Promise<void> {
  const { error } = await supabase.from('expenses').update({
    code: e.code ?? null,
    expense_type: e.expenseType ?? 'expense',
    content: e.content, amount: e.amount,
    notes: e.notes ?? null, date: e.date,
    updated_at: new Date().toISOString(),
  }).eq('id', e.id);
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from('expenses').delete().eq('id', id);
  if (error) throw error;
}

// ── Return Orders (Phiếu trả hàng) ───────────────────────────────────────────

export async function fetchReturnOrders(): Promise<ReturnOrder[]> {
  const { data, error } = await supabase
    .from('return_orders')
    .select('*, return_order_items(*)')
    .order('timestamp', { ascending: true });
  if (error) throw error;
  return data.map(r => ({
    id: r.id,
    invoiceId: r.invoice_id,
    timestamp: r.timestamp,
    items: (r.return_order_items ?? []).map((it: any): ReturnItem => ({
      productId: it.product_id ?? '',
      productName: it.product_name,
      sku: it.sku ?? '',
      quantity: it.quantity,
      unitPrice: it.unit_price,
    })),
    totalRefund: r.total_refund,
    notes: r.notes ?? undefined,
  }));
}

export async function insertReturnOrder(ro: ReturnOrder): Promise<void> {
  const { error: roErr } = await supabase.from('return_orders').insert({
    id: ro.id,
    invoice_id: ro.invoiceId,
    timestamp: ro.timestamp,
    total_refund: ro.totalRefund,
    notes: ro.notes ?? null,
  });
  if (roErr) throw roErr;

  if (ro.items.length > 0) {
    const { error: itemsErr } = await supabase.from('return_order_items').insert(
      ro.items.map(it => ({
        return_order_id: ro.id,
        product_id: it.productId,
        product_name: it.productName,
        sku: it.sku,
        quantity: it.quantity,
        unit_price: it.unitPrice,
      }))
    );
    if (itemsErr) throw itemsErr;
  }
}
