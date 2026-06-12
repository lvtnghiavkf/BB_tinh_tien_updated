import { supabase } from './supabase';
import { Product, Invoice, StoreConfig, PaymentMethod, Customer, Partner, PurchaseOrder, PurchaseOrderItem, SalaryEntry } from '../types';

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
  // Only include barcode if the value is explicitly set (column may not exist yet)
  if (p.barcode !== undefined) payload.barcode = p.barcode || null;
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
  // Only include barcode if the value is explicitly set (column may not exist yet)
  if (p.barcode !== undefined) payload.barcode = p.barcode || null;
  const { error } = await supabase.from('products').update(payload).eq('id', p.id);
  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
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
    fullName: r.full_name,
    birthDate: r.birth_date ?? undefined,
    phone: r.phone ?? '',
    email: r.email ?? undefined,
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function insertCustomer(c: Customer): Promise<void> {
  const { error } = await supabase.from('customers').insert({
    id: c.id,
    full_name: c.fullName,
    birth_date: c.birthDate ?? null,
    phone: c.phone,
    email: c.email ?? null,
    notes: c.notes ?? null,
    created_at: c.createdAt,
  });
  if (error) throw error;
}

export async function updateCustomer(c: Customer): Promise<void> {
  const { error } = await supabase.from('customers').update({
    full_name: c.fullName,
    birth_date: c.birthDate ?? null,
    phone: c.phone,
    email: c.email ?? null,
    notes: c.notes ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', c.id);
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
    fullName: r.full_name,
    brands: r.brands ?? [],
    phones: r.phones ?? [],
    emails: r.emails ?? [],
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function insertPartner(p: Partner): Promise<void> {
  const { error } = await supabase.from('partners').insert({
    id: p.id,
    full_name: p.fullName,
    brands: p.brands,
    phones: p.phones,
    emails: p.emails,
    notes: p.notes ?? null,
    created_at: p.createdAt,
  });
  if (error) throw error;
}

export async function updatePartner(p: Partner): Promise<void> {
  const { error } = await supabase.from('partners').update({
    full_name: p.fullName,
    brands: p.brands,
    phones: p.phones,
    emails: p.emails,
    notes: p.notes ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', p.id);
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
    notes: r.notes ?? undefined,
    createdAt: r.created_at,
  }));
}

export async function insertSalaryEntry(s: SalaryEntry): Promise<void> {
  const { error } = await supabase.from('salary_entries').insert({
    id: s.id,
    full_name: s.fullName,
    phone: s.phone,
    amount: s.amount,
    calc_type: s.calcType,
    date_from: s.dateFrom,
    date_to: s.dateTo,
    notes: s.notes ?? null,
    created_at: s.createdAt,
  });
  if (error) throw error;
}

export async function updateSalaryEntry(s: SalaryEntry): Promise<void> {
  const { error } = await supabase.from('salary_entries').update({
    full_name: s.fullName,
    phone: s.phone,
    amount: s.amount,
    calc_type: s.calcType,
    date_from: s.dateFrom,
    date_to: s.dateTo,
    notes: s.notes ?? null,
    updated_at: new Date().toISOString(),
  }).eq('id', s.id);
  if (error) throw error;
}

export async function deleteSalaryEntry(id: string): Promise<void> {
  const { error } = await supabase.from('salary_entries').delete().eq('id', id);
  if (error) throw error;
}
