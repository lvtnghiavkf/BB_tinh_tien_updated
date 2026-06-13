import React, { useState, useEffect } from 'react';
import { Customer, Partner, PurchaseOrder, Invoice, Product, PaymentLog, ReturnOrder } from '../types';
import {
  fetchCustomers, insertCustomer, updateCustomer, deleteCustomer,
  fetchPartners, insertPartner, updatePartner, deletePartner,
  fetchPaymentLogs,
} from '../lib/db';
import Customers from './Customers';
import Partners from './Partners';
import PurchaseOrders from './PurchaseOrders';
import Invoices from './Invoices';
import { Users, Handshake, ChevronsUpDown, AlertCircle, FileText } from 'lucide-react';

interface DataProps {
  invoices: Invoice[];
  products: Product[];
  returnOrders: ReturnOrder[];
  purchaseOrders: PurchaseOrder[];
  onAddPurchaseOrder: (o: PurchaseOrder) => Promise<void>;
  onUpdatePurchaseOrder: (o: PurchaseOrder) => Promise<void>;
  onDeletePurchaseOrder: (id: string) => Promise<void>;
  onUpdateProductsStock: (updates: { id: string; delta: number }[]) => void;
  onUpdateInvoice?: (inv: Invoice) => Promise<void>;
  onAddReturnOrder?: (ro: ReturnOrder) => Promise<void>;
  onPrintInvoice?: (inv: Invoice) => void;
}

type SubTab = 'customers' | 'partners' | 'orders' | 'invoices';

export default function Data({ invoices, products, returnOrders, purchaseOrders, onAddPurchaseOrder, onUpdatePurchaseOrder, onDeletePurchaseOrder, onUpdateProductsStock, onUpdateInvoice, onAddReturnOrder, onPrintInvoice }: DataProps) {
  const [subTab, setSubTab] = useState<SubTab>('customers');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [partners, setPartners] = useState<Partner[]>([]);
  const [paymentLogs, setPaymentLogs] = useState<PaymentLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      setLoading(true);
      setError('');
      try {
        const [c, p, logs] = await Promise.all([fetchCustomers(), fetchPartners(), fetchPaymentLogs().catch(() => [] as PaymentLog[])]);
        setCustomers(c);
        setPartners(p);
        setPaymentLogs(logs);
      } catch (err: any) {
        setError('Không thể tải dữ liệu. Hãy chạy lại supabase_setup.sql trên Supabase SQL Editor.');
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  // Customer handlers
  async function handleAddCustomer(c: Customer) {
    await insertCustomer(c);
    setCustomers(prev => [...prev, c]);
  }
  async function handleUpdateCustomer(c: Customer) {
    await updateCustomer(c);
    setCustomers(prev => prev.map(x => x.id === c.id ? c : x));
  }
  async function handleDeleteCustomer(id: string) {
    await deleteCustomer(id);
    setCustomers(prev => prev.filter(x => x.id !== id));
  }

  // Partner handlers
  async function handleAddPartner(p: Partner) {
    await insertPartner(p);
    setPartners(prev => [...prev, p]);
  }
  async function handleUpdatePartner(p: Partner) {
    await updatePartner(p);
    setPartners(prev => prev.map(x => x.id === p.id ? p : x));
  }
  async function handleDeletePartner(id: string) {
    await deletePartner(id);
    setPartners(prev => prev.filter(x => x.id !== id));
  }

  const tabs: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: 'customers', label: 'Khách hàng', icon: <Users className="w-4 h-4" /> },
    { id: 'partners', label: 'Đối tác', icon: <Handshake className="w-4 h-4" /> },
    { id: 'orders', label: 'Xuất nhập hàng', icon: <ChevronsUpDown className="w-4 h-4" /> },
    { id: 'invoices', label: 'Hóa đơn', icon: <FileText className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Dữ liệu</h1>
        <p className="text-slate-500 text-sm mt-1">Quản lý khách hàng, đối tác và phiếu xuất nhập hàng.</p>
      </div>

      {/* Sub-tabs */}
      <div className="flex border border-slate-200 rounded-xl bg-white p-1 self-start shadow-xs w-full sm:w-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={`flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-5 py-2 text-xs font-bold rounded-lg transition cursor-pointer whitespace-nowrap ${subTab === t.id ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <p className="ml-3 text-slate-500 text-sm">Đang tải dữ liệu...</p>
        </div>
      ) : error ? (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-rose-700 text-sm">Lỗi tải dữ liệu</p>
            <p className="text-rose-600 text-xs mt-1">{error}</p>
          </div>
        </div>
      ) : (
        <>
          {subTab === 'customers' && (
            <Customers customers={customers} invoices={invoices}
              onAdd={handleAddCustomer} onUpdate={handleUpdateCustomer} onDelete={handleDeleteCustomer} />
          )}
          {subTab === 'partners' && (
            <Partners partners={partners} purchaseOrders={purchaseOrders}
              onAdd={handleAddPartner} onUpdate={handleUpdatePartner} onDelete={handleDeletePartner}
              onUpdateOrder={onUpdatePurchaseOrder}
              onPaymentLogAdded={log => setPaymentLogs(prev => [log, ...prev])} />
          )}
          {subTab === 'orders' && (
            <PurchaseOrders products={products} partners={partners} orders={purchaseOrders}
              onAdd={onAddPurchaseOrder} onUpdate={onUpdatePurchaseOrder} onDelete={onDeletePurchaseOrder}
              onUpdateProductsStock={onUpdateProductsStock}
              paymentLogs={paymentLogs}
              onPaymentLogAdded={log => setPaymentLogs(prev => [log, ...prev])} />
          )}
          {subTab === 'invoices' && onUpdateInvoice && onPrintInvoice && onAddReturnOrder && (
            <Invoices
              invoices={invoices}
              products={products}
              returnOrders={returnOrders}
              onUpdateInvoice={onUpdateInvoice}
              onPrintInvoice={onPrintInvoice}
              onAddReturnOrder={onAddReturnOrder}
              onUpdateProductsStock={onUpdateProductsStock}
            />
          )}
          {subTab === 'invoices' && (!onUpdateInvoice || !onPrintInvoice) && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-amber-700 text-sm">
              Không thể tải module hóa đơn. Vui lòng kiểm tra lại cấu hình.
            </div>
          )}
        </>
      )}
    </div>
  );
}
