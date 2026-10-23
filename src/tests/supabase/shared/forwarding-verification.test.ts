/**
 * @file src/tests/supabase/shared/forwarding-verification.test.ts
 *
 * Test Type: Unit
 * Contexts Tested: Supabase edge function forwarding email verification
 * Prerequisites: None
 */

import { beforeEach, describe, expect, it } from 'vitest';
import {
  CODE_TTL_MS,
  MAX_ADDRESSES_PER_INSTALLATION_PER_DAY,
  MAX_ATTEMPTS,
  MAX_SENDS_PER_ADDRESS_PER_DAY,
  RESEND_COOLDOWN_MS,
  confirmVerification,
  discardPendingCode,
  generateCode,
  hashCode,
  isForwardingVerified,
  startVerification,
} from '../../../../supabase/functions/shared/forwarding-verification';

type Row = Record<string, any>;

// Small in-memory stand-in for the parts of the Supabase query builder the helper uses
class FakeSupabase {
  rows: Row[] = [];
  failNext: string | null = null;
  beforeUpdate: (() => void) | null = null;
  private nextId = 1;

  from(_table: string) {
    return new FakeQuery(this);
  }

  seed(row: Row): Row {
    const full = {
      id: `row-${this.nextId++}`,
      code_hash: null,
      code_expires_at: null,
      attempts: 0,
      send_count: 0,
      send_window_start: null,
      last_sent_at: null,
      verified_at: null,
      ...row,
    };
    this.rows.push(full);
    return full;
  }
}

class FakeQuery implements PromiseLike<any> {
  private op: 'select' | 'insert' | 'update' = 'select';
  private values: Row = {};
  private filters: Array<(r: Row) => boolean> = [];
  private head = false;
  private single = false;
  private returning = false;

  constructor(private db: FakeSupabase) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === 'update') {
      this.returning = true;
    }
    this.head = !!opts?.head;
    return this;
  }
  insert(values: Row) {
    this.op = 'insert';
    this.values = values;
    return this;
  }
  update(values: Row) {
    this.op = 'update';
    this.values = values;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  gte(col: string, val: string) {
    this.filters.push((r) => r[col] != null && r[col] >= val);
    return this;
  }
  is(col: string, val: null) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  maybeSingle() {
    this.single = true;
    return this;
  }

  private run() {
    if (this.db.failNext === this.op) {
      this.db.failNext = null;
      return { data: null, count: null, error: { message: 'db down' } };
    }
    if (this.op === 'update' && this.db.beforeUpdate) {
      const hook = this.db.beforeUpdate;
      this.db.beforeUpdate = null;
      hook();
    }
    const matches = this.db.rows.filter((r) => this.filters.every((f) => f(r)));

    if (this.op === 'insert') {
      this.db.seed(this.values);
      return { data: null, error: null };
    }
    if (this.op === 'update') {
      matches.forEach((r) => Object.assign(r, this.values));
      return { data: this.returning ? matches.map((r) => ({ id: r.id })) : null, error: null };
    }
    if (this.head) {
      return { data: null, count: matches.length, error: null };
    }
    const copies = matches.map((r) => ({ ...r }));
    return { data: this.single ? (copies[0] ?? null) : copies, error: null };
  }

  then<T1 = any, T2 = never>(
    onfulfilled?: ((value: any) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: any) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

const installation = '11111111-1111-4111-8111-111111111111';
const email = 'person@example.com';
const now = 1_760_000_000_000;

let db: FakeSupabase;

beforeEach(() => {
  db = new FakeSupabase();
});

async function started(at = now) {
  const result = await startVerification(db, installation, email, at);
  if (!result.ok || result.alreadyVerified) {
    throw new Error('expected a code to be issued');
  }
  return result.code;
}

describe('generateCode / hashCode', () => {
  it('returns six digits, including leading zeros', () => {
    for (let i = 0; i < 200; i++) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it('ties the hash to the installation and address', async () => {
    const a = await hashCode('123456', installation, email);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashCode('123456', installation, email)).toBe(a);
    expect(await hashCode('123456', 'other', email)).not.toBe(a);
    expect(await hashCode('123456', installation, 'x@example.com')).not.toBe(a);
  });
});

describe('isForwardingVerified', () => {
  it('is unverified with no row or a pending row', async () => {
    expect(await isForwardingVerified(db, installation, email)).toBe('unverified');
    db.seed({ installation_id: installation, email });
    expect(await isForwardingVerified(db, installation, email)).toBe('unverified');
  });

  it('is verified once verified_at is set, whatever the case of the address', async () => {
    db.seed({ installation_id: installation, email, verified_at: new Date(now).toISOString() });
    expect(await isForwardingVerified(db, installation, 'Person@Example.com ')).toBe('verified');
  });

  it('does not count another installation as verified', async () => {
    db.seed({ installation_id: 'someone-else', email, verified_at: new Date(now).toISOString() });
    expect(await isForwardingVerified(db, installation, email)).toBe('unverified');
  });

  it('reports a lookup failure instead of guessing', async () => {
    db.failNext = 'select';
    expect(await isForwardingVerified(db, installation, email)).toBe('error');
  });
});

describe('startVerification', () => {
  it('issues a code and stores only its hash', async () => {
    const code = await started();
    expect(code).toMatch(/^\d{6}$/);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].code_hash).toBe(await hashCode(code, installation, email));
    expect(JSON.stringify(db.rows[0])).not.toContain(code);
    expect(new Date(db.rows[0].code_expires_at).getTime()).toBe(now + CODE_TTL_MS);
  });

  it('normalizes the address', async () => {
    await startVerification(db, installation, '  Person@Example.COM ', now);
    expect(db.rows[0].email).toBe(email);
  });

  it('does nothing for an address that is already verified', async () => {
    db.seed({ installation_id: installation, email, verified_at: new Date(now).toISOString() });
    expect(await startVerification(db, installation, email, now)).toEqual({ ok: true, alreadyVerified: true });
  });

  it('enforces the resend cooldown and then allows a resend', async () => {
    await started();
    const blocked = await startVerification(db, installation, email, now + 10_000);
    expect(blocked).toEqual({ ok: false, reason: 'cooldown', retryAfterSeconds: 50 });

    const again = await startVerification(db, installation, email, now + RESEND_COOLDOWN_MS);
    expect(again.ok).toBe(true);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].send_count).toBe(2);
  });

  it('resets attempts when a new code is issued', async () => {
    await started();
    db.rows[0].attempts = 4;
    await started(now + RESEND_COOLDOWN_MS);
    expect(db.rows[0].attempts).toBe(0);
  });

  it('caps sends per address per day', async () => {
    for (let i = 0; i < MAX_SENDS_PER_ADDRESS_PER_DAY; i++) {
      // spaced beyond the hourly all-installation cap so only the daily cap can trip
      await started(now + i * 61 * 60_000);
    }
    const blocked = await startVerification(db, installation, email, now + 23.5 * 3600_000);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) {
      expect(blocked.reason).toBe('send_limit');
    }
  });

  it('allows sending again after the daily window passes', async () => {
    db.seed({
      installation_id: installation,
      email,
      send_count: MAX_SENDS_PER_ADDRESS_PER_DAY,
      send_window_start: new Date(now - 25 * 3600_000).toISOString(),
      last_sent_at: new Date(now - 25 * 3600_000).toISOString(),
    });
    const result = await startVerification(db, installation, email, now);
    expect(result.ok).toBe(true);
    expect(db.rows[0].send_count).toBe(1);
  });

  it('caps requests for one address across many installations', async () => {
    for (let i = 0; i < 3; i++) {
      db.seed({ installation_id: `other-${i}`, email, last_sent_at: new Date(now - 60_000).toISOString() });
    }
    const result = await startVerification(db, installation, email, now);
    expect(result).toEqual({ ok: false, reason: 'address_busy', retryAfterSeconds: 3600 });
    expect(db.rows).toHaveLength(3);
  });

  it('caps how many addresses one installation can try per day', async () => {
    for (let i = 0; i < MAX_ADDRESSES_PER_INSTALLATION_PER_DAY; i++) {
      db.seed({ installation_id: installation, email: `a${i}@example.com`, last_sent_at: new Date(now - 1000).toISOString() });
    }
    const result = await startVerification(db, installation, email, now);
    expect(result).toEqual({ ok: false, reason: 'too_many_addresses', retryAfterSeconds: 3600 });
  });

  it('reports database failures without issuing a code', async () => {
    db.failNext = 'select';
    expect(await startVerification(db, installation, email, now)).toEqual({ ok: false, reason: 'error', retryAfterSeconds: 0 });

    db.failNext = 'insert';
    expect(await startVerification(db, installation, email, now)).toEqual({ ok: false, reason: 'error', retryAfterSeconds: 0 });
  });
});

describe('discardPendingCode', () => {
  it('clears an unverified code and the cooldown so the user can retry', async () => {
    await started();
    await discardPendingCode(db, installation, email);
    expect(db.rows[0].code_hash).toBeNull();
    expect(db.rows[0].last_sent_at).toBeNull();
    expect((await startVerification(db, installation, email, now + 1000)).ok).toBe(true);
  });

  it('never touches a verified row', async () => {
    const verifiedAt = new Date(now).toISOString();
    db.seed({ installation_id: installation, email, verified_at: verifiedAt, last_sent_at: verifiedAt });
    await discardPendingCode(db, installation, email);
    expect(db.rows[0].last_sent_at).toBe(verifiedAt);
  });
});

describe('confirmVerification', () => {
  it('verifies with the right code and drops the stored hash', async () => {
    const code = await started();
    expect(await confirmVerification(db, installation, email, code, now + 1000)).toEqual({ ok: true });
    expect(db.rows[0].verified_at).not.toBeNull();
    expect(db.rows[0].verified_via).toBe('code');
    expect(db.rows[0].code_hash).toBeNull();
    expect(await isForwardingVerified(db, installation, email)).toBe('verified');
  });

  it('treats an already verified address as success', async () => {
    db.seed({ installation_id: installation, email, verified_at: new Date(now).toISOString() });
    expect(await confirmVerification(db, installation, email, '000000', now)).toEqual({ ok: true });
  });

  it('rejects a wrong code and counts the attempt', async () => {
    const code = await started();
    const wrong = code === '000000' ? '000001' : '000000';
    expect(await confirmVerification(db, installation, email, wrong, now + 1000)).toEqual({ ok: false, reason: 'invalid_code' });
    expect(db.rows[0].attempts).toBe(1);
    expect(db.rows[0].verified_at).toBeNull();
  });

  it('locks the code after too many wrong attempts, even for the right code', async () => {
    const code = await started();
    const wrong = code === '000000' ? '000001' : '000000';
    for (let i = 0; i < MAX_ATTEMPTS; i++) {
      await confirmVerification(db, installation, email, wrong, now + 1000);
    }
    expect(await confirmVerification(db, installation, email, code, now + 2000)).toEqual({ ok: false, reason: 'too_many_attempts' });
    expect(db.rows[0].verified_at).toBeNull();
  });

  it('lets a fresh code work after a lockout', async () => {
    await started();
    db.rows[0].attempts = MAX_ATTEMPTS;
    const fresh = await started(now + RESEND_COOLDOWN_MS);
    expect(await confirmVerification(db, installation, email, fresh, now + RESEND_COOLDOWN_MS + 1000)).toEqual({ ok: true });
  });

  it('rejects an expired code', async () => {
    const code = await started();
    expect(await confirmVerification(db, installation, email, code, now + CODE_TTL_MS + 1)).toEqual({ ok: false, reason: 'expired' });
  });

  it('rejects when nothing was requested', async () => {
    expect(await confirmVerification(db, installation, email, '123456', now)).toEqual({ ok: false, reason: 'no_pending' });
  });

  it('does not accept a code issued to another installation', async () => {
    await started();
    expect(await confirmVerification(db, 'someone-else', email, '123456', now)).toEqual({ ok: false, reason: 'no_pending' });
  });

  it('asks the caller to retry when another request changed the row first', async () => {
    const code = await started();
    const row = db.rows[0];
    // Another guess lands between our read and our attempt update
    db.beforeUpdate = () => {
      row.attempts += 1;
    };
    expect(await confirmVerification(db, installation, email, code, now + 1000)).toEqual({ ok: false, reason: 'try_again' });
    expect(row.verified_at).toBeNull();
  });

  it('reports database failures', async () => {
    const code = await started();
    db.failNext = 'select';
    expect(await confirmVerification(db, installation, email, code, now + 1000)).toEqual({ ok: false, reason: 'error' });
  });
});
