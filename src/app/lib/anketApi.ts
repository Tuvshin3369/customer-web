/**
 * Анкет (anket) + jobs — Supabase REST (anon key).
 *
 * Хүлээгдэх загвар:
 * - jobs: id uuid PK, name text
 * - anket: id uuid PK, customers_id uuid UNIQUE REFERENCES customers(id),
 *   profile_image text (зөвхөн богино URL; base64 биш),
 *   name, phone, job_ids, work_experience
 * - anket_images: id uuid, anket_id uuid REFERENCES anket(id), image_url text, created_at
 *
 * Ажлын зургууд `anket.images` багана биш, `anket_images` хүснэгтэд хадгалагдана.
 * Зургууд Supabase Storage (VITE_SUPABASE_ANKET_BUCKET, анхдагч anket) руу оруулагдаж,
 * DB-д зөвхөн public URL үлдэнэ.
 *
 * RLS: worker хэрэглэгч өөрийн customers_id мөрийг SELECT/INSERT/UPDATE/DELETE.
 */

function getSupabaseRest(): { restBase: string; anonKey: string } {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl?.trim() || !anonKey?.trim()) {
    throw new Error('Supabase тохиргоо (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) дутуу байна.');
  }
  return { restBase: supabaseUrl.replace(/\/$/, ''), anonKey: anonKey.trim() };
}

function getAnketStorageBucket(): string {
  const b = (import.meta.env.VITE_SUPABASE_ANKET_BUCKET as string | undefined)?.trim();
  return b && b.length > 0 ? b : 'anket';
}

function encodeStorageObjectPath(path: string): string {
  return path.split('/').filter(Boolean).map(encodeURIComponent).join('/');
}

function mimeToFileExt(mime: string): string {
  const m = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  if (m === 'image/gif') return 'gif';
  return 'bin';
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } | null {
  const m = /^data:([^;,]+);base64,(.+)$/s.exec(dataUrl.trim());
  if (!m) return null;
  const mime = m[1].trim();
  const b64 = m[2].replace(/\s/g, '');
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return { bytes, mime };
  } catch {
    return null;
  }
}

function publicStorageObjectUrl(restBase: string, bucket: string, objectPath: string): string {
  const enc = encodeStorageObjectPath(objectPath);
  return `${restBase}/storage/v1/object/public/${encodeURIComponent(bucket)}/${enc}`;
}

async function uploadDataUrlToAnketBucket(objectPath: string, dataUrl: string): Promise<string> {
  const parsed = dataUrlToBytes(dataUrl);
  if (!parsed) {
    throw new Error('Зургийн өгөгдөл уншихад алдаа гарлаа. Дахин сонгоно уу.');
  }
  const { restBase, anonKey } = getSupabaseRest();
  const bucket = getAnketStorageBucket();
  const url = `${restBase}/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStorageObjectPath(objectPath)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      apikey:        anonKey,
      Authorization: `Bearer ${anonKey}`,
      'Content-Type': parsed.mime || 'application/octet-stream',
      'x-upsert':    'true',
    },
    body: parsed.bytes as unknown as BodyInit,
  });
  if (!res.ok) {
    const json = await parseJsonSafely(res);
    const msg = formatPostgrestError(json, res);
    throw new Error(
      msg.includes('Bucket') || res.status === 400
        ? `${msg} — Storage-д «${bucket}» public bucket үүсгэж, anon upload policy нэмнэ үү.`
        : msg || 'Зураг оруулахад алдаа гарлаа.',
    );
  }
  return publicStorageObjectUrl(restBase, bucket, objectPath);
}

/** data: эсвэл аль хэдийн https URL буцаана. */
async function ensurePublicImageUrl(folder: string, value: string): Promise<string> {
  const v = value.trim();
  if (!v) throw new Error('Зураг хоосон байна.');
  if (v.startsWith('http://') || v.startsWith('https://')) return v;
  if (!v.startsWith('data:')) return v;
  const id =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const parsed = dataUrlToBytes(v);
  const ext = parsed ? mimeToFileExt(parsed.mime) : 'bin';
  const path = `${folder}/${id}.${ext}`;
  return uploadDataUrlToAnketBucket(path, v);
}

async function fetchAnketImageUrls(anketId: string): Promise<string[]> {
  const { restBase, anonKey } = getSupabaseRest();
  const q = new URLSearchParams({
    select:    'image_url',
    anket_id:  `eq.${anketId}`,
    order:     'created_at.asc',
  });
  const res = await fetch(`${restBase}/rest/v1/anket_images?${q.toString()}`, {
    headers: restHeaders(anonKey),
  });
  const json = await parseJsonSafely(res);
  if (!res.ok) {
    throw new Error(formatPostgrestError(json, res) || 'Ажлын зургууд ачаалахад алдаа гарлаа.');
  }
  if (!Array.isArray(json)) return [];
  return (json as { image_url?: unknown }[])
    .map((r) => (typeof r.image_url === 'string' ? r.image_url.trim() : ''))
    .filter(Boolean);
}

async function replaceAnketImageRows(anketId: string, imageUrls: string[]): Promise<void> {
  const { restBase, anonKey } = getSupabaseRest();
  const delQ = new URLSearchParams({ anket_id: `eq.${anketId}` });
  const delRes = await fetch(`${restBase}/rest/v1/anket_images?${delQ.toString()}`, {
    method:  'DELETE',
    headers: restHeaders(anonKey),
  });
  if (!delRes.ok) {
    const json = await parseJsonSafely(delRes);
    throw new Error(formatPostgrestError(json, delRes) || 'Хуучин зургууд устгахад алдаа гарлаа.');
  }
  if (imageUrls.length === 0) return;
  const rows = imageUrls.map((image_url) => ({ anket_id: anketId, image_url }));
  const insRes = await fetch(`${restBase}/rest/v1/anket_images`, {
    method:  'POST',
    headers: { ...restHeaders(anonKey), Prefer: 'return=minimal' },
    body:    JSON.stringify(rows),
  });
  if (!insRes.ok) {
    const json = await parseJsonSafely(insRes);
    throw new Error(formatPostgrestError(json, insRes) || 'Ажлын зургууд хадгалахад алдаа гарлаа.');
  }
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

function formatPostgrestError(json: unknown, res: Response): string {
  if (json && typeof json === 'object' && 'message' in json && typeof (json as { message: string }).message === 'string') {
    return (json as { message: string }).message;
  }
  return `HTTP ${res.status}`;
}

export interface JobListItem {
  id:   string;
  name: string;
}

export interface AnketRecord {
  id:               string;
  customers_id:    string;
  profile_image:    string | null;
  name:             string | null;
  phone:            string | null;
  job_ids:          string[];
  work_experience:  string | null;
  workImageUrls:    string[];
}

function parseJobIds(raw: unknown): string[] {
  if (raw == null) return [];
  if (Array.isArray(raw)) {
    return raw.map((x) => String(x).trim()).filter(Boolean).slice(0, 3);
  }
  return [];
}

function parseImagesColumn(raw: unknown): string[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const item of raw) {
    if (item && typeof item === 'object' && 'image_url' in item) {
      const u = String((item as { image_url: unknown }).image_url ?? '').trim();
      if (u) out.push(u);
    }
  }
  return out;
}

function rowToAnketRecord(row: Record<string, unknown>, workImageUrls: string[]): AnketRecord {
  const id = row.id != null ? String(row.id) : '';
  const customersId =
    row.customers_id != null
      ? String(row.customers_id)
      : row.customer_id != null
        ? String(row.customer_id)
        : '';
  const legacy = parseImagesColumn(row.images);
  return {
    id,
    customers_id:    customersId,
    profile_image:   typeof row.profile_image === 'string' ? row.profile_image : row.profile_image != null ? String(row.profile_image) : null,
    name:            typeof row.name === 'string' ? row.name : row.name != null ? String(row.name) : null,
    phone:           typeof row.phone === 'string' ? row.phone : row.phone != null ? String(row.phone) : null,
    job_ids:         parseJobIds(row.job_ids),
    work_experience: typeof row.work_experience === 'string' ? row.work_experience : row.work_experience != null ? String(row.work_experience) : null,
    workImageUrls:   workImageUrls.length > 0 ? workImageUrls : legacy,
  };
}

export async function fetchJobsForAnket(): Promise<JobListItem[]> {
  const { restBase, anonKey } = getSupabaseRest();
  const q = new URLSearchParams({
    select: 'id,name',
    order: 'name.asc',
  });
  const res = await fetch(`${restBase}/rest/v1/jobs?${q.toString()}`, {
    headers: restHeaders(anonKey),
  });
  const json = await parseJsonSafely(res);
  if (!res.ok) {
    throw new Error(formatPostgrestError(json, res) || 'Ажлын жагсаалт ачаалахад алдаа гарлаа.');
  }
  if (!Array.isArray(json)) return [];
  return (json as Record<string, unknown>[])
    .map((r) => ({
      id:   r.id != null ? String(r.id) : '',
      name: typeof r.name === 'string' ? r.name.trim() : String(r.name ?? '').trim(),
    }))
    .filter((j) => j.id.length > 0 && j.name.length > 0);
}

export async function fetchCustomerIdForAnket(params: {
  phone:    number | null;
  googleId: string | null;
}): Promise<string | null> {
  const { restBase, anonKey } = getSupabaseRest();
  const gid = params.googleId?.trim() ?? '';
  const q = new URLSearchParams({ select: 'id', limit: '1' });
  if (gid) {
    q.set('google_id', `eq.${gid}`);
  } else if (params.phone != null && Number.isFinite(params.phone)) {
    q.set('phone', `eq.${params.phone}`);
  } else {
    return null;
  }
  const res = await fetch(`${restBase}/rest/v1/customers?${q.toString()}`, {
    headers: restHeaders(anonKey),
  });
  const json = await parseJsonSafely(res);
  if (!res.ok || !Array.isArray(json) || json.length === 0) {
    return null;
  }
  const id = (json[0] as { id?: unknown }).id;
  return id != null ? String(id) : null;
}

export async function fetchAnketByCustomerId(customerId: string): Promise<AnketRecord | null> {
  const { restBase, anonKey } = getSupabaseRest();
  const q = new URLSearchParams({
    select: '*',
    customers_id: `eq.${customerId}`,
    limit: '1',
  });
  const res = await fetch(`${restBase}/rest/v1/anket?${q.toString()}`, {
    headers: restHeaders(anonKey),
  });
  const json = await parseJsonSafely(res);
  if (!res.ok) {
    throw new Error(formatPostgrestError(json, res) || 'Анкет ачаалахад алдаа гарлаа.');
  }
  if (!Array.isArray(json) || json.length === 0) return null;
  const row = json[0] as Record<string, unknown>;
  const aid = row.id != null ? String(row.id) : '';
  let workUrls: string[] = [];
  if (aid) {
    try {
      workUrls = await fetchAnketImageUrls(aid);
    } catch {
      workUrls = [];
    }
  }
  return rowToAnketRecord(row, workUrls);
}

export interface AnketSavePayload {
  profile_image:   string | null;
  name:            string;
  phone:           string;
  job_ids:         string[];
  work_experience: string;
  /** @deprecated anket_images хүснэгт ашиглана; хадгалах үед үл тоогдоно */
  images:          { image_url: string }[];
}

function buildJsonBody(payload: AnketSavePayload): Record<string, unknown> {
  const jobIds = payload.job_ids.slice(0, 3).filter(Boolean);
  return {
    profile_image:   payload.profile_image,
    name:            payload.name.trim() || null,
    phone:           payload.phone.trim() || null,
    job_ids:         jobIds.length > 0 ? jobIds : null,
    work_experience: payload.work_experience.trim() || null,
  };
}

export async function insertAnket(customerId: string, payload: AnketSavePayload): Promise<string> {
  const { restBase, anonKey } = getSupabaseRest();
  const body = {
    customers_id: customerId,
    ...buildJsonBody(payload),
  };
  const q = new URLSearchParams({ select: 'id' });
  const res = await fetch(`${restBase}/rest/v1/anket?${q.toString()}`, {
    method:  'POST',
    headers: { ...restHeaders(anonKey), Prefer: 'return=representation' },
    body:    JSON.stringify(body),
  });
  const json = await parseJsonSafely(res);
  if (!res.ok) {
    throw new Error(formatPostgrestError(json, res) || 'Анкет хадгалахад алдаа гарлаа.');
  }
  if (!Array.isArray(json) || json.length === 0) {
    throw new Error('Анкет хадгалагдсан ч ID буцаагүй байна.');
  }
  const id = (json[0] as { id?: unknown }).id;
  return id != null ? String(id) : '';
}

export async function updateAnketByCustomerId(customerId: string, payload: AnketSavePayload): Promise<void> {
  const { restBase, anonKey } = getSupabaseRest();
  const q = new URLSearchParams({ customers_id: `eq.${customerId}` });
  const res = await fetch(`${restBase}/rest/v1/anket?${q.toString()}`, {
    method: 'PATCH',
    headers: { ...restHeaders(anonKey), Prefer: 'return=minimal' },
    body: JSON.stringify(buildJsonBody(payload)),
  });
  if (!res.ok) {
    const json = await parseJsonSafely(res);
    throw new Error(formatPostgrestError(json, res) || 'Анкет шинэчлэхэд алдаа гарлаа.');
  }
}

export async function deleteAnketByCustomerId(customerId: string): Promise<void> {
  const { restBase, anonKey } = getSupabaseRest();
  const sel = new URLSearchParams({
    select:        'id',
    customers_id:  `eq.${customerId}`,
    limit:         '1',
  });
  const getRes = await fetch(`${restBase}/rest/v1/anket?${sel.toString()}`, {
    headers: restHeaders(anonKey),
  });
  const getJson = await parseJsonSafely(getRes);
  if (!getRes.ok) {
    throw new Error(formatPostgrestError(getJson, getRes) || 'Анкет олоход алдаа гарлаа.');
  }
  const aid =
    Array.isArray(getJson) && getJson.length > 0
      ? String((getJson[0] as { id?: unknown }).id ?? '')
      : '';
  if (aid) {
    const delImg = new URLSearchParams({ anket_id: `eq.${aid}` });
    await fetch(`${restBase}/rest/v1/anket_images?${delImg.toString()}`, {
      method:  'DELETE',
      headers: restHeaders(anonKey),
    });
  }
  const q = new URLSearchParams({ customers_id: `eq.${customerId}` });
  const res = await fetch(`${restBase}/rest/v1/anket?${q.toString()}`, {
    method:  'DELETE',
    headers: restHeaders(anonKey),
  });
  if (!res.ok) {
    const json = await parseJsonSafely(res);
    throw new Error(formatPostgrestError(json, res) || 'Устгахад алдаа гарлаа.');
  }
}

/**
 * Зургуудыг Storage руу оруулж, anket + anket_images-ийг нэгэн зэрэг хадгална.
 * `anket.images` баганыг огт илгээхгүй (CHECK / урт хязгаараас зайлсхийх).
 */
export async function saveAnketWithImageUploads(params: {
  customerId:       string;
  existingAnketId:  string | null;
  payload:          AnketSavePayload;
}): Promise<{ anketId: string; profileUrl: string; workUrls: string[] }> {
  const { customerId, existingAnketId, payload } = params;
  const folder = `customers/${customerId}`;

  const profileUrl = await ensurePublicImageUrl(folder, payload.profile_image ?? '');
  const workUrls = await Promise.all(
    payload.images.map((row) => ensurePublicImageUrl(folder, row.image_url)),
  );

  const bodyPayload: AnketSavePayload = {
    ...payload,
    profile_image: profileUrl,
    images:        [],
  };

  let anketId: string;
  if (existingAnketId) {
    anketId = existingAnketId;
    await updateAnketByCustomerId(customerId, bodyPayload);
  } else {
    anketId = await insertAnket(customerId, bodyPayload);
  }

  await replaceAnketImageRows(anketId, workUrls);
  return { anketId, profileUrl, workUrls };
}
