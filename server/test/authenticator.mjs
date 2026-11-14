/**
 * جهاز افتراضي لاختبار بصمة الجهاز (WebAuthn) بمفاتيح وتوقيعات حقيقية، كما يفعلها الهاتف.
 * يبني clientDataJSON وattestationObject (fmt none) والتوقيعات بـ node:crypto.
 */
import crypto from 'node:crypto';

const b64u = (buf) => Buffer.from(buf).toString('base64url');
const sha = (buf) => crypto.createHash('sha256').update(buf).digest();

/** ترميز CBOR للأنواع اللازمة فقط */
function cbor(v) {
  const head = (major, n) => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    if (n < 65536) return Buffer.from([(major << 5) | 25, n >> 8, n & 255]);
    const b = Buffer.alloc(5); b[0] = (major << 5) | 26; b.writeUInt32BE(n, 1); return b;
  };
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') { const b = Buffer.from(v, 'utf8'); return Buffer.concat([head(3, b.length), b]); }
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (Array.isArray(v)) return Buffer.concat([head(4, v.length), ...v.map(cbor)]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  throw new Error('cbor: unsupported');
}

export function virtualAuthenticator({ alg = 'ES256', uv = true, backup = false } = {}) {
  const keys = alg === 'ES256'
    ? crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' })
    : crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const credId = crypto.randomBytes(32);
  let counter = 0;
  const jwk = keys.publicKey.export({ format: 'jwk' });
  const cose = alg === 'ES256'
    ? new Map([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]])
    : new Map([[1, 3], [3, -257], [-1, Buffer.from(jwk.n, 'base64url')], [-2, Buffer.from(jwk.e, 'base64url')]]);
  const flags = (withAttested) => 0x01 | (uv ? 0x04 : 0) | (backup ? 0x18 : 0) | (withAttested ? 0x40 : 0);
  const authData = (rpId, withAttested) => {
    const cnt = Buffer.alloc(4); cnt.writeUInt32BE(counter);
    const parts = [sha(Buffer.from(rpId)), Buffer.from([flags(withAttested)]), cnt];
    if (withAttested) {
      const len = Buffer.alloc(2); len.writeUInt16BE(credId.length);
      parts.push(Buffer.alloc(16), len, credId, cbor(cose));
    }
    return Buffer.concat(parts);
  };
  const clientData = (type, challenge, origin) => Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }));

  return {
    credentialId: b64u(credId),
    /** ما يرسله المتصفح عند التسجيل */
    create(challenge, origin = 'https://mhmodahmd.github.io') {
      const rpId = new URL(origin).hostname;
      const att = cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData(rpId, true)]]));
      return { credentialId: b64u(credId), clientDataJSON: b64u(clientData('webauthn.create', challenge, origin)), attestationObject: b64u(att), label: 'جهاز اختبار' };
    },
    /** ما يرسله المتصفح عند البصمة */
    get(challenge, origin = 'https://mhmodahmd.github.io', { credentialId } = {}) {
      const rpId = new URL(origin).hostname;
      counter++;
      const ad = authData(rpId, false);
      const cd = clientData('webauthn.get', challenge, origin);
      const msg = Buffer.concat([ad, sha(cd)]);
      const signature = alg === 'ES256'
        ? crypto.sign('sha256', msg, { key: keys.privateKey, dsaEncoding: 'der' })
        : crypto.sign('sha256', msg, keys.privateKey);
      return { credentialId: credentialId || b64u(credId), clientDataJSON: b64u(cd), authenticatorData: b64u(ad), signature: b64u(signature) };
    }
  };
}
