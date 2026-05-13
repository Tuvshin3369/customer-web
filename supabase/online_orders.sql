-- Supabase SQL editor: үүсээгүй `online_orders` хүснэгтийн жишээ.
-- Аль хэдийн ижил бүтэцтэй хүснэгтэй бол энийг алгасаж зөвхөн RLS policy нэмнэ үү.

create table if not exists public.online_orders (
  id uuid primary key default gen_random_uuid (),
  store_id uuid not null references public.stores (id),
  sales_type boolean not null default true,
  customer_id uuid not null references public.customers (id),
  product_id uuid not null references public.products (id),
  coded_paint_id uuid references public.coded_paints (id),
  coded_price integer,
  service_price integer,
  product_number numeric not null,
  -- Өнгийн код оруулсан эсэх
  is_pigment boolean not null default false,
  received_price bigint,
  system_price bigint not null,
  sold_price bigint not null,
  foam_size text,
  length_meter numeric,
  ecommerce_phone bigint not null,
  ecommerce_name text,
  ecommerce_register text,
  is_delivery boolean not null default false,
  delivery_type text,
  ecommerce_delivery_location_lat double precision,
  ecommerce_delivery_location_lng double precision,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  note text
);

alter table public.online_orders enable row level security;

-- Customer-web нь anon key-тэй REST INSERT хийнэ:
drop policy if exists "anon_can_insert_online_orders" on public.online_orders;
create policy "anon_can_insert_online_orders" on public.online_orders for insert to anon with check (true);

-- Аль хэдийн байгаа хүснэгтэд is_pigment нэмэх:
-- alter table public.online_orders add column if not exists is_pigment boolean not null default false;
