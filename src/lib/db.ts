import { supabase } from './supabase';
import { Product, Invoice, StoreConfig, PaymentMethod } from '../types';

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
  }));
}

export async function insertProduct(p: Product): Promise<void> {
  const { error } = await supabase.from('products').insert({
    id: p.id,
    sku: p.sku,
    name: p.name,
    brand: p.brand ?? '',
    category: p.category,
    cost_price: p.costPrice,
    selling_price: p.sellingPrice,
    stock: p.stock,
    min_stock: p.minStock,
    unit: p.unit,
    hidden: p.hidden ?? false,
  });
  if (error) throw error;
}

export async function updateProduct(p: Product): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({
      sku: p.sku,
      name: p.name,
      brand: p.brand ?? '',
      category: p.category,
      cost_price: p.costPrice,
      selling_price: p.sellingPrice,
      stock: p.stock,
      min_stock: p.minStock,
      unit: p.unit,
      hidden: p.hidden ?? false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', p.id);
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
