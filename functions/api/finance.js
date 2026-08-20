const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
let tokenCache = null;

export async function onRequestGet(context) {
  try {
    const { GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID } = context.env;
    if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
      return json({ error: 'Configurazione Google Sheets incompleta in Cloudflare Pages.' }, 503);
    }

    const requestUrl = new URL(context.request.url);
    const forceRefresh = requestUrl.searchParams.get('refresh') === '1';
    const cache = caches.default;
    const cacheKey = new Request(`${requestUrl.origin}/api/finance-cache-v1`);

    if (!forceRefresh) {
      const cached = await cache.match(cacheKey);
      if (cached) return cached;
    }

    const accessToken = await getAccessToken(GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY);
    const [conto, entrate] = await Promise.all([
      getValues(GOOGLE_SHEET_ID, 'Conto!A:D', accessToken),
      getValues(GOOGLE_SHEET_ID, 'Entrate!A:C', accessToken),
    ]);

    const expenses = parseExpenses(conto);
    const incomes = parseIncomes(entrate);
    const generatedAt = new Date().toISOString();
    const response = json({ generatedAt, expenses, incomes });
    response.headers.set('Cache-Control', forceRefresh ? 'no-store' : 'public, max-age=300');

    const cachedResponse = json({ generatedAt, expenses, incomes });
    cachedResponse.headers.set('Cache-Control', 'public, max-age=300');
    context.waitUntil(cache.put(cacheKey, cachedResponse));

    return response;
  } catch (error) {
    console.error(error);
    return json({ error: 'Errore nella lettura di Google Sheets.', detail: error?.message || String(error) }, 500);
  }
}

export function onRequest(context) {
  if (context.request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  return onRequestGet(context);
}

async function getValues(sheetId, range, token) {
  const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(sheetId)}/values/${encodeURIComponent(range)}`);
  url.searchParams.set('majorDimension', 'ROWS');
  url.searchParams.set('valueRenderOption', 'UNFORMATTED_VALUE');
  url.searchParams.set('dateTimeRenderOption', 'SERIAL_NUMBER');
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google Sheets ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return body.values || [];
}

function parseExpenses(values) {
  return values.slice(1).filter((r) => r[0] !== undefined && r[1] !== undefined).map((r) => ({ date: sheetDate(r[0]), amount: number(r[1]), category: String(r[2] || '').trim().toLowerCase() })).filter((r) => r.date && Number.isFinite(r.amount) && r.category);
}

function parseIncomes(values) {
  return values.slice(1).filter((r) => r[0] !== undefined && r[1] !== undefined).map((r) => ({ date: sheetDate(r[0]), amount: number(r[1]) })).filter((r) => r.date && Number.isFinite(r.amount));
}

function sheetDate(value) {
  if (typeof value === 'number') {
    const ms = Date.UTC(1899, 11, 30) + Math.round(value * 86400000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  const text = String(value || '').trim();
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
  if (iso) return iso;
  const m = text.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

function number(v) {
  if (typeof v === 'number') return v;
  return Number(String(v).replace(/\./g, '').replace(',', '.'));
}

async function getAccessToken(email, privateKey) {
  const now = Math.floor(Date.now() / 1000);
  if (tokenCache && tokenCache.exp > now + 60) return tokenCache.token;
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = { iss: email, scope: SHEETS_SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600 };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claims))}`;
  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-v1_5' }, key, new TextEncoder().encode(unsigned));
  const assertion = `${unsigned}.${base64UrlBytes(new Uint8Array(signature))}`;
  const body = new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion });
  const res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!res.ok) throw new Error(`Google OAuth ${res.status}: ${await res.text()}`);
  const payload = await res.json();
  tokenCache = { token: payload.access_token, exp: now + Number(payload.expires_in || 3600) };
  return tokenCache.token;
}

async function importPrivateKey(pem) {
  const normalized = pem.replace(/\\n/g, '\n').trim();
  const b64 = normalized.replace('-----BEGIN PRIVATE KEY-----', '').replace('-----END PRIVATE KEY-----', '').replace(/\s/g, '');
  const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', raw.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

function base64Url(text) { return base64UrlBytes(new TextEncoder().encode(text)); }
function base64UrlBytes(bytes) { let binary = ''; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_'); }
function json(body, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } }); }
