import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MetricsAggregationService } from '@/background/metrics-aggregation';
import { Storage } from '@/background/storage';
import type { DailyMetricsSnapshot } from '@/types';

vi.mock('@/background/storage');
vi.mock('@/utils/logger');

describe('MetricsAggregationService', () => {
  const createMockSnapshot = (overrides: Partial<DailyMetricsSnapshot> = {}): DailyMetricsSnapshot => ({
    date: '2025-01-01',
    privacyScore: 85,
    trackersBlocked: 50,
    trackersByCategory: {
      advertising: 30,
      analytics: 15,
      social: 5,
    },
    cleanSitesVisited: 10,
    nonCompliantSites: 2,
    complianceScores: [85, 90, 75],
    burnerEmailsGenerated: 3,
    burnerEmailsForwarded: 1,
    ...overrides,
  });

  // aggregateMetrics prepends a live "today" snapshot built from privacyScore.daily
  const mockStorage = (
    dailySnapshots: DailyMetricsSnapshot[],
    trackers: Record<string, unknown> = {},
    today: { score?: number; trackersBlocked?: number } = {},
  ) =>
    vi.spyOn(Storage, 'get').mockResolvedValue({
      dailySnapshots,
      trackers,
      privacyScore: {
        current: today.score ?? 100,
        daily: { trackersBlocked: today.trackersBlocked ?? 0, cleanSitesVisited: 0, nonCompliantSites: 0 },
      },
      complianceScores: [],
      burnerEmailStats: { generated: 0, forwarded: 0 },
    } as any);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('aggregateMetrics', () => {
    it('should aggregate weekly metrics correctly', async () => {
      const mockSnapshots = [
        createMockSnapshot({ date: '2025-01-07', trackersBlocked: 50 }),
        createMockSnapshot({ date: '2025-01-06', trackersBlocked: 40 }),
        createMockSnapshot({ date: '2025-01-05', trackersBlocked: 30 }),
      ];

      mockStorage(mockSnapshots, {
        'tracker1.com': { domain: 'tracker1.com', blockedCount: 100, category: 'advertising' },
        'tracker2.com': { domain: 'tracker2.com', blockedCount: 50, category: 'analytics' },
      }, { score: 85 });

      const result = await MetricsAggregationService.aggregateMetrics('week');

      expect(result.period).toBe('week');
      expect(result.totalTrackersBlocked).toBe(120);
      expect(result.averagePrivacyScore).toBe(85);
      expect(result.cleanSitesVisited).toBe(30);
      expect(result.nonCompliantSites).toBe(6);
    });

    it('should aggregate monthly metrics correctly', async () => {
      const mockSnapshots = Array.from({ length: 35 }, (_, i) =>
        createMockSnapshot({
          date: `2025-01-${String(i + 1).padStart(2, '0')}`,
          trackersBlocked: 10,
        })
      );

      mockStorage(mockSnapshots, {}, { trackersBlocked: 10 });

      const result = await MetricsAggregationService.aggregateMetrics('month');

      expect(result.period).toBe('month');
      expect(result.totalTrackersBlocked).toBe(300);
    });

    it('should handle empty snapshots gracefully', async () => {
      mockStorage([]);

      const result = await MetricsAggregationService.aggregateMetrics('week');

      expect(result.totalTrackersBlocked).toBe(0);
      expect(result.averagePrivacyScore).toBe(100);
      expect(result.trackersByCategory).toEqual({});
    });

    it('should calculate average privacy score correctly', async () => {
      const mockSnapshots = [
        createMockSnapshot({ privacyScore: 100 }),
        createMockSnapshot({ privacyScore: 80 }),
        createMockSnapshot({ privacyScore: 90 }),
      ];

      mockStorage(mockSnapshots, {}, { score: 90 });

      const result = await MetricsAggregationService.aggregateMetrics('week');

      expect(result.averagePrivacyScore).toBe(90);
    });

    it('should calculate average compliance score correctly', async () => {
      const mockSnapshots = [
        createMockSnapshot({ complianceScores: [100, 90] }),
        createMockSnapshot({ complianceScores: [80, 70] }),
      ];

      mockStorage(mockSnapshots);

      const result = await MetricsAggregationService.aggregateMetrics('week');

      expect(result.averageComplianceScore).toBe(85);
    });

    it('should aggregate trackers by category from all-time tracker totals', async () => {
      mockStorage([createMockSnapshot()], {
        'ads1.com': { domain: 'ads1.com', blockedCount: 10, category: 'advertising' },
        'ads2.com': { domain: 'ads2.com', blockedCount: 15, category: 'advertising' },
        'stats.com': { domain: 'stats.com', blockedCount: 5, category: 'analytics' },
        'social.com': { domain: 'social.com', blockedCount: 3, category: 'social' },
      });

      const result = await MetricsAggregationService.aggregateMetrics('week');

      expect(result.trackersByCategory).toEqual({
        advertising: 25,
        analytics: 5,
        social: 3,
      });
    });

    it('should calculate top blocked domains correctly', async () => {
      mockStorage([createMockSnapshot()], {
        'tracker1.com': { domain: 'tracker1.com', blockedCount: 100, category: 'advertising' },
        'tracker2.com': { domain: 'tracker2.com', blockedCount: 50, category: 'analytics' },
        'tracker3.com': { domain: 'tracker3.com', blockedCount: 75, category: 'social' },
      });

      const result = await MetricsAggregationService.aggregateMetrics('week');

      expect(result.topBlockedDomains).toHaveLength(3);
      expect(result.topBlockedDomains[0]).toEqual({ domain: 'tracker1.com', count: 100 });
      expect(result.topBlockedDomains[1]).toEqual({ domain: 'tracker3.com', count: 75 });
      expect(result.topBlockedDomains[2]).toEqual({ domain: 'tracker2.com', count: 50 });
    });

    it('should aggregate burner email stats correctly', async () => {
      const mockSnapshots = [
        createMockSnapshot({ burnerEmailsGenerated: 5, burnerEmailsForwarded: 2 }),
        createMockSnapshot({ burnerEmailsGenerated: 3, burnerEmailsForwarded: 1 }),
      ];

      mockStorage(mockSnapshots);

      const result = await MetricsAggregationService.aggregateMetrics('week');

      expect(result.burnerEmailsGenerated).toBe(8);
      expect(result.burnerEmailsForwarded).toBe(3);
    });
  });

  describe('getPrivacyScoreTrend', () => {
    it('should return privacy score trend', async () => {
      const mockSnapshots = [
        createMockSnapshot({ date: '2025-01-03', privacyScore: 90 }),
        createMockSnapshot({ date: '2025-01-02', privacyScore: 85 }),
        createMockSnapshot({ date: '2025-01-01', privacyScore: 80 }),
      ];

      vi.spyOn(Storage, 'getDailySnapshots').mockResolvedValue(mockSnapshots);

      const result = await MetricsAggregationService.getPrivacyScoreTrend(3);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ date: '2025-01-03', score: 90 });
      expect(result[1]).toEqual({ date: '2025-01-02', score: 85 });
      expect(result[2]).toEqual({ date: '2025-01-01', score: 80 });
    });

    it('should handle empty snapshots', async () => {
      vi.spyOn(Storage, 'getDailySnapshots').mockResolvedValue([]);

      const result = await MetricsAggregationService.getPrivacyScoreTrend();

      expect(result).toEqual([]);
    });
  });

  describe('getComplianceScoreDistribution', () => {
    it('should categorize compliance scores correctly', async () => {
      const mockSnapshots = [
        createMockSnapshot({ complianceScores: [95, 85, 65, 40] }),
        createMockSnapshot({ complianceScores: [100, 75, 55, 30] }),
      ];

      vi.spyOn(Storage, 'get').mockResolvedValue({
        dailySnapshots: mockSnapshots,
      } as any);

      const result = await MetricsAggregationService.getComplianceScoreDistribution();

      expect(result.excellent).toBe(2);
      expect(result.good).toBe(2);
      expect(result.fair).toBe(2);
      expect(result.poor).toBe(2);
    });

    it('should handle empty scores', async () => {
      vi.spyOn(Storage, 'get').mockResolvedValue({
        dailySnapshots: [],
      } as any);

      const result = await MetricsAggregationService.getComplianceScoreDistribution();

      expect(result).toEqual({
        excellent: 0,
        good: 0,
        fair: 0,
        poor: 0,
      });
    });
  });

  describe('getTrackerCategoryBreakdown', () => {
    it('should calculate category breakdown with percentages', async () => {
      vi.spyOn(Storage, 'get').mockResolvedValue({
        trackers: {
          'ad1.com': { domain: 'ad1.com', blockedCount: 50, category: 'advertising' },
          'ad2.com': { domain: 'ad2.com', blockedCount: 30, category: 'advertising' },
          'analytics.com': { domain: 'analytics.com', blockedCount: 20, category: 'analytics' },
        },
      } as any);

      const result = await MetricsAggregationService.getTrackerCategoryBreakdown();

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ category: 'advertising', count: 80, percentage: 80 });
      expect(result[1]).toEqual({ category: 'analytics', count: 20, percentage: 20 });
    });

    it('should handle empty trackers', async () => {
      vi.spyOn(Storage, 'get').mockResolvedValue({
        trackers: {},
      } as any);

      const result = await MetricsAggregationService.getTrackerCategoryBreakdown();

      expect(result).toEqual([]);
    });
  });
});
