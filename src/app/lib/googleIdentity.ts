/**
 * Google Identity Services — OAuth2 access token → userinfo `sub` (google_id).
 * VITE_GOOGLE_CLIENT_ID: Google Cloud Console → OAuth 2.0 Client (Web).
 */

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (tokenResponse: {
              access_token?: string;
              error?: string;
              error_description?: string;
            }) => void;
          }) => { requestAccessToken: (overrideConfig?: { prompt?: string }) => void };
        };
      };
    };
  }
}

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

export function loadGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'));
  if (window.google?.accounts?.oauth2) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${GSI_SCRIPT_SRC}"]`);
    if (existing) {
      const check = () => {
        if (window.google?.accounts?.oauth2) resolve();
        else reject(new Error('Google script ачаалагдсан ч API бэлэн биш байна.'));
      };
      existing.addEventListener('load', check);
      existing.addEventListener('error', () => reject(new Error('Google script алдаа.')));
      return;
    }
    const s = document.createElement('script');
    s.src = GSI_SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google script ачаалахад алдаа гарлаа.'));
    document.head.appendChild(s);
  });
}

export interface GoogleUserProfile {
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  email?: string;
}

async function fetchGoogleUserProfile(accessToken: string): Promise<GoogleUserProfile> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as {
    sub?: string;
    name?: string;
    given_name?: string;
    family_name?: string;
    email?: string;
  };
  if (!res.ok || !json.sub) {
    throw new Error('Google хэрэглэгчийн мэдээлэл авахад алдаа гарлаа.');
  }
  return {
    sub: json.sub,
    name: json.name,
    given_name: json.given_name,
    family_name: json.family_name,
    email: json.email,
  };
}

/** UI-д харуулах нэр — Google profile-оос */
export function formatGoogleDisplayName(
  info: Pick<GoogleUserProfile, 'name' | 'given_name' | 'family_name' | 'email'>,
): string {
  const full = info.name?.trim();
  if (full) return full;
  const given = info.given_name?.trim() ?? '';
  const family = info.family_name?.trim() ?? '';
  const combined = [given, family].filter(Boolean).join(' ').trim();
  if (combined) return combined;
  const email = info.email?.trim();
  if (email) {
    const local = email.split('@')[0]?.trim();
    if (local) return local;
  }
  return 'Хэрэглэгч';
}

function requestGoogleAccessToken(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google API бэлэн биш байна.'));
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      callback: (tokenResponse) => {
        if (tokenResponse.error) {
          const d = tokenResponse.error_description || tokenResponse.error;
          reject(new Error(d === 'access_denied' ? 'Цуцлагдлаа.' : d));
          return;
        }
        if (!tokenResponse.access_token) {
          reject(new Error('Токен олдсонгүй.'));
          return;
        }
        resolve(tokenResponse.access_token);
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/** Popup / token flow — `sub` + нэр, имэйл */
export async function requestGoogleUserProfile(clientId: string): Promise<GoogleUserProfile> {
  const accessToken = await requestGoogleAccessToken(clientId);
  return fetchGoogleUserProfile(accessToken);
}

/** Popup / token flow — дуусахад Google `sub` буцаана. */
export async function requestGoogleUserSub(clientId: string): Promise<string> {
  const profile = await requestGoogleUserProfile(clientId);
  return profile.sub;
}
