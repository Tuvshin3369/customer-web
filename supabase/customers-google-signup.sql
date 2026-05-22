-- Google-ээр бүртгүүлэх: утасгүй бүртгэлд customers.phone заавал биш.
-- (Утас оруулсан Google бүртгэлд customer-web placeholder password_hash илгээнэ.)
-- Supabase SQL Editor дээр нэг удаа ажиллуулна.
--
-- Шалгах: SELECT column_name, is_nullable FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'customers' AND column_name IN ('phone', 'password_hash');

ALTER TABLE public.customers
  ALTER COLUMN phone DROP NOT NULL;

-- Утасны нууц үггүй бүртгэл (Google) — password_hash ч заавал биш болгох
ALTER TABLE public.customers
  ALTER COLUMN password_hash DROP NOT NULL;

-- Дор хаяж нэг нэвтрэх арга: утас эсвэл google_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'customers_phone_or_google_chk'
      AND conrelid = 'public.customers'::regclass
  ) THEN
    ALTER TABLE public.customers
      ADD CONSTRAINT customers_phone_or_google_chk
      CHECK (
        phone IS NOT NULL
        OR (google_id IS NOT NULL AND btrim(google_id::text) <> '')
      );
  END IF;
END $$;
