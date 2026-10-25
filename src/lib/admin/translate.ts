// English drafts with Google Gemini (plan, section 6). Runs in the admin's browser: the Malayalam,
// the glossary and the rules go straight from here to Gemini with the admin's own key, so our
// server never sees the key. The key is kept for this browser tab (forgotten after 30 minutes
// without use) or, if the admin chooses, on this device for 7 days, encrypted with a key the
// browser itself can't export. The site-wide switch, the model and the glossary come from
// Settings (/api/admin/ai). The draft comes back as HTML, which the English text box reads into
// its own schema, so nothing unexpected gets in.
import { renderBody } from '../richtext';
import type { DocText } from './post-doc';

/** A fast Flash-class model by default; the super admin can choose another in Settings */
export const DEFAULT_MODEL = 'gemini-2.5-flash';
const SESSION = 'gemini-key';
const IDLE_MS = 30 * 60 * 1000;
const DEVICE_MS = 7 * 24 * 60 * 60 * 1000;
const AUTO = 'auto-translate';

// ── Settings from the server: on or off, model, glossary ──────────────────────────────

export interface AiConfig { enabled: boolean; model: string; glossary: [string, string][] }
let config: Promise<AiConfig> | null = null;

export function aiConfig(): Promise<AiConfig> {
  config ??= fetch('/api/admin/ai', { credentials: 'same-origin' })
    .then((r) => (r.ok ? (r.json() as Promise<AiConfig>) : Promise.reject()))
    .catch(() => ({ enabled: true, model: DEFAULT_MODEL, glossary: [] }));
  return config;
}

/** "Draft English automatically when I save": this admin's choice on this device (on unless turned off) */
export const autoTranslate = () => { try { return localStorage.getItem(AUTO) !== 'off'; } catch { return true; } };
export const setAutoTranslate = (on: boolean) => { try { localStorage.setItem(AUTO, on ? 'on' : 'off'); } catch {} };

// ── The key: this tab, or this device (encrypted) ──────────────────────────────────────

function idb(): Promise<IDBDatabase> {
  return new Promise((ok, fail) => {
    const req = indexedDB.open('admin-keys', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('keys');
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fail(req.error);
  });
}
async function idbDo<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await idb();
  return new Promise((ok, fail) => {
    const req = fn(db.transaction('keys', mode).objectStore('keys'));
    req.onsuccess = () => ok(req.result as T);
    req.onerror = () => fail(req.error);
  });
}

/** The device copy: an AES key the browser keeps but can't export, and the Gemini key encrypted with it */
async function readDevice(): Promise<string | null> {
  try {
    const rec = await idbDo<{ wrap: CryptoKey; iv: Uint8Array<ArrayBuffer>; data: ArrayBuffer; until: number } | undefined>('readonly', (s) => s.get('gemini'));
    if (!rec) return null;
    if (Date.now() > rec.until) return void (await forgetKey()), null;
    return new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: rec.iv }, rec.wrap, rec.data));
  } catch {
    return null;
  }
}
async function writeDevice(key: string) {
  const wrap = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrap, new TextEncoder().encode(key));
  await idbDo('readwrite', (s) => s.put({ wrap, iv, data, until: Date.now() + DEVICE_MS }, 'gemini'));
}

export async function getKey(): Promise<string | null> {
  try {
    const raw = sessionStorage.getItem(SESSION);
    if (raw) {
      const { key, at } = JSON.parse(raw) as { key: string; at: number };
      if (Date.now() - at <= IDLE_MS) {
        sessionStorage.setItem(SESSION, JSON.stringify({ key, at: Date.now() }));
        return key;
      }
      sessionStorage.removeItem(SESSION);
    }
  } catch { /* storage blocked: try the device copy */ }
  return readDevice();
}

/** Where the key is kept now: 'device', 'session' or null */
export async function keyMode(): Promise<'device' | 'session' | null> {
  if (await readDevice()) return 'device';
  try { return sessionStorage.getItem(SESSION) ? 'session' : null; } catch { return null; }
}

export async function setKey(key: string, mode: 'session' | 'device' = 'session') {
  const k = key.trim();
  try { sessionStorage.setItem(SESSION, JSON.stringify({ key: k, at: Date.now() })); } catch {}
  if (mode === 'device') await writeDevice(k);
  else await idbDo('readwrite', (s) => s.delete('gemini')).catch(() => {});
}

export async function forgetKey() {
  try { sessionStorage.removeItem(SESSION); } catch {}
  await idbDo('readwrite', (s) => s.delete('gemini')).catch(() => {});
}

/** The key, asking for it in the page's key dialog (components/admin/GeminiKeyDialog) when there's none */
export async function askKey(): Promise<string | null> {
  const have = await getKey();
  if (have) return have;
  const dialog = document.querySelector<HTMLDialogElement>('[data-key-dialog]');
  if (!dialog) return null;
  const input = dialog.querySelector<HTMLInputElement>('[data-key-input]')!;
  if (!dialog.dataset.ready) {
    dialog.dataset.ready = '1';
    dialog.querySelector('[data-key-forget]')?.addEventListener('click', () => { forgetKey(); input.value = ''; dialog.close(); });
  }
  input.value = '';
  dialog.returnValue = '';
  dialog.showModal();
  return new Promise((ok) => {
    dialog.addEventListener('close', async () => {
      if (dialog.returnValue === 'ok' && input.value.trim()) {
        await setKey(input.value);
        ok(input.value.trim());
      } else ok(null);
    }, { once: true });
  });
}

/** Whether Gemini accepts this key (lists models; translates nothing) */
export async function testKey(key: string): Promise<boolean> {
  try {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1', { headers: { 'x-goog-api-key': key.trim() } });
    return r.ok;
  } catch {
    return false;
  }
}

// ── Translating ──────────────────────────────────────────────────────────────────────────

export class TranslateError extends Error {
  constructor(message: string, public badKey = false) {
    super(message);
  }
}

const rules = (glossary: [string, string][]) => `You translate news posts of the Kerala NGO Union (a union of Kerala State Government employees) from Malayalam into clear, plain British English.
Rules:
- Translate; never summarise, shorten, explain or add anything.
- Keep every number, date, amount, URL and Government Order number exactly as written (for example "G.O.(P) No. 81/2014/Fin").
- Keep the HTML structure of body_html exactly: the same tags in the same order (p, h2, h3, ul, ol, li, blockquote, strong, em, u, s, a, figure, img, figcaption, br, hr). Translate only the text and the alt and title attributes; keep href and src unchanged.
- Write names of people and places in their usual English spelling.${glossary.length ? `
- Use these terms:
${glossary.map(([ml, en]) => `  ${ml} → ${en}`).join('\n')}` : ''}
Answer with JSON: {"title": "...", "summary": "...", "body_html": "..."}. Leave summary empty if the Malayalam summary is empty.`;

/** The English draft of a post's Malayalam: title, summary and the body as HTML */
export async function draftEnglish(ml: DocText, key: string): Promise<{ title: string; summary: string; html: string }> {
  const cfg = await aiConfig();
  if (!cfg.enabled) throw new TranslateError('AI drafts are switched off for the site. Type the English by hand.');
  let res: Response;
  try {
    res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model || DEFAULT_MODEL)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: rules(cfg.glossary) }] },
        contents: [{ role: 'user', parts: [{ text: JSON.stringify({ title: ml.title, summary: ml.summary, body_html: renderBody(ml.body) }) }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: { type: 'OBJECT', properties: { title: { type: 'STRING' }, summary: { type: 'STRING' }, body_html: { type: 'STRING' } }, required: ['title', 'summary', 'body_html'] },
        },
      }),
    });
  } catch {
    throw new TranslateError('Could not reach Gemini. Check the connection and try again.');
  }
  if (res.status === 400 || res.status === 401 || res.status === 403) {
    const msg = ((await res.json().catch(() => ({}))) as { error?: { message?: string } }).error?.message ?? '';
    if (/api key|permission|unauth/i.test(msg) || res.status !== 400) throw new TranslateError('Gemini refused this key. Check it, or paste a new one.', true);
    throw new TranslateError(`Gemini could not translate this post: ${msg || 'bad request'}.`);
  }
  if (res.status === 429) throw new TranslateError('This key has reached its Gemini limit for now. Try again later, or use another key.');
  if (!res.ok) throw new TranslateError(`Gemini is not answering right now (${res.status}). Try again in a minute.`);
  const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[] };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  try {
    const out = JSON.parse(text) as { title?: string; summary?: string; body_html?: string };
    if (!out.title || typeof out.body_html !== 'string') throw new Error();
    return { title: out.title.trim(), summary: (out.summary ?? '').trim(), html: out.body_html };
  } catch {
    throw new TranslateError(data.candidates?.[0]?.finishReason === 'MAX_TOKENS' ? 'This post is too long to translate in one go. Translate it in parts by hand.' : 'Gemini’s answer could not be read. Try again.');
  }
}
