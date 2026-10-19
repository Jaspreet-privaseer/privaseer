/**
 * @file src/tests/supabase/shared/log-redaction.test.ts
 *
 * Test Type: Unit
 * Contexts Tested: Supabase edge function log helpers
 * Prerequisites: None
 */

import { describe, expect, it } from 'vitest';
import { maskEmail } from '../../../../supabase/functions/shared/log-redaction';

describe('maskEmail', () => {
  it('keeps the first two characters and the domain', () => {
    expect(maskEmail('mika47@burner.privaseer.co.uk')).toBe('mi***@burner.privaseer.co.uk');
  });

  it('keeps only one character of short local parts', () => {
    expect(maskEmail('ab@example.com')).toBe('a***@example.com');
    expect(maskEmail('a@example.com')).toBe('a***@example.com');
  });

  it('handles "Name <email>" senders without leaking the name', () => {
    expect(maskEmail('Jane Doe <jane.doe@example.com>')).toBe('ja***@example.com');
  });

  it('fully masks values that are not addresses', () => {
    expect(maskEmail('not-an-email')).toBe('***');
    expect(maskEmail('@example.com')).toBe('***');
  });

  it('returns an empty string for missing values', () => {
    expect(maskEmail('')).toBe('');
    expect(maskEmail(undefined)).toBe('');
    expect(maskEmail(null)).toBe('');
  });
});
