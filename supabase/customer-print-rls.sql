-- Customer-web хэвлэх (sales + online_orders) — RLS жишээ
-- Supabase SQL Editor дээр ажиллуулна. Production-д customer_id-аар шүүх policy ашиглах нь зөв.

-- sales: нэвтэрсэн харилцагч өөрийн мөрүүдийг унших (худалдан авалтын түүх + хэвлэх)
drop policy if exists "customer_select_own_sales" on public.sales;
create policy "customer_select_own_sales"
  on public.sales for select to anon
  using (true);
-- PRODUCTION: using (customer_id = current_setting('app.customer_id', true)::uuid);

-- online_orders: өөрийн захиалга (аль хэдийн байж болно)
drop policy if exists "anon_can_select_online_orders" on public.online_orders;
create policy "anon_can_select_online_orders"
  on public.online_orders for select to anon
  using (true);

-- branches: хэвлэх блок (компани, банк, тамга)
drop policy if exists "anon_select_branches_for_print" on public.branches;
create policy "anon_select_branches_for_print"
  on public.branches for select to anon
  using (true);

-- employees: зөвхөн гарын үсэг (хэвлэл)
drop policy if exists "anon_select_employee_signature" on public.employees;
create policy "anon_select_employee_signature"
  on public.employees for select to anon
  using (true);

-- customers: хэвлэлийн харилцагчийн блок
drop policy if exists "anon_select_customers_for_print" on public.customers;
create policy "anon_select_customers_for_print"
  on public.customers for select to anon
  using (true);

-- products / coded_paints: embed select
drop policy if exists "anon_select_products_for_print" on public.products;
create policy "anon_select_products_for_print"
  on public.products for select to anon
  using (true);

drop policy if exists "anon_select_coded_paints_for_print" on public.coded_paints;
create policy "anon_select_coded_paints_for_print"
  on public.coded_paints for select to anon
  using (true);

-- marketing: хэвлэлийн доод мөр
drop policy if exists "anon_select_marketing_for_print" on public.marketing;
create policy "anon_select_marketing_for_print"
  on public.marketing for select to anon
  using (true);
