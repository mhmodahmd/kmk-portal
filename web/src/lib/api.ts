import { tr, trData, trServer } from './i18n';
import type { SessionResult } from './types';

/**
 * الاتصال بالخادم. كل الشاشات تمر من هنا، لا fetch مباشر.
 * Content-Type: text/plain يتجنب طلب CORS المسبق الذي لا يدعمه Apps Script.
 */
export const CLIENT_VERSION = '0.8.0';
const API_URL: string = import.meta.env.VITE_API_URL || 'mock';
export const IS_MOCK = API_URL === 'mock';

export class ApiError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

const SESSION_KEY = 'kmk.session';
const DEVICE_KEY = 'kmk.device';

function read(key: string): string {
  try { return localStorage.getItem(key) || ''; } catch { return ''; }
}
function write(key: string, value: string) {
  try { value ? localStorage.setItem(key, value) : localStorage.removeItem(key); } catch { /* التخزين غير متاح */ }
}

export const session = {
  get token() { return read(SESSION_KEY); },
  get deviceToken() { return read(DEVICE_KEY); },
  save(r: Pick<SessionResult, 'token'> & { deviceToken?: string }) {
    write(SESSION_KEY, r.token);
    if (r.deviceToken) write(DEVICE_KEY, r.deviceToken);
  },
  setDevice(t: string) { if (t) write(DEVICE_KEY, t); },
  clear(forgetDevice = true) {
    write(SESSION_KEY, '');
    if (forgetDevice) write(DEVICE_KEY, '');
  }
};

type Listener = (event: 'logout' | 'update') => void;
const listeners = new Set<Listener>();
export function onApiEvent(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; }
const emit = (e: 'logout' | 'update') => listeners.forEach((fn) => fn(e));

interface Envelope<T> { ok: boolean; data?: T; error?: { code: string; message: string } }

async function send<T>(action: string, payload: unknown, token: string): Promise<T> {
  const body = { action, token, payload, v: CLIENT_VERSION };
  let env: Envelope<T>;
  if (IS_MOCK) {
    const { mockHandle } = await import('./mock');
    env = (await mockHandle(body)) as Envelope<T>;
  } else {
    let res: Response;
    try {
      res = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(body),
        redirect: 'follow'
      });
    } catch {
      throw new ApiError('NETWORK', tr("تعذّر الاتصال بالخادم. تحقق من الإنترنت وحاول مرة أخرى."));
    }
    try {
      env = await res.json();
    } catch {
      throw new ApiError('BAD_RESPONSE', tr("الخادم لا يستجيب كما ينبغي الآن. حاول بعد قليل."));
    }
  }
  if (!env.ok) throw new ApiError(env.error?.code || 'ERROR', env.error?.message ? trServer(env.error.message) : tr("حدث خطأ غير متوقع."));
  return trData(env.data as T);
}

let resuming: Promise<boolean> | null = null;

/** يحاول استعادة الجلسة برمز الجهاز المحفوظ (مرة واحدة لكل الطلبات المتزامنة). */
export function tryResume(): Promise<boolean> {
  const device = session.deviceToken;
  if (!device) return Promise.resolve(false);
  if (!resuming) {
    resuming = send<SessionResult>('auth.resume', { deviceToken: device }, '')
      .then((r) => { session.save({ token: r.token }); return true; })
      .catch(() => { session.clear(true); return false; })
      .finally(() => { resuming = null; });
  }
  return resuming;
}

export async function api<T = unknown>(action: string, payload: unknown = {}): Promise<T> {
  try {
    return await send<T>(action, payload, session.token);
  } catch (e) {
    if (e instanceof ApiError && e.code === 'SESSION_EXPIRED' && !action.startsWith('auth.')) {
      if (await tryResume()) return send<T>(action, payload, session.token);
      session.clear(false);
      emit('logout');
    }
    if (e instanceof ApiError && e.code === 'UPDATE_REQUIRED') emit('update');
    throw e;
  }
}
