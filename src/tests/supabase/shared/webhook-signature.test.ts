/**
 * @file src/tests/supabase/shared/webhook-signature.test.ts
 *
 * Test Type: Unit
 * Contexts Tested: Supabase edge function webhook verification
 * Prerequisites: None
 */

import { describe, expect, it } from 'vitest';
import { verifyWebhookSignature } from '../../../../supabase/functions/shared/webhook-signature';

const secretBytes = new Uint8Array(32).map((_, i) => i + 1);
const secret = `whsec_${Buffer.from(secretBytes).toString('base64')}`;
const body = JSON.stringify({ type: 'email.received', data: { to: ['mika47@burner.privaseer.co.uk'] } });
const now = 1_760_000_000_000;
const timestamp = String(Math.floor(now / 1000));

async function sign(id: string, ts: string, payload: string, keyBytes = secretBytes): Promise<string> {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${payload}`));
  return `v1,${Buffer.from(sig).toString('base64')}`;
}

function headers(values: Record<string, string>): Headers {
  return new Headers(values);
}

describe('verifyWebhookSignature', () => {
  it('accepts a correctly signed request', async () => {
    const signature = await sign('msg_1', timestamp, body);
    const result = await verifyWebhookSignature(
      body,
      headers({ 'svix-id': 'msg_1', 'svix-timestamp': timestamp, 'svix-signature': signature }),
      secret,
      now
    );
    expect(result).toEqual({ valid: true });
  });

  it('accepts when one of several signatures matches', async () => {
    const good = await sign('msg_1', timestamp, body);
    const other = await sign('msg_1', timestamp, body, new Uint8Array(32).fill(9));
    const result = await verifyWebhookSignature(
      body,
      headers({ 'svix-id': 'msg_1', 'svix-timestamp': timestamp, 'svix-signature': `${other} ${good}` }),
      secret,
      now
    );
    expect(result.valid).toBe(true);
  });

  it('rejects a body that was changed after signing', async () => {
    const signature = await sign('msg_1', timestamp, body);
    const result = await verifyWebhookSignature(
      body.replace('mika47', 'evil99'),
      headers({ 'svix-id': 'msg_1', 'svix-timestamp': timestamp, 'svix-signature': signature }),
      secret,
      now
    );
    expect(result).toEqual({ valid: false, reason: 'no_match' });
  });

  it('rejects a signature made with a different secret', async () => {
    const signature = await sign('msg_1', timestamp, body, new Uint8Array(32).fill(7));
    const result = await verifyWebhookSignature(
      body,
      headers({ 'svix-id': 'msg_1', 'svix-timestamp': timestamp, 'svix-signature': signature }),
      secret,
      now
    );
    expect(result).toEqual({ valid: false, reason: 'no_match' });
  });

  it('rejects when headers are missing', async () => {
    const result = await verifyWebhookSignature(body, headers({}), secret, now);
    expect(result).toEqual({ valid: false, reason: 'missing_headers' });
  });

  it('rejects an old timestamp even with a valid signature', async () => {
    const old = String(Math.floor(now / 1000) - 600);
    const signature = await sign('msg_1', old, body);
    const result = await verifyWebhookSignature(
      body,
      headers({ 'svix-id': 'msg_1', 'svix-timestamp': old, 'svix-signature': signature }),
      secret,
      now
    );
    expect(result).toEqual({ valid: false, reason: 'timestamp_out_of_range' });
  });

  it('rejects a timestamp too far in the future', async () => {
    const future = String(Math.floor(now / 1000) + 600);
    const signature = await sign('msg_1', future, body);
    const result = await verifyWebhookSignature(
      body,
      headers({ 'svix-id': 'msg_1', 'svix-timestamp': future, 'svix-signature': signature }),
      secret,
      now
    );
    expect(result).toEqual({ valid: false, reason: 'timestamp_out_of_range' });
  });

  it('rejects a non numeric timestamp', async () => {
    const result = await verifyWebhookSignature(
      body,
      headers({ 'svix-id': 'msg_1', 'svix-timestamp': 'abc', 'svix-signature': 'v1,AAAA' }),
      secret,
      now
    );
    expect(result).toEqual({ valid: false, reason: 'bad_timestamp' });
  });

  it('ignores unknown versions and malformed entries', async () => {
    const result = await verifyWebhookSignature(
      body,
      headers({ 'svix-id': 'msg_1', 'svix-timestamp': timestamp, 'svix-signature': 'v2,AAAA v1,!!!notbase64 junk' }),
      secret,
      now
    );
    expect(result).toEqual({ valid: false, reason: 'no_match' });
  });

  it('reports an unusable secret instead of throwing', async () => {
    const result = await verifyWebhookSignature(
      body,
      headers({ 'svix-id': 'msg_1', 'svix-timestamp': timestamp, 'svix-signature': 'v1,AAAA' }),
      'whsec_%%%not-base64%%%',
      now
    );
    expect(result).toEqual({ valid: false, reason: 'bad_secret' });
  });
});
