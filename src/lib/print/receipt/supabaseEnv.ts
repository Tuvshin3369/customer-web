export interface SupabaseEnv {
  restBase: string;
  anonKey: string;
}

export function getSupabaseEnv(): SupabaseEnv {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!supabaseUrl?.trim() || !anonKey?.trim()) {
    throw new Error('Supabase тохиргоо (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) дутуу байна.');
  }
  return { restBase: supabaseUrl.replace(/\/$/, ''), anonKey: anonKey.trim() };
}

export function restHeaders(anonKey: string): HeadersInit {
  return {
    apikey: anonKey,
    Authorization: `Bearer ${anonKey}`,
    Accept: 'application/json',
  };
}

export async function restGet<T = unknown>(path: string): Promise<T> {
  const env = getSupabaseEnv();
  const res = await fetch(`${env.restBase}${path}`, { headers: restHeaders(env.anonKey) });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (json && typeof json === 'object' && 'message' in json && String((json as { message: unknown }).message)) ||
      res.statusText ||
      'Request failed';
    throw new Error(msg);
  }
  return json as T;
}
