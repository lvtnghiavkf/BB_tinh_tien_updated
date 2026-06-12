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
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Nếu bạn ĐÃ chạy bản schema cũ trước đây, chạy các dòng này để
-- nâng cấp bảng (an toàn, không mất dữ liệu):
alter table public.products add column if not exists brand  text    not null default '';
alter table public.products add column if not exists hidden boolean not null default false;
alter table public.products alter column stock     type numeric(10,3) using stock::numeric;
alter table public.products alter column min_stock type numeric(10,3) using min_stock::numeric;
alter table public.invoice_items       alter column quantity type numeric(10,3) using quantity::numeric;
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
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Bảng 6: Đối tác / Nhà cung cấp ──────────────────────────
create table if not exists public.partners (
  id          text primary key,
  full_name   text not null,
  brands      text[] not null default '{}',
  phones      text[] not null default '{}',
  emails      text[] not null default '{}',
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Bảng 7: Phiếu nhập/xuất hàng ─────────────────────────────
create table if not exists public.purchase_orders (
  id           text primary key,
  type         text not null default 'import',  -- import | export
  partner_id   text references public.partners(id) on delete set null,
  partner_name text,
  timestamp    timestamptz not null default now(),
  total_amount bigint not null default 0,
  paid_amount  bigint not null default 0,
  notes        text,
  created_at   timestamptz not null default now()
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
  id          text primary key,
  full_name   text not null,
  phone       text not null default '',
  amount      bigint not null default 0,
  calc_type   text not null default 'lump',  -- lump (đợt) | daily (ngày)
  date_from   date not null,
  date_to     date not null,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Phân quyền cho các bảng mới
alter table public.customers            enable row level security;
alter table public.partners             enable row level security;
alter table public.purchase_orders      enable row level security;
alter table public.purchase_order_items enable row level security;
alter table public.salary_entries       enable row level security;

create policy "public_all_customers"    on public.customers            for all using (true) with check (true);
create policy "public_all_partners"     on public.partners             for all using (true) with check (true);
create policy "public_all_po"           on public.purchase_orders      for all using (true) with check (true);
create policy "public_all_poi"          on public.purchase_order_items for all using (true) with check (true);
create policy "public_all_salary"       on public.salary_entries       for all using (true) with check (true);
