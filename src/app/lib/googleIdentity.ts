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

async function fetchGoogleSub(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = (await res.json()) as { sub?: string };
  if (!res.ok || !json.sub) {
    throw new Error('Google хэрэглэгчийн мэдээлэл авахад алдаа гарлаа.');
  }
  return json.sub;
}

/** Popup / token flow — дуусахад Google `sub` буцаана. */
export function requestGoogleUserSub(clientId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google API бэлэн биш байна.'));
      return;
    }
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      callback: async (tokenResponse) => {
        if (tokenResponse.error) {
          const d = tokenResponse.error_description || tokenResponse.error;
          reject(new Error(d === 'access_denied' ? 'Цуцлагдлаа.' : d));
          return;
        }
        if (!tokenResponse.access_token) {
          reject(new Error('Токен олдсонгүй.'));
          return;
        }
        try {
          const sub = await fetchGoogleSub(tokenResponse.access_token);
          resolve(sub);
        } catch (e) {
          reject(e instanceof Error ? e : new Error('Google алдаа.'));
        }
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}
