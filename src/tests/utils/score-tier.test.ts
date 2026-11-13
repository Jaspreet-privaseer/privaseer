import { describe, it, expect } from 'vitest';
import { getNextTier } from '../../utils/score-tier';

describe('getNextTier', () => {
  it('targets Fair at 514 with about 76% progress', () => {
    const t = getNextTier(514)!;
    expect(t.nextLabel).toBe('Fair');
    expect(t.pointsNeeded).toBe(36);
    expect(Math.round(t.progressPercent)).toBe(76);
  });

  it('starts a band at 0% and moves to the next label at the threshold', () => {
    expect(getNextTier(550)!.nextLabel).toBe('Good');
    expect(getNextTier(550)!.progressPercent).toBe(0);
    expect(getNextTier(650)!.nextLabel).toBe('Excellent');
  });

  it('works below the Poor threshold', () => {
    const t = getNextTier(300)!;
    expect(t.nextLabel).toBe('Poor');
    expect(t.progressPercent).toBe(0);
  });

  it('returns null at the top tier', () => {
    expect(getNextTier(750)).toBeNull();
    expect(getNextTier(850)).toBeNull();
  });
});
