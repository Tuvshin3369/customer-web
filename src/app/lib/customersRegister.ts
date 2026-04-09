/**
 * customers хүснэгтэд бүртгэл — admin-web-тай ижил bcrypt (10 rounds, $2b$...).
 *
 * Supabase RLS (заавал шалгана):
 * - INSERT: anon эсвэл public-д бүртгэл зөвшөөрөх policy хэрэгтэй.
 * - Нэвтрэх: клиент `password_hash`-тай мөрийг REST-ээр уншдаг тул `SELECT` policy
 *   эсвэл `SECURITY DEFINER` RPC шаардлагатай. SELECT хориглогдвол хайлт хоосон буцааж
 *   «Утасны дугаар эсвэл нууц үг буруу» гэж харагдана (мөр Table Editor-оор харагдаж болно).
 * Жишээ policy: `supabase/policies-customers-auth.sql` файлыг үзнэ үү.
 *
 * `is_individual`: шинэ бүртгэлд үргэлж false илгээнэ. true нь зөвхөн админы сонгосон
 * нэг хэрэглэгчид бааз дээр тохируулагдана (customer-web-ээс өөрчлөхгүй).
 */

function getSupabaseRest(): { restBase: string; anonKey: string } {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl?.trim() || !anonKey?.trim()) {
    throw new Error('Supabase тохиргоо (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) дутуу байна.');
  }
  return { restBase: supabaseUrl.replace(/\/$/, ''), anonKey: anonKey.trim() };
}

function restHeaders(anonKey: string): HeadersInit {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

async function parseJsonSafely(res: Response): Promise<unknown> {
  const raw = await res.text();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Утасны дугаарыг зөвхөн тоо болгон (DB int8). 976, +976, 0 эхлэлийг хялбар цэвэрлэнэ. */
export function phoneToInt64(phone: string): number {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return Number.NaN;
  let n = digits;
  if (n.length >= 11 && n.startsWith('976')) n = n.slice(3);
  if (n.length === 10 && n.startsWith('0')) n = n.slice(1);
  const num = Number(n);
  if (!Number.isFinite(num) || !Number.isInteger(num) || num < 0) return Number.NaN;
  if (num > Number.MAX_SAFE_INTEGER) return Number.NaN;
  return num;
}

async function customerExistsByPhone(restBase: string, anonKey: string, phone: number): Promise<boolean> {
  const q = new URLSearchParams({ select: 'id', phone: `eq.${phone}` });
  const res = await fetch(`${restBase}/rest/v1/customers?${q.toString()}`, {
    headers: restHeaders(anonKey),
  });
  const json = await parseJsonSafely(res);
  return Array.isArray(json) && json.length > 0;
}

async function customerExistsByGoogleId(restBase: string, anonKey: string, googleId: string): Promise<boolean> {
  const q = new URLSearchParams({ select: 'id', google_id: `eq.${googleId}` });
  const res = await fetch(`${restBase}/rest/v1/customers?${q.toString()}`, {
    headers: restHeaders(anonKey),
  });
  const json = await parseJsonSafely(res);
  return Array.isArray(json) && json.length > 0;
}

function messageFromPostgrest(json: unknown): string {
  if (json && typeof json === 'object' && 'message' in json && typeof (json as { message: string }).message === 'string') {
    return (json as { message: string }).message;
  }
  return '';
}

/** PostgREST / Supabase-ийн алдааны бүтцийг нэг мөр болгон задлах */
function formatPostgrestError(json: unknown, res: Response): string {
  const base = messageFromPostgrest(json);
  if (!json || typeof json !== 'object') {
    return base || `HTTP ${res.status}`;
  }
  const o = json as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof o.message === 'string' && o.message.trim()) parts.push(o.message.trim());
  if (typeof o.details === 'string' && o.details.trim()) parts.push(o.details.trim());
  if (typeof o.hint === 'string' && o.hint.trim()) parts.push(o.hint.trim());
  if (typeof o.code === 'string' && o.code.trim()) parts.push(`(код: ${o.code.trim()})`);
  const joined = parts.filter(Boolean).join(' — ');
  return joined || base || `HTTP ${res.status}`;
}

export async function registerCustomerWithPhone(params: {
  phone: string;
  password: string;
  organizationName?: string;
  register?: string;
}): Promise<void> {
  const { restBase, anonKey } = getSupabaseRest();
  const phoneNum = phoneToInt64(params.phone);
  if (Number.isNaN(phoneNum)) {
    throw new Error('Утасны дугаар буруу байна.');
  }

  if (await customerExistsByPhone(restBase, anonKey, phoneNum)) {
    throw new Error('Энэ утасны дугаар бүртгэлтэй байна.');
  }

  const { default: bcrypt } = await import('bcryptjs');
  const password_hash = await bcrypt.hash(params.password, 10);

  const orgName = params.organizationName?.trim() ?? '';
  const reg = params.register?.trim() ?? '';

  const body: Record<string, unknown> = {
    phone: phoneNum,
    password_hash,
    is_individual: false,
  };
  if (orgName) body.organization_name = orgName;
  if (reg) body.register = reg;

  const res = await fetch(`${restBase}/rest/v1/customers`, {
    method: 'POST',
    headers: { ...restHeaders(anonKey), Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const json = await parseJsonSafely(res);
    const msg = formatPostgrestError(json, res);
    if (res.status === 409 || /duplicate|unique/i.test(msg)) {
      throw new Error('Энэ утасны дугаар бүртгэлтэй байна.');
    }
    throw new Error(msg || `Бүртгэл амжилтгүй (${res.status}).`);
  }
}

/** Google OAuth-оор авсан `sub` (google_id) */
export async function registerCustomerWithGoogleId(googleId: string): Promise<void> {
  const { restBase, anonKey } = getSupabaseRest();
  if (!googleId.trim()) throw new Error('Google ID олдсонгүй.');

  if (await customerExistsByGoogleId(restBase, anonKey, googleId.trim())) {
    throw new Error('Энэ Google данс аль хэдийн бүртгэлтэй байна.');
  }

  const body: Record<string, unknown> = {
    google_id: googleId.trim(),
    is_individual: false,
  };

  const res = await fetch(`${restBase}/rest/v1/customers`, {
    method: 'POST',
    headers: { ...restHeaders(anonKey), Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const json = await parseJsonSafely(res);
    const msg = formatPostgrestError(json, res);
    if (res.status === 409 || /duplicate|unique/i.test(msg)) {
      throw new Error('Энэ Google данс аль хэдийн бүртгэлтэй байна.');
    }
    throw new Error(
      msg ||
        'Google-ээр бүртгэхэд алдаа гарлаа. DB дээр phone / password_hash заавал эсэхийг шалгана уу.',
    );
  }
}

/** Утас + нууц үгээр нэвтрэх — password_hash-ийг bcrypt.compare-оор шалгана. */
export async function verifyCustomerLogin(
  phoneInput: string,
  password: string,
): Promise<{ phone: number }> {
  const { restBase, anonKey } = getSupabaseRest();
  const phoneNum = phoneToInt64(phoneInput);
  if (Number.isNaN(phoneNum)) {
    throw new Error('Утасны дугаар буруу байна.');
  }
  const q = new URLSearchParams({
    select: 'phone,password_hash',
    phone: `eq.${phoneNum}`,
    limit: '1',
  });
  const res = await fetch(`${restBase}/rest/v1/customers?${q.toString()}`, {
    headers: restHeaders(anonKey),
  });
  const json = await parseJsonSafely(res);
  if (!res.ok) {
    throw new Error(formatPostgrestError(json, res) || 'Нэвтрэхэд алдаа гарлаа.');
  }
  if (!Array.isArray(json) || json.length === 0) {
    if (import.meta.env.DEV) {
      console.warn(
        '[customers] Нэвтрэх: хэрэглэгч олдсонгүй. Ихэнх тохиолдолд Supabase RLS нь anon SELECT-ийг хориглож байна. supabase/policies-customers-auth.sql эсвэл SECURITY DEFINER RPC ашиглана уу.',
      );
    }
    throw new Error('Утасны дугаар эсвэл нууц үг буруу байна.');
  }
  const row = json[0] as { phone?: number; password_hash?: string | null };
  if (!row.password_hash) {
    throw new Error('Утасны дугаар эсвэл нууц үг буруу байна.');
  }
  const { default: bcrypt } = await import('bcryptjs');
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    throw new Error('Утасны дугаар эсвэл нууц үг буруу байна.');
  }
  return { phone: row.phone ?? phoneNum };
}

export function formatCustomerPhoneDisplay(phone: number): string {
  return String(phone);
}

/** Профайл форм — баазтай харьцуулахад ашиглана (нэгжүүлсэн утгууд) */
export interface CustomerProfileSnapshot {
  additional_phone: string;
  organization_name: string;
  register: string;
}

function normDbText(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function normAdditionalPhoneFromDb(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/\D/g, '').slice(0, 16);
}

/** `customers.phone`-аар нэмэлт утас, байгууллага, регистрийг уншина (password_hash авахгүй). */
export async function fetchCustomerProfileByPhone(phone: number): Promise<CustomerProfileSnapshot> {
  const { restBase, anonKey } = getSupabaseRest();
  const q = new URLSearchParams({
    select: 'additional_phone,organization_name,register',
    phone: `eq.${phone}`,
    limit: '1',
  });
  const res = await fetch(`${restBase}/rest/v1/customers?${q.toString()}`, {
    headers: restHeaders(anonKey),
  });
  const json = await parseJsonSafely(res);
  if (!res.ok) {
    throw new Error(formatPostgrestError(json, res) || 'Мэдээлэл ачаалахад алдаа гарлаа.');
  }
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error('Хэрэглэгчийн мэдээлэл олдсонгүй.');
  }
  const row = json[0] as Record<string, unknown>;
  return {
    additional_phone: normAdditionalPhoneFromDb(row.additional_phone),
    organization_name: normDbText(row.organization_name),
    register: normDbText(row.register).toUpperCase(),
  };
}

/**
 * Зөвхөн өөрчлөгдсөн талбаруудыг PATCH хийнэ: additional_phone, organization_name, register, password_hash.
 * `newPassword` өгөгдсөн бол л password_hash шинэчлэгдэнэ (bcrypt 10).
 */
export async function updateCustomerProfileByPhone(params: {
  phone: number;
  baseline: CustomerProfileSnapshot;
  additional_phone: string;
  organization_name: string;
  register: string;
  newPassword?: string;
}): Promise<void> {
  const { restBase, anonKey } = getSupabaseRest();
  const patch: Record<string, unknown> = {};

  const addDigits = params.additional_phone.replace(/\D/g, '').slice(0, 16);
  if (addDigits !== params.baseline.additional_phone) {
    if (addDigits === '') {
      patch.additional_phone = null;
    } else {
      const n = Number(addDigits);
      patch.additional_phone =
        Number.isFinite(n) && Number.isInteger(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER
          ? n
          : addDigits;
    }
  }

  const org = params.organization_name.trim();
  if (org !== params.baseline.organization_name) {
    patch.organization_name = org === '' ? null : org;
  }

  const reg = params.register.trim().toUpperCase();
  if (reg !== params.baseline.register) {
    patch.register = reg === '' ? null : reg;
  }

  const pwd = params.newPassword?.trim() ?? '';
  if (pwd.length > 0) {
    const { default: bcrypt } = await import('bcryptjs');
    patch.password_hash = await bcrypt.hash(pwd, 10);
  }

  if (Object.keys(patch).length === 0) {
    return;
  }

  const q = new URLSearchParams({ phone: `eq.${params.phone}` });
  const res = await fetch(`${restBase}/rest/v1/customers?${q.toString()}`, {
    method: 'PATCH',
    headers: { ...restHeaders(anonKey), Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const json = await parseJsonSafely(res);
    throw new Error(formatPostgrestError(json, res) || 'Хадгалахад алдаа гарлаа.');
  }
}
