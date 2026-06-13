-- ============================================================
--  VietPOS / Bé Bự — Tạo cấu trúc database trên Supabase
-- ------------------------------------------------------------
--  CÁCH DÙNG:
--  1. Vào Supabase → chọn project của bạn
--  2. Bấm menu trái: "SQL Editor" → "New query"
--  3. Dán TOÀN BỘ nội dung file này vào, bấm "Run"
--  4. Xong! Quay lại app, bấm Redeploy là chạy được.
-- ============================================================


-- ── Bảng 1: Sản phẩm (kho hàng) ─────────────────────────────
create table if not exists public.products (
  id            text primary key,
  sku           text not null,
  name          text not null,
  brand         text not null default '',   -- Nhãn hiệu / thương hiệu
  category      text not null default '',
  cost_price    bigint not null default 0,   -- Giá nhập (VND)
  selling_price bigint not null default 0,   -- Giá bán (VND)
  stock         numeric(10,3) not null default 0,  -- Tồn kho (hỗ trợ tối đa 3 số thập phân)
  min_stock     numeric(10,3) not null default 0,  -- Định mức tồn tối thiểu
  unit          text not null default 'Cái',
  hidden        boolean not null default false, -- Ẩn khỏi màn Bán hàng
  barcode       text,                           -- Mã vạch riêng (khác SKU)
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Nếu bạn ĐÃ chạy bản schema cũ trước đây, chạy các dòng này để
-- nâng cấp bảng (an toàn, không mất dữ liệu):
alter table public.products add column if not exists brand   text    not null default '';
alter table public.products add column if not exists hidden  boolean not null default false;
alter table public.products add column if not exists barcode text;
alter table public.products alter column stock     type numeric(10,3) using stock::numeric;
alter table public.products alter column min_stock type numeric(10,3) using min_stock::numeric;
alter table public.invoice_items        alter column quantity type numeric(10,3) using quantity::numeric;
alter table public.purchase_order_items alter column quantity type numeric(10,3) using quantity::numeric;


-- ── Bảng 2: Thông tin cửa hàng (chỉ 1 dòng, id = 1) ─────────
create table if not exists public.store_config (
  id                integer primary key,     -- luôn là 1
  name              text not null default '',
  phone             text not null default '',
  address           text not null default '',
  bank_id           text not null default '',
  bank_account      text not null default '',
  bank_account_name text not null default '',
  updated_at        timestamptz not null default now()
);


-- ── Bảng 3: Hóa đơn ─────────────────────────────────────────
create table if not exists public.invoices (
  id               text primary key,
  timestamp        timestamptz not null default now(),
  total_amount     bigint not null default 0,   -- Tổng trước giảm giá
  discount_percent numeric not null default 0,  -- % giảm
  discount_amount  bigint not null default 0,   -- Số tiền giảm
  final_amount     bigint not null default 0,   -- Phải thanh toán
  payment_method   text not null default 'CASH',-- CASH | QR | CARD
  customer_name    text,
  customer_phone   text,
  created_at       timestamptz not null default now()
);


-- ── Bảng 4: Chi tiết từng dòng trong hóa đơn ────────────────
--  (khóa ngoại tới invoices để app lấy được dữ liệu lồng nhau)
create table if not exists public.invoice_items (
  id               bigserial primary key,
  invoice_id       text not null references public.invoices(id) on delete cascade,
  product_id       text,
  product_snapshot jsonb,        -- lưu lại sản phẩm tại thời điểm bán
  quantity         numeric(10,3) not null default 1,  -- Hỗ trợ tối đa 3 số thập phân (vd: 0,125 kg)
  unit_price       bigint not null default 0
);

create index if not exists idx_invoice_items_invoice_id
  on public.invoice_items(invoice_id);


-- ============================================================
--  PHÂN QUYỀN (quan trọng cho việc app đọc/ghi được)
-- ------------------------------------------------------------
--  Bật RLS rồi cho phép truy cập công khai để app chạy ngay.
--  ⚠️ Đây là mức "ai có link cũng đọc/ghi được" — ổn để chạy
--  thử và cho 1 cửa hàng nhỏ. Khi muốn bảo mật thật (nhiều
--  nhân viên, đăng nhập), hãy nhắn mình để siết quyền lại.
-- ============================================================

alter table public.products      enable row level security;
alter table public.store_config  enable row level security;
alter table public.invoices      enable row level security;
alter table public.invoice_items enable row level security;

create policy "public_all_products"      on public.products      for all using (true) with check (true);
create policy "public_all_store_config"  on public.store_config  for all using (true) with check (true);
create policy "public_all_invoices"      on public.invoices      for all using (true) with check (true);
create policy "public_all_invoice_items" on public.invoice_items for all using (true) with check (true);


-- ============================================================
--  MỞ RỘNG: Dữ liệu khách hàng, đối tác, xuất nhập hàng, lương
-- ============================================================

-- ── Bảng 5: Khách hàng ───────────────────────────────────────
create table if not exists public.customers (
  id          text primary key,
  full_name   text not null,
  birth_date  date,
  phone       text not null default '',
  email       text,
  address     text,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.customers add column if not exists address text;

-- ── Bảng 6: Đối tác / Nhà cung cấp ──────────────────────────
create table if not exists public.partners (
  id                text primary key,
  full_name         text not null,
  brands            text[] not null default '{}',
  phones            text[] not null default '{}',
  emails            text[] not null default '{}',
  address           text,
  bank_name         text,
  bank_account      text,
  bank_account_name text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.partners add column if not exists address           text;
alter table public.partners add column if not exists bank_name         text;
alter table public.partners add column if not exists bank_account      text;
alter table public.partners add column if not exists bank_account_name text;

-- ── Bảng 7: Phiếu nhập/xuất hàng ─────────────────────────────
create table if not exists public.purchase_orders (
  id           text primary key,
  type         text not null default 'import',  -- import | export
  partner_id   text references public.partners(id) on delete set null,
  partner_name text,
  timestamp    timestamptz not null default now(),
  total_amount bigint not null default 0,
  paid_amount   bigint not null default 0,
  notes         text,
  parent_id     text references public.purchase_orders(id) on delete set null, -- Phiếu gốc (nếu là bản điều chỉnh)
  revision_note text,                                                           -- Ghi chú thay đổi so với phiếu gốc
  created_at    timestamptz not null default now()
);

-- ── Bảng 8: Chi tiết từng dòng phiếu nhập/xuất ───────────────
create table if not exists public.purchase_order_items (
  id           bigserial primary key,
  order_id     text not null references public.purchase_orders(id) on delete cascade,
  product_id   text,
  product_name text not null,
  sku          text,
  quantity     numeric(10,3) not null default 1,  -- Hỗ trợ tối đa 3 số thập phân
  unit_cost    bigint not null default 0
);

create index if not exists idx_poi_order_id on public.purchase_order_items(order_id);

-- ── Bảng 9: Bảng lương nhân viên ─────────────────────────────
create table if not exists public.salary_entries (
  id                text primary key,
  full_name         text not null,
  phone             text not null default '',
  amount            bigint not null default 0,
  calc_type         text not null default 'lump',  -- lump (đợt) | daily (ngày)
  date_from         date not null,
  date_to           date not null,
  bank_name         text,
  bank_account      text,
  bank_account_name text,
  paid_amount       bigint not null default 0,
  is_paid_cash      boolean,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
alter table public.salary_entries add column if not exists bank_name         text;
alter table public.salary_entries add column if not exists bank_account      text;
alter table public.salary_entries add column if not exists bank_account_name text;
alter table public.salary_entries add column if not exists paid_amount       bigint not null default 0;
alter table public.salary_entries add column if not exists is_paid_cash      boolean;

-- Phân quyền cho các bảng mới
alter table public.customers            enable row level security;
alter table public.partners             enable row level security;
alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.salary_entries       enable row level security;

create policy "public_all_customers"    on public.customers            for all using (true) with check (true);
create policy "public_all_partners"     on public.partners             for all using (true) with check (true);
-- Nếu đã chạy schema cũ, thêm cột mới vào purchase_orders:
alter table public.purchase_orders add column if not exists parent_id     text references public.purchase_orders(id) on delete set null;
alter table public.purchase_orders add column if not exists revision_note text;

create policy "public_all_po"           on public.purchase_orders      for all using (true) with check (true);
create policy "public_all_poi"          on public.purchase_order_items for all using (true) with check (true);
create policy "public_all_salary"       on public.salary_entries       for all using (true) with check (true);

-- ── Bảng 10: Lịch sử thanh toán (công nợ & lương) ────────────
create table if not exists public.payment_logs (
  id               text primary key,
  created_at       timestamptz not null default now(),
  type             text not null,             -- 'debt' | 'salary'
  reference_id     text not null,             -- PO ID hoặc salary entry ID
  reference_name   text,                      -- Tên đối tác hoặc nhân viên
  amount           bigint not null default 0, -- Số tiền thanh toán lần này
  payment_method   text not null,             -- 'bank' | 'cash'
  remaining        bigint not null default 0, -- Còn nợ sau thanh toán
  notes            text                       -- Ghi chú (kỳ lương, v.v.)
);

alter table public.payment_logs enable row level security;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'payment_logs' AND policyname = 'public_all_payment_logs'
  ) THEN
    EXECUTE 'CREATE POLICY "public_all_payment_logs" ON public.payment_logs FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- ── Cột mở rộng cho invoices ──────────────────────────────────
alter table public.invoices add column if not exists notes          text;
alter table public.invoices add column if not exists status         text not null default 'completed';
alter table public.invoices add column if not exists payment_status text not null default 'paid';
alter table public.invoices add column if not exists is_adjusted    boolean not null default false;

-- ── Cột mở rộng cho products ──────────────────────────────────
alter table public.products add column if not exists image_url text;

-- Storage bucket hình ảnh sản phẩm
insert into storage.buckets (id, name, public)
  values ('product-images', 'product-images', true)
  on conflict (id) do nothing;

-- ── Bảng 11: Phiếu trả hàng (THxxxxx) ────────────────────────
create table if not exists public.return_orders (
  id            text primary key,               -- THxxxxx
  invoice_id    text not null references public.invoices(id) on delete restrict,
  timestamp     timestamptz not null default now(),
  total_refund  bigint not null default 0,
  notes         text,
  created_at    timestamptz not null default now()
);

-- ── Bảng 12: Chi tiết từng dòng phiếu trả hàng ───────────────
create table if not exists public.return_order_items (
  id               bigserial primary key,
  return_order_id  text not null references public.return_orders(id) on delete cascade,
  product_id       text,
  product_name     text not null,
  sku              text,
  quantity         numeric(10,3) not null default 1,
  unit_price       bigint not null default 0
);

create index if not exists idx_roi_return_order_id on public.return_order_items(return_order_id);

alter table public.return_orders      enable row level security;
alter table public.return_order_items enable row level security;

create policy "public_all_return_orders"      on public.return_orders      for all using (true) with check (true);
create policy "public_all_return_order_items" on public.return_order_items for all using (true) with check (true);
