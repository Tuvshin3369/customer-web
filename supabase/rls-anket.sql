-- public.anket — RLS (customer-web anon key)
-- SQL Editor-д бүтнээр нь ажиллуулна.
--
-- customer-web (`anketApi.ts`):
--   GET  /anket               — SELECT (директори, job_ids шүүлт)
--   POST /anket               — INSERT (customers_id заавал)
--   PATCH /anket?customers_id — UPDATE
--   DELETE /anket?customers_id — DELETE

alter table public.anket enable row level security;

-- Өмнөх ижил нэртэй policy-г дахин ажиллуулахад саадгүй байлгана
drop policy if exists "anket_select_anon" on public.anket;
drop policy if exists "anket_insert_anon" on public.anket;
drop policy if exists "anket_update_anon" on public.anket;
drop policy if exists "anket_delete_anon" on public.anket;

-- Ижил нэртэй policy өмнө нэмэгдсэн бол дээр drop-оор арилах

-- Унших: «Ажил» хэсэг, ажилтны жагсаалт
create policy "anket_select_anon"
  on public.anket
  for select
  to anon
  using (true);

-- Шинээр анкет (зөвхөн бүртгэлтэй customers.id-тай байвал)
create policy "anket_insert_anon"
  on public.anket
  for insert
  to anon
  with check (
    customers_id is not null
    and exists (
      select 1
      from public.customers c
      where c.id = customers_id
    )
  );

-- Өөрийн анкетыг шинэчлөх (URL filter: customers_id=eq.uuid)
create policy "anket_update_anon"
  on public.anket
  for update
  to anon
  using (true)
  with check (true);

-- Устгал
create policy "anket_delete_anon"
  on public.anket
  for delete
  to anon
  using (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- Аль нэг INSERT алдаатай бол FK баганы нэр шалга: зарим суурьт `customer_id`-тай байдаг.
-- Тэгвэл доорхыг хэрэглэж өмнөх insert policy устгаад солино:
--
-- drop policy if exists "anket_insert_anon" on public.anket;
-- create policy "anket_insert_anon"
--   on public.anket for insert to anon
--   with check (
--     customer_id is not null
--     and exists (select 1 from public.customers c where c.id = customer_id)
--   );
