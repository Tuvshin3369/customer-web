-- customers: customer-web бүртгэл / нэвтрэлт (REST + anon key)
-- Table Editor нь ихэвчлэн service role ашиглах тул мөр харагдана; гэхдээ аппын anon
-- key-ээр SELECT хориглогдвол нэвтрэх GET хоосон буцаана.
--
-- DEV: доорхыг SQL Editor дээр ажиллуулж болно. PRODUCTION: бүх мөрийг anon-д
-- нээх нь password_hash задлах эрсдэлтэй — RPC / Edge Function + service_role илүү зөв.

-- Одоогийн policy-уудыг шалгана уу:
-- SELECT * FROM pg_policies WHERE tablename = 'customers';

-- Жишээ: anon INSERT (хэрэв бүртгэл ажиллахгүй бол)
-- CREATE POLICY "Allow anon insert customers"
--   ON public.customers FOR INSERT TO anon WITH CHECK (true);

-- Жишээ: anon SELECT бүх мөр (ЗӨВХӨН dev / дотоод туршилт)
-- CREATE POLICY "Allow anon select customers for login"
--   ON public.customers FOR SELECT TO anon USING (true);

-- RLS идэвхтэй эсэх:
-- ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;

-- Профайл шинэчлэх (customer-web PATCH): зөвхөн DEV / дотоод — anon-д бүх мөрийг
-- UPDATE нээх нь эрсдэлтэй. PRODUCTION-д RPC эсвэл JWT + RLS ашиглана.
-- CREATE POLICY "Allow anon update customers profile"
--   ON public.customers FOR UPDATE TO anon USING (true) WITH CHECK (true);
