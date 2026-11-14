/**
 * جهاز بصمة افتراضي لوضع التطوير المحلي فقط (npm run dev:mock).
 * يحاكي الهاتف بمفاتيح ECDSA حقيقية عبر WebCrypto حتى تُختبر الواجهة والخادم كاملين بلا هاتف.
 * التشغيل من وحدة التحكم: kmkVirtualDevice() ثم إعادة التحميل. الإيقاف: kmkVirtualDevice(false)
 */
const FLAG = 'kmk.vdev.on';
const KEYS = 'kmk.vdev.keys';

const b64u = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const cat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  parts.forEach((p) => { out.set(p, o); o += p.length; });
  return out;
};
const sha = async (b: Uint8Array) => new Uint8Array(await crypto.subtle.digest('SHA-256', b));
const toBytes = (x: BufferSource) => (x instanceof ArrayBuffer ? new Uint8Array(x) : new Uint8Array(x.buffer, x.byteOffset, x.byteLength));

type Cbor = number | string | Uint8Array | Cbor[] | Map<Cbor, Cbor>;
function cbor(v: Cbor): Uint8Array {
  const head = (m: number, n: number) => (n < 24 ? Uint8Array.of((m << 5) | n) : n < 256 ? Uint8Array.of((m << 5) | 24, n) : Uint8Array.of((m << 5) | 25, n >> 8, n & 255));
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') { const b = new TextEncoder().encode(v); return cat(head(3, b.length), b); }
  if (v instanceof Uint8Array) return cat(head(2, v.length), v);
  if (Array.isArray(v)) return cat(head(4, v.length), ...v.map(cbor));
  return cat(head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)]));
}

/** توقيع WebCrypto الخام (r||s) إلى DER */
function der(raw: Uint8Array) {
  const int = (b: Uint8Array) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    b = b.slice(i);
    if (b[0] & 0x80) b = cat(Uint8Array.of(0), b);
    return cat(Uint8Array.of(2, b.length), b);
  };
  const body = cat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return cat(Uint8Array.of(0x30, body.length), body);
}

function loadKeys(): Record<string, { priv: JsonWebKey; user?: string }> {
  try { return JSON.parse(localStorage.getItem(KEYS) || '{}'); } catch { return {}; }
}

function install() {
  const w = window as unknown as { PublicKeyCredential?: { isUserVerifyingPlatformAuthenticatorAvailable?: () => Promise<boolean> } };
  if (w.PublicKeyCredential) Object.defineProperty(w.PublicKeyCredential, 'isUserVerifyingPlatformAuthenticatorAvailable', { value: async () => true, configurable: true });
  const creds = navigator.credentials as unknown as Record<string, unknown>;
  const authData = async (rpId: string, flags: number, extra?: Uint8Array) =>
    cat(await sha(new TextEncoder().encode(rpId)), Uint8Array.of(flags), Uint8Array.of(0, 0, 0, 1), extra || new Uint8Array());
  const clientData = (type: string, challenge: BufferSource) =>
    new TextEncoder().encode(JSON.stringify({ type, challenge: b64u(toBytes(challenge)), origin: location.origin, crossOrigin: false }));

  creds.create = async ({ publicKey: o }: { publicKey: PublicKeyCredentialCreationOptions }) => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']) as CryptoKeyPair;
    const pub = await crypto.subtle.exportKey('jwk', pair.publicKey);
    const id = crypto.getRandomValues(new Uint8Array(16));
    const dec = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const cose = cbor(new Map<Cbor, Cbor>([[1, 2], [3, -7], [-1, 1], [-2, dec(pub.x!)], [-3, dec(pub.y!)]]));
    const ad = await authData(o.rp.id || location.hostname, 0x45, cat(new Uint8Array(16), Uint8Array.of(0, id.length), id, cose));
    const keys = loadKeys();
    keys[b64u(id)] = { priv: await crypto.subtle.exportKey('jwk', pair.privateKey), user: b64u(toBytes(o.user.id)) };
    localStorage.setItem(KEYS, JSON.stringify(keys));
    const att = cbor(new Map<Cbor, Cbor>([['fmt', 'none'], ['attStmt', new Map()], ['authData', ad]]));
    return { id: b64u(id), type: 'public-key', response: { clientDataJSON: clientData('webauthn.create', o.challenge).buffer, attestationObject: att.buffer } };
  };

  creds.get = async ({ publicKey: o }: { publicKey: PublicKeyCredentialRequestOptions }) => {
    const keys = loadKeys();
    const allowed = (o.allowCredentials || []).map((c) => b64u(toBytes(c.id)));
    // بلا قائمة مسموحة (الدخول بالبصمة): يختار المتصفح أحدث مفتاح محفوظ
    const id = allowed.length ? allowed.find((x) => keys[x]) : Object.keys(keys).pop();
    if (!id) throw new DOMException('no credential', 'NotAllowedError');
    const priv = await crypto.subtle.importKey('jwk', keys[id].priv, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
    const ad = await authData(o.rpId || location.hostname, 0x05);
    const cd = clientData('webauthn.get', o.challenge);
    const sig = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, priv, cat(ad, await sha(cd))));
    return { id, type: 'public-key', response: { clientDataJSON: cd.buffer, authenticatorData: ad.buffer, signature: der(sig).buffer, userHandle: keys[id].user ? Uint8Array.from(atob(keys[id].user!.replace(/-/g, '+').replace(/_/g, '/') + '=='.slice(0, (4 - (keys[id].user!.length % 4)) % 4)), (c) => c.charCodeAt(0)).buffer : null } };
  };
}

try { if (localStorage.getItem(FLAG) === '1') install(); } catch { /* لا تخزين */ }

(globalThis as unknown as { kmkVirtualDevice: (on?: boolean) => string }).kmkVirtualDevice = (on = true) => {
  if (on) { localStorage.setItem(FLAG, '1'); install(); return 'الجهاز الافتراضي مفعّل. أعد تحميل الصفحة.'; }
  localStorage.removeItem(FLAG); localStorage.removeItem(KEYS);
  return 'أُوقف الجهاز الافتراضي.';
};
