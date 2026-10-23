import { useEffect, useState } from 'react';
import { MailCheck, MailWarning } from 'lucide-react';
import { logger } from '../utils/logger';
import { toError } from '../utils/type-guards';

type Status = 'checking' | 'verified' | 'unverified' | 'unknown';

interface ForwardingEmailVerificationProps {
  // The saved forwarding address; nothing is shown until there is one
  email: string | null;
}

interface VerificationResponse {
  success?: boolean;
  verified?: boolean;
  alreadyVerified?: boolean;
  error?: string;
  retryAfterSeconds?: number;
}

function describeFailure(response: VerificationResponse | undefined, fallback: string): string {
  if (!response?.error) {
    return fallback;
  }
  if (typeof response.retryAfterSeconds === 'number') {
    const minutes = Math.ceil(response.retryAfterSeconds / 60);
    const wait = response.retryAfterSeconds < 60 ? `${response.retryAfterSeconds} seconds` : `${minutes} minutes`;
    return `${response.error} Try again in about ${wait}.`;
  }
  return response.error;
}

/**
 * Burner emails only forward to an address the user has confirmed with a code sent to that inbox.
 * The address itself always comes from Settings, this component only drives the confirmation.
 */
export function ForwardingEmailVerification({ email }: ForwardingEmailVerificationProps) {
  const [status, setStatus] = useState<Status>('checking');
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // A different address starts over: its code and status are unrelated to the previous one
  useEffect(() => {
    setCodeSent(false);
    setCode('');
    setMessage(null);
    setError(null);

    if (!email) {
      setStatus('unknown');
      return;
    }

    let cancelled = false;
    setStatus('checking');

    (async () => {
      try {
        const response: VerificationResponse | undefined = await chrome.runtime.sendMessage({
          type: 'GET_FORWARDING_VERIFICATION_STATUS',
        });
        if (cancelled) return;
        if (response?.success) {
          setStatus(response.verified ? 'verified' : 'unverified');
        } else {
          setStatus('unknown');
        }
      } catch (err) {
        if (cancelled) return;
        logger.error('ForwardingVerification', 'Failed to check verification status', toError(err));
        setStatus('unknown');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [email]);

  if (!email || status === 'unknown') {
    return null;
  }

  if (status === 'checking') {
    return null;
  }

  if (status === 'verified') {
    return (
      <p
        className="mb-3 flex items-center gap-1.5 text-xs text-green-700 dark:text-green-400"
        data-testid="forwarding-verified"
      >
        <MailCheck className="w-4 h-4" aria-hidden="true" />
        Verified. Burner emails will forward to this address.
      </p>
    );
  }

  const sendCode = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response: VerificationResponse | undefined = await chrome.runtime.sendMessage({
        type: 'SEND_FORWARDING_VERIFICATION',
      });

      if (response?.success && response.alreadyVerified) {
        setStatus('verified');
      } else if (response?.success) {
        setCodeSent(true);
        setCode('');
        setMessage('Code sent. Check your inbox (and spam folder). It expires in 15 minutes.');
      } else {
        setError(describeFailure(response, 'Could not send the code. Please try again.'));
      }
    } catch (err) {
      logger.error('ForwardingVerification', 'Failed to send verification code', toError(err));
      setError('Could not send the code. Please try again.');
    } finally {
      setIsBusy(false);
    }
  };

  const confirmCode = async () => {
    if (isBusy) return;
    setIsBusy(true);
    setError(null);
    setMessage(null);

    try {
      const response: VerificationResponse | undefined = await chrome.runtime.sendMessage({
        type: 'CONFIRM_FORWARDING_VERIFICATION',
        data: { code: code.trim() },
      });

      if (response?.success) {
        setStatus('verified');
      } else {
        setError(describeFailure(response, 'Could not confirm the code. Please try again.'));
      }
    } catch (err) {
      logger.error('ForwardingVerification', 'Failed to confirm verification code', toError(err));
      setError('Could not confirm the code. Please try again.');
    } finally {
      setIsBusy(false);
    }
  };

  const codeIsComplete = /^\d{6}$/.test(code.trim());

  return (
    <div
      className="mb-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg"
      data-testid="forwarding-unverified"
    >
      <div className="flex items-start gap-2">
        <MailWarning className="w-4 h-4 mt-0.5 text-amber-600 dark:text-amber-400 flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0 space-y-2">
          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
            Confirm this address to start forwarding
          </p>
          <p className="text-xs text-amber-800 dark:text-amber-300">
            We email a 6-digit code to this address. Burner emails can only be created once you enter it.
          </p>

          {codeSent && (
            <div className="space-y-2">
              <label htmlFor="forwarding-verification-code" className="sr-only">
                6-digit verification code
              </label>
              <input
                id="forwarding-verification-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="123456"
                disabled={isBusy}
                className="w-full px-3 py-2 text-sm font-mono tracking-widest border border-amber-300 dark:border-amber-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
              <button
                type="button"
                onClick={confirmCode}
                disabled={isBusy || !codeIsComplete}
                className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors"
              >
                {isBusy ? 'Checking...' : 'Confirm code'}
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={sendCode}
            disabled={isBusy}
            className={
              codeSent
                ? 'text-xs font-medium text-blue-700 dark:text-blue-300 hover:underline disabled:opacity-50'
                : 'w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg transition-colors'
            }
          >
            {codeSent ? 'Send a new code' : isBusy ? 'Sending...' : 'Send verification code'}
          </button>

          {message && (
            <p className="text-xs text-green-700 dark:text-green-400" role="status">
              {message}
            </p>
          )}
          {error && (
            <p className="text-xs text-red-600 dark:text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
