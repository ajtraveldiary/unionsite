// Small helpers for the admin's page scripts (browser only): calling the admin API and showing a
// short message at the bottom of the screen.

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** JSON in, JSON out; a failed request throws an ApiError carrying the API's own message */
export async function api<T = Record<string, unknown>>(path: string, init: { method?: string; body?: unknown; keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? (init.body === undefined ? 'GET' : 'POST'),
      headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      keepalive: init.keepalive,
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError('No connection. Your changes are kept on this screen; try again when you are back online.', 0);
  }
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(data.error ?? `Something went wrong (${res.status}).`, res.status);
  return data;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** A short message at the bottom of the screen; errors stay until the next message */
export function toast(message: string, kind: 'ok' | 'error' = 'ok') {
  const box = document.querySelector<HTMLElement>('[data-toast]');
  if (!box) return;
  box.innerHTML = '';
  const el = document.createElement('p');
  el.className = `pointer-events-auto max-w-md rounded-[var(--radius-control)] px-4 py-3 text-sm font-medium shadow-float ${kind === 'error' ? 'bg-accent text-on-accent' : 'bg-ink text-bg'}`;
  el.textContent = message;
  box.append(el);
  clearTimeout(timer);
  if (kind === 'ok') timer = setTimeout(() => el.remove(), 3500);
}

/** "2 minutes ago", for autosave and lists */
export function ago(sqlTime: string) {
  const s = Math.max(0, (Date.now() - new Date(`${sqlTime.replace(' ', 'T')}Z`).getTime()) / 1000);
  if (s < 45) return 'just now';
  if (s < 90) return 'a minute ago';
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`;
  if (s < 5400) return 'an hour ago';
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`;
  return new Date(`${sqlTime.replace(' ', 'T')}Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
