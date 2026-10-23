// Proof that an installation can read the address its burner emails forward to.
// Codes are six digits, hashed at rest, and only ever checked against one (installation, address) row.
const TABLE = 'forwarding_verifications';

export const CODE_TTL_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;
export const MAX_SENDS_PER_ADDRESS_PER_DAY = 5;
export const MAX_SENDS_PER_ADDRESS_PER_HOUR_ALL_INSTALLATIONS = 3;
export const MAX_ADDRESSES_PER_INSTALLATION_PER_DAY = 5;

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export interface VerificationRow {
  id: string;
  installation_id: string;
  email: string;
  code_hash: string | null;
  code_expires_at: string | null;
  attempts: number;
  send_count: number;
  send_window_start: string | null;
  last_sent_at: string | null;
  verified_at: string | null;
}

export type StartResult =
  | { ok: true; alreadyVerified: true }
  | { ok: true; alreadyVerified: false; code: string }
  | { ok: false; reason: 'cooldown' | 'send_limit' | 'address_busy' | 'too_many_addresses'; retryAfterSeconds: number }
  | { ok: false; reason: 'error'; retryAfterSeconds: 0 };

export type ConfirmResult =
  | { ok: true }
  | { ok: false; reason: 'no_pending' | 'expired' | 'too_many_attempts' | 'invalid_code' | 'try_again' | 'error' };

export type VerifiedState = 'verified' | 'unverified' | 'error';

// Uniform six digit code without modulo bias
export function generateCode(): string {
  const limit = 4_294_967_296 - (4_294_967_296 % 1_000_000);
  const buffer = new Uint32Array(1);
  do {
    crypto.getRandomValues(buffer);
  } while (buffer[0] >= limit);
  return String(buffer[0] % 1_000_000).padStart(6, '0');
}

export async function hashCode(code: string, installationId: string, email: string): Promise<string> {
  const data = new TextEncoder().encode(`${installationId}:${email}:${code}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

function secondsUntil(from: number, target: number): number {
  return Math.max(1, Math.ceil((target - from) / 1000));
}

export async function isForwardingVerified(
  supabase: any,
  installationId: string,
  email: string
): Promise<VerifiedState> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('verified_at')
    .eq('installation_id', installationId)
    .eq('email', email.toLowerCase().trim())
    .maybeSingle();

  if (error) {
    return 'error';
  }
  return data?.verified_at ? 'verified' : 'unverified';
}

export async function startVerification(
  supabase: any,
  installationId: string,
  rawEmail: string,
  now: number = Date.now()
): Promise<StartResult> {
  const email = rawEmail.toLowerCase().trim();
  const failed: StartResult = { ok: false, reason: 'error', retryAfterSeconds: 0 };

  const { data: row, error: rowError } = await supabase
    .from(TABLE)
    .select('*')
    .eq('installation_id', installationId)
    .eq('email', email)
    .maybeSingle();

  if (rowError) {
    return failed;
  }

  const existing = row as VerificationRow | null;
  if (existing?.verified_at) {
    return { ok: true, alreadyVerified: true };
  }

  if (existing?.last_sent_at) {
    const readyAt = new Date(existing.last_sent_at).getTime() + RESEND_COOLDOWN_MS;
    if (now < readyAt) {
      return { ok: false, reason: 'cooldown', retryAfterSeconds: secondsUntil(now, readyAt) };
    }
  }

  const windowStart = existing?.send_window_start ? new Date(existing.send_window_start).getTime() : 0;
  const windowOpen = windowStart > 0 && now - windowStart < DAY_MS;
  const sendsInWindow = windowOpen ? existing!.send_count : 0;

  if (sendsInWindow >= MAX_SENDS_PER_ADDRESS_PER_DAY) {
    return { ok: false, reason: 'send_limit', retryAfterSeconds: secondsUntil(now, windowStart + DAY_MS) };
  }

  // The same address can be requested from many installations, so cap it across all of them
  const addressSends = await supabase
    .from(TABLE)
    .select('id', { count: 'exact', head: true })
    .eq('email', email)
    .gte('last_sent_at', new Date(now - HOUR_MS).toISOString());

  if (addressSends.error) {
    return failed;
  }
  if ((addressSends.count ?? 0) >= MAX_SENDS_PER_ADDRESS_PER_HOUR_ALL_INSTALLATIONS) {
    return { ok: false, reason: 'address_busy', retryAfterSeconds: 3600 };
  }

  if (!existing) {
    const installationSends = await supabase
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('installation_id', installationId)
      .gte('last_sent_at', new Date(now - DAY_MS).toISOString());

    if (installationSends.error) {
      return failed;
    }
    if ((installationSends.count ?? 0) >= MAX_ADDRESSES_PER_INSTALLATION_PER_DAY) {
      return { ok: false, reason: 'too_many_addresses', retryAfterSeconds: 3600 };
    }
  }

  const code = generateCode();
  const fields = {
    code_hash: await hashCode(code, installationId, email),
    code_expires_at: new Date(now + CODE_TTL_MS).toISOString(),
    attempts: 0,
    send_count: sendsInWindow + 1,
    send_window_start: new Date(windowOpen ? windowStart : now).toISOString(),
    last_sent_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
  };

  const write = existing
    ? await supabase.from(TABLE).update(fields).eq('id', existing.id)
    : await supabase.from(TABLE).insert({ installation_id: installationId, email, ...fields });

  if (write.error) {
    return failed;
  }

  return { ok: true, alreadyVerified: false, code };
}

// Used when the verification email could not be delivered, so the user can retry straight away
export async function discardPendingCode(supabase: any, installationId: string, rawEmail: string): Promise<void> {
  await supabase
    .from(TABLE)
    .update({ code_hash: null, code_expires_at: null, last_sent_at: null })
    .eq('installation_id', installationId)
    .eq('email', rawEmail.toLowerCase().trim())
    .is('verified_at', null);
}

export async function confirmVerification(
  supabase: any,
  installationId: string,
  rawEmail: string,
  code: string,
  now: number = Date.now()
): Promise<ConfirmResult> {
  const email = rawEmail.toLowerCase().trim();

  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('installation_id', installationId)
    .eq('email', email)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: 'error' };
  }

  const row = data as VerificationRow | null;
  if (row?.verified_at) {
    return { ok: true };
  }
  if (!row || !row.code_hash || !row.code_expires_at) {
    return { ok: false, reason: 'no_pending' };
  }
  if (new Date(row.code_expires_at).getTime() < now) {
    return { ok: false, reason: 'expired' };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts' };
  }

  // Count the attempt first, and only if nobody else changed the row, so parallel guesses cannot skip the limit
  const counted = await supabase
    .from(TABLE)
    .update({ attempts: row.attempts + 1, updated_at: new Date(now).toISOString() })
    .eq('id', row.id)
    .eq('attempts', row.attempts)
    .select('id');

  if (counted.error) {
    return { ok: false, reason: 'error' };
  }
  if (!counted.data || counted.data.length === 0) {
    return { ok: false, reason: 'try_again' };
  }

  const submitted = await hashCode(code, installationId, email);
  if (submitted !== row.code_hash) {
    return { ok: false, reason: 'invalid_code' };
  }

  const verified = await supabase
    .from(TABLE)
    .update({
      verified_at: new Date(now).toISOString(),
      verified_via: 'code',
      code_hash: null,
      code_expires_at: null,
      updated_at: new Date(now).toISOString(),
    })
    .eq('id', row.id);

  if (verified.error) {
    return { ok: false, reason: 'error' };
  }

  return { ok: true };
}
