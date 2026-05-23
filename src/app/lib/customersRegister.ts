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

const customerSelectHeaders = (anonKey: string): HeadersInit => ({
  apikey: anonKey,
  Authorization: `Bearer ${anonKey}`,
  Accept: 'application/json',
});

function firstCustomerIdFromResponse(json: unknown): string | null {
  if (!Array.isArray(json) || json.length === 0) return null;
  const id = (json[0] as Record<string, unknown>).id;
  return id != null && String(id).trim() ? String(id).trim() : null;
}

/**
 * `online_orders.customer_id`: нэвтэрсэн бол тухайн customers.id, эсрэг тохиолдолд
 * `customers.is_individual = true` анхны мөрийг (дотоод «зочин») ашиглана.
 */
export async function resolveCustomerIdForOnlineOrder(params: {
  isLoggedIn: boolean;
  phone: number | null;
  googleId: string | null;
}): Promise<string> {
  const { restBase, anonKey } = getSupabaseRest();
  const headers = customerSelectHeaders(anonKey);

  if (params.isLoggedIn) {
    const gid = params.googleId?.trim();
    if (gid) {
      const q = new URLSearchParams({ select: 'id', google_id: `eq.${gid}`, limit: '1' });
      const res = await fetch(`${restBase}/rest/v1/customers?${q}`, { headers });
      const json = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(formatPostgrestError(json, res) || 'Хэрэглэгчийн мэдээлэл уншихад алдаа.');
      }
      const id = firstCustomerIdFromResponse(json);
      if (id) return id;
      throw new Error('Нэвтэрсэн хэрэглэгчийн бүртгэл олдсонгүй.');
    }
    const phone = params.phone;
    if (phone != null && Number.isFinite(phone) && Number.isInteger(phone) && phone > 0) {
      const q = new URLSearchParams({ select: 'id', phone: `eq.${phone}`, limit: '1' });
      const res = await fetch(`${restBase}/rest/v1/customers?${q}`, { headers });
      const json = await parseJsonSafely(res);
      if (!res.ok) {
        throw new Error(formatPostgrestError(json, res) || 'Хэрэглэгчийн мэдээлэл уншихад алдаа.');
      }
      const id = firstCustomerIdFromResponse(json);
      if (id) return id;
      throw new Error('Нэвтэрсэн хэрэглэгчийн утасны бүртгэл олдсонгүй.');
    }
    throw new Error('Нэвтрэлтийн мэдээлэл дутуу байна.');
  }

  const q = new URLSearchParams({ select: 'id', is_individual: 'eq.true', limit: '1' });
  const res = await fetch(`${restBase}/rest/v1/customers?${q}`, { headers });
  const json = await parseJsonSafely(res);
  if (!res.ok) {
    throw new Error(formatPostgrestError(json, res) || '«Хувь хүн» бүртгэл уншихад алдаа.');
  }
  const id = firstCustomerIdFromResponse(json);
  if (id) return id;
  throw new Error(
    '«Хувь хүн» үйлчлэгчийн бүртгэл (customers.is_individual=true) олдсонгүй.',
  );
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

export type RegisterCustomerWithGoogleOptions = {
  /** Заавал биш — оруулсан бол холбоно */
  phone?: string;
  organizationName?: string;
  register?: string;
};

/** Google OAuth-оор авсан `sub` (google_id). Утас, нууц үг заавал биш. */
export async function registerCustomerWithGoogleId(
  googleId: string,
  opts?: RegisterCustomerWithGoogleOptions,
): Promise<void> {
  const { restBase, anonKey } = getSupabaseRest();
  if (!googleId.trim()) throw new Error('Google ID олдсонгүй.');

  if (await customerExistsByGoogleId(restBase, anonKey, googleId.trim())) {
    throw new Error('Энэ Google данс аль хэдийн бүртгэлтэй байна.');
  }

  const body: Record<string, unknown> = {
    google_id: googleId.trim(),
    is_individual: false,
  };

  const phoneRaw = opts?.phone?.trim() ?? '';
  if (phoneRaw) {
    const phoneNum = phoneToInt64(phoneRaw);
    if (Number.isNaN(phoneNum)) {
      throw new Error('Утасны дугаар буруу байна.');
    }
    if (await customerExistsByPhone(restBase, anonKey, phoneNum)) {
      throw new Error('Энэ утасны дугаар бүртгэлтэй байна.');
    }
    body.phone = phoneNum;
  }

  const orgName = opts?.organizationName?.trim() ?? '';
  const reg = opts?.register?.trim() ?? '';
  if (orgName) body.organization_name = orgName;
  if (reg) body.register = reg;

  /** DB-д password_hash NOT NULL үед — зөвхөн Google-ээр нэвтэрнэ, утасны нууц ашиглахгүй */
  const { default: bcrypt } = await import('bcryptjs');
  body.password_hash = await bcrypt.hash(`google-oauth:${googleId.trim()}`, 10);

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
    if (/null value in column "phone"/i.test(msg)) {
      throw new Error(
        'Утасны дугааргүй Google бүртгэлд Supabase SQL Editor дээр supabase/customers-google-signup.sql ажиллуулна уу.',
      );
    }
    if (/null value in column "password_hash"/i.test(msg)) {
      throw new Error(
        'password_hash заавал байх тохиргоо үлдсэн байна. Дахин оролдоно уу; эсвэл customers-google-signup.sql ажиллуулна уу.',
      );
    }
    throw new Error(msg || `Google-ээр бүртгэхэд алдаа гарлаа (${res.status}).`);
  }
}

/**
 * Нэвтрэхийн үед оруулсан нууц утасны дигитийн хэлбэртэй давтагдана эсэх —
 * ажилтан анх утасны дугаарыг нууц болгож bcrypt хийдэг тохиолдолд.
 */
export function loginPasswordMatchesStoredPhoneCredential(
  loginPassword: string,
  phoneDb: number,
): boolean {
  const pw = loginPassword.replace(/\D/g, '');
  const ph = String(phoneDb).replace(/\D/g, '');
  if (pw.length < 6 || ph.length < 6) return false;

  const normalize = (digits: string, other: string) => {
    let x = digits;
    if (x.startsWith('976')) x = x.slice(3);
    const otherNo976 = other.startsWith('976') ? other.slice(3) : other;
    while (x.startsWith('0') && x.length > otherNo976.replace(/^0+/, '').length) {
      x = x.slice(1);
    }
    return x.replace(/^0+/, '') || '0';
  };

  const pwC = normalize(pw, ph);
  const phC = normalize(ph, pw);
  if (pwC === phC) return true;
  if (pwC.length >= 8 && phC.length >= 8 && pwC.slice(-8) === phC.slice(-8)) return true;
  if (pwC.endsWith(phC) && phC.length >= 8) return true;
  if (phC.endsWith(pwC) && pwC.length >= 8) return true;
  return false;
}

/** Хуучин нууц үгийн зөв эсэхийг bcrypt-ээр шалгана. */
export async function verifyCustomerPasswordForPhone(
  phone: number,
  password: string,
): Promise<boolean> {
  const { restBase, anonKey } = getSupabaseRest();
  const q = new URLSearchParams({
    select: 'password_hash',
    phone: `eq.${phone}`,
    limit: '1',
  });
  const res = await fetch(`${restBase}/rest/v1/customers?${q.toString()}`, {
    headers: restHeaders(anonKey),
  });
  const json = await parseJsonSafely(res);
  if (!res.ok || !Array.isArray(json) || json.length === 0) return false;
  const hash = (json[0] as { password_hash?: string | null }).password_hash;
  if (!hash || typeof hash !== 'string') return false;
  const { default: bcrypt } = await import('bcryptjs');
  return bcrypt.compare(password, hash);
}

/** Утас + нууц үгээр нэвтрэх — password_hash-ийг bcrypt.compare-оор шалгана. */
export async function verifyCustomerLogin(
  phoneInput: string,
  password: string,
): Promise<{ phone: number; isWorker: boolean; usesDefaultPhonePassword: boolean }> {
  const { restBase, anonKey } = getSupabaseRest();
  const phoneNum = phoneToInt64(phoneInput);
  if (Number.isNaN(phoneNum)) {
    throw new Error('Утасны дугаар буруу байна.');
  }
  const q = new URLSearchParams({
    select: 'phone,password_hash,is_worker',
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
  const row = json[0] as { phone?: number; password_hash?: string | null; is_worker?: unknown };
  if (!row.password_hash) {
    throw new Error('Утасны дугаар эсвэл нууц үг буруу байна.');
  }
  const { default: bcrypt } = await import('bcryptjs');
  const ok = await bcrypt.compare(password, row.password_hash);
  if (!ok) {
    throw new Error('Утасны дугаар эсвэл нууц үг буруу байна.');
  }
  const resolvedPhone = row.phone ?? phoneNum;
  const usesDefaultPhonePassword = loginPasswordMatchesStoredPhoneCredential(password, resolvedPhone);
  return { phone: resolvedPhone, isWorker: row.is_worker === true, usesDefaultPhonePassword };
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

function mapRowToProfileSnapshot(row: Record<string, unknown>): CustomerProfileSnapshot {
  return {
    additional_phone: normAdditionalPhoneFromDb(row.additional_phone),
    organization_name: normDbText(row.organization_name),
    register: normDbText(row.register).toUpperCase(),
  };
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
  return mapRowToProfileSnapshot(json[0] as Record<string, unknown>);
}

/** `customers.google_id`-аар ижил талбаруудыг уншина. */
export async function fetchCustomerProfileByGoogleId(googleId: string): Promise<CustomerProfileSnapshot> {
  const { restBase, anonKey } = getSupabaseRest();
  const id = googleId.trim();
  if (!id) throw new Error('Google ID олдсонгүй.');
  const q = new URLSearchParams({
    select: 'additional_phone,organization_name,register',
    google_id: `eq.${id}`,
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
  return mapRowToProfileSnapshot(json[0] as Record<string, unknown>);
}

/** Google-ээр нэвтрэх: мөр байгаа эсэх + `is_worker` (Анкет цэс). */
export async function verifyGoogleCustomerLogin(googleId: string): Promise<{ isWorker: boolean }> {
  const { restBase, anonKey } = getSupabaseRest();
  const id = googleId.trim();
  if (!id) throw new Error('Google ID олдсонгүй.');
  const q = new URLSearchParams({
    select: 'is_worker',
    google_id: `eq.${id}`,
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
    throw new Error('Энэ Google дансаар бүртгэл байхгүй байна. Эхлээд бүртгүүлнэ үү.');
  }
  const row = json[0] as { is_worker?: unknown };
  return { isWorker: row.is_worker === true };
}

function buildProfileFieldsPatch(
  baseline: CustomerProfileSnapshot,
  additional_phone: string,
  organization_name: string,
  register: string,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  const addDigits = additional_phone.replace(/\D/g, '').slice(0, 16);
  const baseAdd = baseline.additional_phone.replace(/\D/g, '').slice(0, 16);
  if (addDigits !== baseAdd) {
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

  const org = organization_name.trim();
  if (org !== baseline.organization_name) {
    patch.organization_name = org === '' ? null : org;
  }

  const reg = register.trim().toUpperCase();
  if (reg !== baseline.register) {
    patch.register = reg === '' ? null : reg;
  }

  return patch;
}

async function patchCustomerRow(
  restBase: string,
  anonKey: string,
  filter: URLSearchParams,
  patch: Record<string, unknown>,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  const res = await fetch(`${restBase}/rest/v1/customers?${filter.toString()}`, {
    method: 'PATCH',
    headers: { ...restHeaders(anonKey), Prefer: 'return=minimal' },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const json = await parseJsonSafely(res);
    throw new Error(formatPostgrestError(json, res) || 'Хадгалахад алдаа гарлаа.');
  }
}

/**
 * Зөвхөн өөрчлөгдсөн талбаруудыг PATCH: additional_phone, organization_name, register (нууц үггүй).
 */
export async function updateCustomerProfileByGoogleId(params: {
  googleId: string;
  baseline: CustomerProfileSnapshot;
  additional_phone: string;
  organization_name: string;
  register: string;
}): Promise<void> {
  const { restBase, anonKey } = getSupabaseRest();
  const id = params.googleId.trim();
  if (!id) throw new Error('Google ID олдсонгүй.');
  const patch = buildProfileFieldsPatch(
    params.baseline,
    params.additional_phone,
    params.organization_name,
    params.register,
  );
  const q = new URLSearchParams({ google_id: `eq.${id}` });
  await patchCustomerRow(restBase, anonKey, q, patch);
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
  const patch = buildProfileFieldsPatch(
    params.baseline,
    params.additional_phone,
    params.organization_name,
    params.register,
  );

  const pwd = params.newPassword?.trim() ?? '';
  if (pwd.length > 0) {
    const { default: bcrypt } = await import('bcryptjs');
    patch.password_hash = await bcrypt.hash(pwd, 10);
  }

  if (Object.keys(patch).length === 0) {
    return;
  }

  const q = new URLSearchParams({ phone: `eq.${params.phone}` });
  await patchCustomerRow(restBase, anonKey, q, patch);
}
