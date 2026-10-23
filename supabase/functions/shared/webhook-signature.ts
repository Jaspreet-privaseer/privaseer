// Verifies Resend (Svix) webhook signatures: HMAC-SHA256 over "<id>.<timestamp>.<body>"
const TOLERANCE_SECONDS = 5 * 60;

export type SignatureResult =
  | { valid: true }
  | { valid: false; reason: 'missing_headers' | 'bad_secret' | 'bad_timestamp' | 'timestamp_out_of_range' | 'no_match' };

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function verifyWebhookSignature(
  rawBody: string,
  headers: Headers,
  secret: string,
  nowMs: number = Date.now()
): Promise<SignatureResult> {
  const id = headers.get('svix-id');
  const timestamp = headers.get('svix-timestamp');
  const signatureHeader = headers.get('svix-signature');

  if (!id || !timestamp || !signatureHeader) {
    return { valid: false, reason: 'missing_headers' };
  }

  const seconds = Number(timestamp);
  if (!Number.isInteger(seconds)) {
    return { valid: false, reason: 'bad_timestamp' };
  }
  if (Math.abs(nowMs / 1000 - seconds) > TOLERANCE_SECONDS) {
    return { valid: false, reason: 'timestamp_out_of_range' };
  }

  let key: CryptoKey;
  try {
    const keyBytes = base64ToBytes(secret.trim().replace(/^whsec_/, ''));
    key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  } catch {
    return { valid: false, reason: 'bad_secret' };
  }

  const signedContent = new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`);

  // The header can hold several space separated signatures (e.g. while a secret is rotating)
  for (const entry of signatureHeader.split(' ')) {
    const [version, encoded] = entry.split(',');
    if (version !== 'v1' || !encoded) {
      continue;
    }

    try {
      if (await crypto.subtle.verify('HMAC', key, base64ToBytes(encoded), signedContent)) {
        return { valid: true };
      }
    } catch {
      // malformed base64 in this entry, try the next one
    }
  }

  return { valid: false, reason: 'no_match' };
}
