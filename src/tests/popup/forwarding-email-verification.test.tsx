import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ForwardingEmailVerification } from '../../popup/forwarding-email-verification';

describe('ForwardingEmailVerification', () => {
  const originalChrome = global.chrome;
  let sendMessage: ReturnType<typeof vi.fn>;
  let replies: Record<string, unknown>;

  beforeEach(() => {
    replies = {
      GET_FORWARDING_VERIFICATION_STATUS: { success: true, verified: false, hasEmail: true },
      SEND_FORWARDING_VERIFICATION: { success: true, alreadyVerified: false },
      CONFIRM_FORWARDING_VERIFICATION: { success: true },
    };
    sendMessage = vi.fn(async (message: { type: string }) => replies[message.type]);
    global.chrome = { runtime: { sendMessage } } as unknown as typeof chrome;
  });

  afterEach(() => {
    global.chrome = originalChrome;
  });

  it('renders nothing without a saved address and does not call the background', () => {
    const { container } = render(<ForwardingEmailVerification email={null} />);
    expect(container).toBeEmptyDOMElement();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it('shows a verified note when the server says the address is verified', async () => {
    replies.GET_FORWARDING_VERIFICATION_STATUS = { success: true, verified: true, hasEmail: true };
    render(<ForwardingEmailVerification email="user@example.com" />);

    expect(await screen.findByTestId('forwarding-verified')).toBeInTheDocument();
    expect(screen.queryByText('Send verification code')).not.toBeInTheDocument();
  });

  it('asks for confirmation when the address is not verified', async () => {
    render(<ForwardingEmailVerification email="user@example.com" />);

    expect(await screen.findByTestId('forwarding-unverified')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send verification code' })).toBeInTheDocument();
    // Nothing is emailed until the user asks
    expect(sendMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'SEND_FORWARDING_VERIFICATION' }));
  });

  it('still offers a code when the status cannot be checked', async () => {
    replies.GET_FORWARDING_VERIFICATION_STATUS = { success: false, error: 'offline' };
    render(<ForwardingEmailVerification email="user@example.com" />);

    expect(await screen.findByRole('button', { name: 'Send verification code' })).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('offline');
  });

  it('still offers a code when the background does not answer', async () => {
    sendMessage.mockResolvedValue(undefined);
    render(<ForwardingEmailVerification email="user@example.com" />);

    expect(await screen.findByRole('button', { name: 'Send verification code' })).toBeInTheDocument();
  });

  it('sends a code and then shows the code entry', async () => {
    const user = userEvent.setup();
    render(<ForwardingEmailVerification email="user@example.com" />);

    await user.click(await screen.findByRole('button', { name: 'Send verification code' }));

    expect(sendMessage).toHaveBeenCalledWith({ type: 'SEND_FORWARDING_VERIFICATION' });
    expect(await screen.findByLabelText('6-digit verification code')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Code sent');
    expect(screen.getByRole('button', { name: 'Send a new code' })).toBeInTheDocument();
  });

  it('switches to verified if the server says the address was already verified', async () => {
    replies.SEND_FORWARDING_VERIFICATION = { success: true, alreadyVerified: true };
    const user = userEvent.setup();
    render(<ForwardingEmailVerification email="user@example.com" />);

    await user.click(await screen.findByRole('button', { name: 'Send verification code' }));

    expect(await screen.findByTestId('forwarding-verified')).toBeInTheDocument();
  });

  it('shows the server message and wait time when sending is refused', async () => {
    replies.SEND_FORWARDING_VERIFICATION = {
      success: false,
      error: 'Too many verification requests',
      retryAfterSeconds: 45,
    };
    const user = userEvent.setup();
    render(<ForwardingEmailVerification email="user@example.com" />);

    await user.click(await screen.findByRole('button', { name: 'Send verification code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Too many verification requests Try again in about 45 seconds.');
    expect(screen.queryByLabelText('6-digit verification code')).not.toBeInTheDocument();
  });

  it('rounds long waits up to minutes', async () => {
    replies.SEND_FORWARDING_VERIFICATION = { success: false, error: 'Too many verification requests', retryAfterSeconds: 3600 };
    const user = userEvent.setup();
    render(<ForwardingEmailVerification email="user@example.com" />);

    await user.click(await screen.findByRole('button', { name: 'Send verification code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('about 60 minutes');
  });

  it('shows a generic message when sending throws', async () => {
    const user = userEvent.setup();
    render(<ForwardingEmailVerification email="user@example.com" />);
    const button = await screen.findByRole('button', { name: 'Send verification code' });
    sendMessage.mockRejectedValueOnce(new Error('port closed'));

    await user.click(button);

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not send the code. Please try again.');
  });

  it('only enables Confirm for a complete code and strips non-digits', async () => {
    const user = userEvent.setup();
    render(<ForwardingEmailVerification email="user@example.com" />);
    await user.click(await screen.findByRole('button', { name: 'Send verification code' }));

    const input = await screen.findByLabelText('6-digit verification code');
    const confirm = screen.getByRole('button', { name: 'Confirm code' });
    expect(confirm).toBeDisabled();

    await user.type(input, '12a34');
    expect(input).toHaveValue('1234');
    expect(confirm).toBeDisabled();

    await user.type(input, '56');
    expect(input).toHaveValue('123456');
    expect(confirm).toBeEnabled();
  });

  it('confirms the code and shows the verified state', async () => {
    const user = userEvent.setup();
    render(<ForwardingEmailVerification email="user@example.com" />);
    await user.click(await screen.findByRole('button', { name: 'Send verification code' }));
    await user.type(await screen.findByLabelText('6-digit verification code'), '042917');

    await user.click(screen.getByRole('button', { name: 'Confirm code' }));

    expect(sendMessage).toHaveBeenCalledWith({ type: 'CONFIRM_FORWARDING_VERIFICATION', data: { code: '042917' } });
    expect(await screen.findByTestId('forwarding-verified')).toBeInTheDocument();
  });

  it('keeps the entry open and shows the error for a wrong code', async () => {
    replies.CONFIRM_FORWARDING_VERIFICATION = { success: false, error: 'Code is wrong or has expired' };
    const user = userEvent.setup();
    render(<ForwardingEmailVerification email="user@example.com" />);
    await user.click(await screen.findByRole('button', { name: 'Send verification code' }));
    await user.type(await screen.findByLabelText('6-digit verification code'), '000000');

    await user.click(screen.getByRole('button', { name: 'Confirm code' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Code is wrong or has expired');
    expect(screen.getByLabelText('6-digit verification code')).toBeInTheDocument();
    expect(screen.queryByTestId('forwarding-verified')).not.toBeInTheDocument();
  });

  it('starts over when the saved address changes', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ForwardingEmailVerification email="user@example.com" />);
    await user.click(await screen.findByRole('button', { name: 'Send verification code' }));
    expect(await screen.findByLabelText('6-digit verification code')).toBeInTheDocument();

    replies.GET_FORWARDING_VERIFICATION_STATUS = { success: true, verified: false, hasEmail: true };
    rerender(<ForwardingEmailVerification email="other@example.com" />);

    await waitFor(() => expect(screen.queryByLabelText('6-digit verification code')).not.toBeInTheDocument());
    expect(await screen.findByRole('button', { name: 'Send verification code' })).toBeInTheDocument();
    const statusChecks = sendMessage.mock.calls.filter(
      ([message]) => message.type === 'GET_FORWARDING_VERIFICATION_STATUS'
    );
    expect(statusChecks).toHaveLength(2);
  });
});
