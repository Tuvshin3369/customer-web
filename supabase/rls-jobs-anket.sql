-- «Ажил» + Анкет (jobs, anket, anket_images) — customer-web anon key-д зориулсан RLS
-- Supabase SQL Editor дээр ажиллуулна.
--
-- Санамж: Frontend нь JWT-ийн customer id-гаар автоматаар хязгаарлахгүйгээр anon-оор уншиж бичих тул энд USING(true) ашигласан.
-- Илүү аюулгүй болгох: нэвтрэлт + auth.uid() → customers холбоо, эсвэл Edge Function + service_role.

-- ─── jobs: ажлын төрлийн жагсаалт (public) ─────────────────────────────────
alter table public.jobs enable row level security;

drop policy if exists "jobs_select_anon" on public.jobs;
create policy "jobs_select_anon"
  on public.jobs
  for select
  to anon
  using (true);

-- authenticated ашигладаг бол (сонголтууд):
-- drop policy if exists "jobs_select_authenticated" on public.jobs;
-- create policy "jobs_select_authenticated"
--   on public.jobs for select to authenticated using (true);

-- ─── anket: нийтийн ажилчдын директори + профайлоор оруулах ───────────────
alter table public.anket enable row level security;

drop policy if exists "anket_select_anon" on public.anket;
create policy "anket_select_anon"
  on public.anket
  for select
  to anon
  using (true);

drop policy if exists "anket_insert_anon" on public.anket;
create policy "anket_insert_anon"
  on public.anket
  for insert
  to anon
  with check (
    customers_id is not null
    and exists (select 1 from public.customers c where c.id = customers_id)
  );

drop policy if exists "anket_update_anon" on public.anket;
create policy "anket_update_anon"
  on public.anket
  for update
  to anon
  using (true)
  with check (true);

drop policy if exists "anket_delete_anon" on public.anket;
create policy "anket_delete_anon"
  on public.anket
  for delete
  to anon
  using (true);

-- Хэрэв танай анкет таблицаар `customer_id` багана ашигладаг бол дээрх insert policy-д түр солино:
-- with check (
--   customer_id is not null
--   and exists (select 1 from public.customers c where c.id = customer_id)
-- )

-- ─── anket_images: ажлын зургууд (select + DELETE/INSERT дамжлага) ────────────
alter table public.anket_images enable row level security;

drop policy if exists "anket_images_select_anon" on public.anket_images;
create policy "anket_images_select_anon"
  on public.anket_images
  for select
  to anon
  using (true);

drop policy if exists "anket_images_insert_anon" on public.anket_images;
create policy "anket_images_insert_anon"
  on public.anket_images
  for insert
  to anon
  with check (
    anket_id is not null
    and exists (select 1 from public.anket a where a.id = anket_id)
  );

drop policy if exists "anket_images_delete_anon" on public.anket_images;
create policy "anket_images_delete_anon"
  on public.anket_images
  for delete
  to anon
  using (true);
