export const DEFAULT_SERVER_URL = 'https://ais-pre-ftme7rq43wfatqai4xtce4-604243945355.europe-west2.run.app';

export const isNativeApp = (): boolean => {
  if (typeof window === 'undefined') return false;
  const isCapacitor = (window as any).Capacitor?.isNativePlatform?.() || 
                      window.location.protocol === 'capacitor:' || 
                      (window.location.hostname === 'localhost' && window.location.port !== '3000');
  return Boolean(isCapacitor);
};

export const getCustomServerUrl = (): string => {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('custom_api_server') || '';
};

export const setCustomServerUrl = (url: string): void => {
  if (typeof window === 'undefined') return;
  if (!url || !url.trim()) {
    localStorage.removeItem('custom_api_server');
  } else {
    localStorage.setItem('custom_api_server', url.trim());
  }
};

export const getApiUrl = (endpoint: string): string => {
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;

  // 1. Check for custom server URL configured in app settings
  if (typeof window !== 'undefined') {
    const customUrl = localStorage.getItem('custom_api_server');
    if (customUrl && customUrl.trim()) {
      const base = customUrl.trim().replace(/\/$/, '');
      return `${base}${path}`;
    }
  }

  // 2. Check for environment variable
  const envUrl = (import.meta as any).env?.VITE_API_URL;
  if (envUrl && envUrl.trim()) {
    const base = envUrl.trim().replace(/\/$/, '');
    return `${base}${path}`;
  }

  // 3. If inside Capacitor native Android app, check fallback
  if (isNativeApp()) {
    const base = DEFAULT_SERVER_URL.replace(/\/$/, '');
    return `${base}${path}`;
  }

  // 4. In browser, relative path works directly
  return endpoint;
};

export const testServerConnection = async (customUrl?: string): Promise<{ ok: boolean; message: string }> => {
  let targetUrl = '';
  if (customUrl && customUrl.trim()) {
    targetUrl = `${customUrl.trim().replace(/\/$/, '')}/api/health`;
  } else {
    targetUrl = getApiUrl('/api/health');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(targetUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'Accept': 'application/json' }
    });
    clearTimeout(timeoutId);

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await res.text();
      if (text.includes('<!doctype') || text.includes('<html')) {
        return {
          ok: false,
          message: 'Adresse liefert eine Webseite statt API-Daten (HTML). Backend nicht aktiv oder gesperrt.'
        };
      }
      return {
        ok: false,
        message: `Unerwartete Serverantwort (Status ${res.status}).`
      };
    }

    const data = await res.json();
    if (data.status === 'ok') {
      return { ok: true, message: 'Verbindung erfolgreich! KI-Server ist bereit.' };
    }
    return { ok: false, message: `Server meldet: ${JSON.stringify(data)}` };
  } catch (err: any) {
    clearTimeout(timeoutId);
    if (err.name === 'AbortError') {
      return { ok: false, message: 'Zeitüberschreitung: Server antwortet nicht (Timeout).' };
    }
    return { ok: false, message: `Keine Verbindung möglich (${err.message || 'Netzwerkfehler'}).` };
  }
};
