/**
 * @file src/tests/background/service-worker-packed-environment.test.ts
 *
 * Test Type: Integration (regression)
 * Contexts Tested: Service worker startup inside a PACKED (Chrome Web Store) extension
 * Chrome APIs Mocked: chrome.runtime, chrome.tabs, chrome.storage, chrome.declarativeNetRequest, chrome.webRequest
 * Prerequisites: None
 *
 * Regression coverage for a production outage: `chrome.declarativeNetRequest.onRuleMatchedDebug`
 * is only exposed to UNPACKED (developer-mode) extensions. It was previously dereferenced at
 * module scope, so in a Web Store build the service worker threw
 * `TypeError: Cannot read properties of undefined (reading 'addListener')` while evaluating.
 * That aborted startup before `initializeExtension()` ran, so `chrome.runtime.onMessage` was
 * never registered — the popup's GET_STATE never resolved and it span forever, and the
 * post-install onboarding tab never opened.
 *
 * Every other service-worker suite mocks `onRuleMatchedDebug` as present, which is precisely
 * why this shipped undetected. These tests deliberately omit it.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

type WebRequestErrorListener = (details: { url: string; tabId: number; error: string }) => void;

const webRequestErrorListeners = vi.hoisted(() => [] as WebRequestErrorListener[]);

const storageMock = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue({
    settings: { burnerEmailEnabled: false, telemetryEnabled: false, theme: 'system' },
    alerts: [],
    onboarding: { hasCompletedOnboarding: true },
  }),
  getFresh: vi.fn().mockResolvedValue({
    settings: { burnerEmailEnabled: false, telemetryEnabled: false, theme: 'system' },
    alerts: [],
  }),
  getBurnerEmailEnabled: vi.fn().mockResolvedValue(false),
  getTelemetryEnabled: vi.fn().mockResolvedValue(false),
  getRealEmail: vi.fn().mockResolvedValue(null),
  addAlert: vi.fn().mockResolvedValue(undefined),
  ensureSaved: vi.fn().mockResolvedValue(undefined),
  getOnboardingState: vi.fn().mockResolvedValue({ hasCompletedOnboarding: false, currentStep: 0 }),
}));

const messageBusMock = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  on: vi.fn(),
  broadcast: vi.fn(),
  send: vi.fn().mockResolvedValue({ success: true }),
}));

const firewallEngineMock = vi.hoisted(() => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  setConsentRejectionProvider: vi.fn(),
  toggleProtection: vi.fn().mockResolvedValue(true),
  getTrackerInfo: vi.fn().mockReturnValue({}),
  updateCurrentTabBadge: vi.fn().mockResolvedValue(undefined),
  checkPageForTrackers: vi.fn().mockResolvedValue(undefined),
  clearTabTimer: vi.fn(),
  handleBlockedRequest: vi.fn().mockResolvedValue(undefined),
  cleanup: vi.fn(),
}));

vi.mock('@/utils/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

vi.mock('@/background/storage', () => ({ Storage: storageMock }));
vi.mock('@/utils/message-bus', () => ({ messageBus: messageBusMock }));
vi.mock('@/background/firewall-engine', () => ({ FirewallEngine: firewallEngineMock }));

vi.mock('@/background/privacy-score', () => ({
  PrivacyScoreManager: {
    initialize: vi.fn().mockResolvedValue(undefined),
    getCurrentCreditScore: vi.fn().mockResolvedValue(700),
  },
}));

vi.mock('@/background/burner-email-service', () => ({
  burnerEmailService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    getEmails: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/background/feedback-telemetry-service', () => ({
  feedbackTelemetryService: {
    initialize: vi.fn().mockResolvedValue(undefined),
    trackEvent: vi.fn().mockResolvedValue(undefined),
    getInstallationId: vi.fn().mockResolvedValue('install-123'),
  },
}));

vi.mock('@/utils/tab-manager', () => ({
  tabManager: {
    initialize: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn(),
    resetBlockCount: vi.fn(),
  },
}));

vi.mock('@/background/event-emitter', () => ({
  backgroundEvents: { emit: vi.fn(), on: vi.fn() },
}));

vi.mock('@/background/tracker-detector', () => ({
  TrackerDetector: { initialize: vi.fn(), setConsentRejectionProvider: vi.fn() },
}));

vi.mock('@/utils/allowlist-manager', () => ({
  AllowlistManager: {
    isAllowlisted: vi.fn().mockResolvedValue(false),
    getEntries: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('@/background/false-positive-service', () => ({
  FalsePositiveService: { reportFalsePositive: vi.fn().mockResolvedValue({ success: true }) },
}));

/**
 * Mirrors a packed/Web Store extension: `declarativeNetRequest` exists (the ruleset still
 * works) but `onRuleMatchedDebug` is absent, exactly as Chrome exposes it outside dev mode.
 */
const createPackedChromeMock = () =>
  ({
    runtime: {
      sendMessage: vi.fn(),
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
      onSuspend: { addListener: vi.fn() },
      onMessage: { addListener: vi.fn() },
      getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
      lastError: undefined,
      id: 'test-extension-id',
    },
    action: {
      setBadgeBackgroundColor: vi.fn().mockResolvedValue(undefined),
      onClicked: { addListener: vi.fn() },
    },
    tabs: {
      query: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn(),
      create: vi.fn(),
      get: vi.fn().mockResolvedValue({ url: 'https://example.com' }),
      onUpdated: { addListener: vi.fn() },
      onActivated: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    },
    storage: {
      onChanged: { addListener: vi.fn() },
      local: { get: vi.fn().mockResolvedValue({}), set: vi.fn().mockResolvedValue(undefined) },
    },
    // Present, but WITHOUT onRuleMatchedDebug — the packed-extension shape.
    declarativeNetRequest: {
      updateEnabledRulesets: vi.fn().mockResolvedValue(undefined),
    },
    webRequest: {
      onBeforeRequest: { addListener: vi.fn() },
      onErrorOccurred: {
        addListener: vi.fn((listener: WebRequestErrorListener) => {
          webRequestErrorListeners.push(listener);
        }),
      },
    },
  }) as unknown as typeof chrome;

describe('Service worker startup in a packed (Web Store) extension', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    webRequestErrorListeners.length = 0;

    (globalThis as { chrome?: typeof chrome }).chrome = createPackedChromeMock();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ categories: {}, highRisk: [] }),
      text: vi.fn().mockResolvedValue('ok'),
    }) as unknown as typeof fetch;
  });

  it('evaluates without throwing when onRuleMatchedDebug is unavailable', async () => {
    await expect(import('@/background/service-worker')).resolves.toBeDefined();
  });

  it('still completes startup so the popup can be served (registers message handlers)', async () => {
    await import('@/background/service-worker');
    await vi.waitFor(() => {
      expect(messageBusMock.initialize).toHaveBeenCalled();
    });

    // The GET_STATE handler backs the popup's initial render. If startup aborts,
    // the popup hangs on its loading spinner forever.
    expect(messageBusMock.on).toHaveBeenCalledWith('GET_STATE', expect.any(Function));
  });

  it('registers the onInstalled listener that opens onboarding', async () => {
    await import('@/background/service-worker');
    expect(chrome.runtime.onInstalled.addListener).toHaveBeenCalled();
  });

  it('counts blocked requests via the webRequest fallback', async () => {
    await import('@/background/service-worker');

    expect(webRequestErrorListeners).toHaveLength(1);

    webRequestErrorListeners[0]?.({
      url: 'https://tracker.example/pixel.gif',
      tabId: 7,
      error: 'net::ERR_BLOCKED_BY_CLIENT',
    });

    expect(firewallEngineMock.handleBlockedRequest).toHaveBeenCalledWith(
      'https://tracker.example/pixel.gif',
      7
    );
  });

  it('ignores webRequest failures that are not extension blocks', async () => {
    await import('@/background/service-worker');

    webRequestErrorListeners[0]?.({
      url: 'https://example.com/offline.js',
      tabId: 7,
      error: 'net::ERR_INTERNET_DISCONNECTED',
    });

    expect(firewallEngineMock.handleBlockedRequest).not.toHaveBeenCalled();
  });
});
