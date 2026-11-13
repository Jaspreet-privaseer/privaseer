import { CREDIT_SCORE } from './constants';

export interface NextTier {
  nextThreshold: number;
  nextLabel: string;
  pointsNeeded: number;
  progressPercent: number;
}

// Tiers from lowest to highest. `floor` is where the current band starts.
const TIERS = [
  { threshold: CREDIT_SCORE.LABELS.POOR, label: 'Poor', floor: CREDIT_SCORE.MIN },
  { threshold: CREDIT_SCORE.LABELS.FAIR, label: 'Fair', floor: CREDIT_SCORE.LABELS.POOR },
  { threshold: CREDIT_SCORE.LABELS.GOOD, label: 'Good', floor: CREDIT_SCORE.LABELS.FAIR },
  { threshold: CREDIT_SCORE.LABELS.EXCELLENT, label: 'Excellent', floor: CREDIT_SCORE.LABELS.GOOD },
];

// Next tier above the score, and how far through the current band the score is.
export function getNextTier(score: number): NextTier | null {
  for (const tier of TIERS) {
    if (score < tier.threshold) {
      const span = tier.threshold - tier.floor;
      const raw = ((score - tier.floor) / span) * 100;
      return {
        nextThreshold: tier.threshold,
        nextLabel: tier.label,
        pointsNeeded: tier.threshold - score,
        progressPercent: Math.max(0, Math.min(100, raw)),
      };
    }
  }
  return null;
}
