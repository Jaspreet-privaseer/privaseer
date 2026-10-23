/**
 * @file src/tests/supabase/verify-forwarding-email/handler.test.ts
 *
 * Test Type: Unit
 * Contexts Tested: verify-forwarding-email request handling
 * Prerequisites: None
 */

import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import {
  buildCodeEmail,
  handleVerificationRequest,
} from '../../../../supabase/functions/verify-forwarding-email/handler';
import { FakeSupabase } from '../fake-supabase';

const installation = '11111111-1111-4111-8111-111111111111';
const now = 1_760_000_000_000;

let db: FakeSupabase;
let sendCodeEmail: Mock<(to: string, code: string) => Promise<{ ok: boolean }>>;
let authenticate: Mock<(req: Request) => Promise<{ installationId: string }>>;

function request(body: unknown, init: { method?: string; raw?: string } = {}): Request {
  return new Request('https://example.test/functions/v1/verify-forwarding-email', {
    method: init.method ?? 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer token' },
    body: init.method === 'GET' ? undefined : (init.raw ?? JSON.stringify(body)),
  });
}

function call(req: Request, at = now) {
  return handleVerificationRequest(req, { supabase: db, authenticate, sendCodeEmail, now: () => at });
}

beforeEach(() => {
  db = new FakeSupabase();
  sendCodeEmail = vi.fn<(to: string, code: string) => Promise<{ ok: boolean }>>().mockResolvedValue({ ok: true });
  authenticate = vi.fn<(req: Request) => Promise<{ installationId: string }>>().mockResolvedValue({ installationId: installation });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

describe('handleVerificationRequest', () => {
  it('answers preflight requests without authenticating', async () => {
    const res = await call(request(null, { method: 'OPTIONS' }));
    expect(res.status).toBe(200);
    expect(authenticate).not.toHaveBeenCalled();
  });

  it('rejects other methods', async () => {
    const res = await call(request(null, { method: 'GET' }));
    expect(res.status).toBe(405);
  });

  it('passes through the authentication failure response', async () => {
    authenticate.mockRejectedValue(new Response('{}', { status: 401 }));
    const res = await call(request({ action: 'send', realEmail: 'a@example.com' }));
    expect(res.status).toBe(401);
    expect(sendCodeEmail).not.toHaveBeenCalled();
  });

  it('returns 401 when authentication throws something unexpected', async () => {
    authenticate.mockRejectedValue(new Error('boom'));
    const res = await call(request({ action: 'send', realEmail: 'a@example.com' }));
    expect(res.status).toBe(401);
  });

  it('rejects bodies that are not valid', async () => {
    expect((await call(request(null, { raw: 'not json' }))).status).toBe(400);
    expect((await call(request({ action: 'delete', realEmail: 'a@example.com' }))).status).toBe(400);
    expect((await call(request({ action: 'send' }))).status).toBe(400);
    expect((await call(request({ action: 'send', realEmail: 'not an email' }))).status).toBe(400);
  });

  it('rejects display-name forms so the stored key matches the burner email record', async () => {
    const res = await call(request({ action: 'send', realEmail: 'Person <person@example.com>' }));
    expect(res.status).toBe(400);
    expect(sendCodeEmail).not.toHaveBeenCalled();
  });

  describe('status', () => {
    it('reports whether the address is verified for this installation', async () => {
      const before = await call(request({ action: 'status', realEmail: 'a@example.com' }));
      expect(await before.json()).toEqual({ success: true, verified: false });

      db.seed({ installation_id: installation, email: 'a@example.com', verified_at: new Date(now).toISOString() });
      const after = await call(request({ action: 'status', realEmail: 'A@Example.com' }));
      expect(await after.json()).toEqual({ success: true, verified: true });
      expect(sendCodeEmail).not.toHaveBeenCalled();
    });

    it('does not report another installation as verified', async () => {
      db.seed({ installation_id: 'someone-else', email: 'a@example.com', verified_at: new Date(now).toISOString() });
      const res = await call(request({ action: 'status', realEmail: 'a@example.com' }));
      expect((await res.json()).verified).toBe(false);
    });

    it('returns 503 when the database is unavailable', async () => {
      db.failNext = 'select';
      const res = await call(request({ action: 'status', realEmail: 'a@example.com' }));
      expect(res.status).toBe(503);
    });
  });

  describe('send', () => {
    it('emails a code to the address and never returns it to the caller', async () => {
      const res = await call(request({ action: 'send', realEmail: 'Person@Example.com' }));
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body).toEqual({ success: true, alreadyVerified: false });
      expect(sendCodeEmail).toHaveBeenCalledTimes(1);
      const [to, code] = sendCodeEmail.mock.calls[0];
      expect(to).toBe('person@example.com');
      expect(code).toMatch(/^\d{6}$/);
      expect(JSON.stringify(body)).not.toContain(code);
    });

    it('does not email an address that is already verified', async () => {
      db.seed({ installation_id: installation, email: 'a@example.com', verified_at: new Date(now).toISOString() });
      const res = await call(request({ action: 'send', realEmail: 'a@example.com' }));
      expect(await res.json()).toEqual({ success: true, alreadyVerified: true });
      expect(sendCodeEmail).not.toHaveBeenCalled();
    });

    it('returns 429 with Retry-After during the cooldown', async () => {
      await call(request({ action: 'send', realEmail: 'a@example.com' }));
      const res = await call(request({ action: 'send', realEmail: 'a@example.com' }), now + 10_000);
      const body = await res.json();

      expect(res.status).toBe(429);
      expect(res.headers.get('Retry-After')).toBe('50');
      expect(body.reason).toBe('cooldown');
      expect(sendCodeEmail).toHaveBeenCalledTimes(1);
    });

    it('frees the cooldown when the email cannot be delivered', async () => {
      sendCodeEmail.mockResolvedValueOnce({ ok: false });
      const failed = await call(request({ action: 'send', realEmail: 'a@example.com' }));
      expect(failed.status).toBe(502);

      const retry = await call(request({ action: 'send', realEmail: 'a@example.com' }), now + 1000);
      expect(retry.status).toBe(200);
    });

    it('returns 503 when the database is unavailable', async () => {
      db.failNext = 'select';
      const res = await call(request({ action: 'send', realEmail: 'a@example.com' }));
      expect(res.status).toBe(503);
      expect(res.headers.get('Retry-After')).toBe('60');
      expect(sendCodeEmail).not.toHaveBeenCalled();
    });
  });

  describe('confirm', () => {
    async function sentCode(): Promise<string> {
      await call(request({ action: 'send', realEmail: 'a@example.com' }));
      return sendCodeEmail.mock.calls[0][1];
    }

    it('verifies with the emailed code', async () => {
      const code = await sentCode();
      const res = await call(request({ action: 'confirm', realEmail: 'a@example.com', code }), now + 5000);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true, verified: true });
      expect(db.rows[0].verified_at).not.toBeNull();
    });

    it('requires a six digit code', async () => {
      for (const code of [undefined, '', '12345', '1234567', 'abcdef', 123456]) {
        const res = await call(request({ action: 'confirm', realEmail: 'a@example.com', code }));
        expect(res.status).toBe(400);
      }
    });

    it('rejects a wrong code with 400', async () => {
      const code = await sentCode();
      const wrong = code === '000000' ? '000001' : '000000';
      const res = await call(request({ action: 'confirm', realEmail: 'a@example.com', code: wrong }), now + 5000);
      expect(res.status).toBe(400);
      expect((await res.json()).reason).toBe('invalid_code');
    });

    it('returns 429 once the attempts are used up', async () => {
      const code = await sentCode();
      const wrong = code === '000000' ? '000001' : '000000';
      for (let i = 0; i < 5; i++) {
        await call(request({ action: 'confirm', realEmail: 'a@example.com', code: wrong }), now + 5000);
      }
      const res = await call(request({ action: 'confirm', realEmail: 'a@example.com', code }), now + 6000);
      expect(res.status).toBe(429);
      expect(db.rows[0].verified_at).toBeNull();
    });

    it('rejects a code for an address nobody asked to verify', async () => {
      const res = await call(request({ action: 'confirm', realEmail: 'a@example.com', code: '123456' }));
      expect(res.status).toBe(400);
      expect((await res.json()).reason).toBe('no_pending');
    });

    it('returns 503 when the database is unavailable', async () => {
      db.failNext = 'select';
      const res = await call(request({ action: 'confirm', realEmail: 'a@example.com', code: '123456' }));
      expect(res.status).toBe(503);
    });
  });
});

describe('buildCodeEmail', () => {
  it('puts the code in the subject, text and html', () => {
    const mail = buildCodeEmail('042917');
    expect(mail.subject).toContain('042917');
    expect(mail.text).toContain('042917');
    expect(mail.html).toContain('042917');
  });
});
