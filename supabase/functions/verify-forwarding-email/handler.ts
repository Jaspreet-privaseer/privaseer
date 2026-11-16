import {
  confirmVerification,
  discardPendingCode,
  isForwardingVerified,
  startVerification,
} from "../shared/forwarding-verification.ts";
import { validateEmail, isBurnerDomainAddress } from "../shared/input-validation.ts";
import { maskEmail } from "../shared/log-redaction.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

export interface VerificationDeps {
  supabase: any;
  // Resolves to the installation id from the bearer token, or rejects with a Response
  authenticate: (req: Request) => Promise<{ installationId: string }>;
  sendCodeEmail: (to: string, code: string) => Promise<{ ok: boolean }>;
  now?: () => number;
}

function json(body: unknown, status: number, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...extra },
  });
}

export function buildCodeEmail(code: string): { subject: string; text: string; html: string } {
  const text =
    `Your Privaseer verification code is ${code}.\n\n` +
    "Enter it in the Privaseer extension to start forwarding burner emails to this address. " +
    "It expires in 15 minutes.\n\n" +
    "If you did not ask for this, you can ignore this email. Nothing will be forwarded here.";
  const html =
    `<p>Your Privaseer verification code is:</p>` +
    `<p style="font-size:28px;letter-spacing:4px;font-weight:bold">${code}</p>` +
    `<p>Enter it in the Privaseer extension to start forwarding burner emails to this address. It expires in 15 minutes.</p>` +
    `<p>If you did not ask for this, you can ignore this email. Nothing will be forwarded here.</p>`;
  return { subject: `${code} is your Privaseer verification code`, text, html };
}

export async function handleVerificationRequest(req: Request, deps: VerificationDeps): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  let installationId: string;
  try {
    ({ installationId } = await deps.authenticate(req));
  } catch (response) {
    if (response instanceof Response) {
      return response;
    }
    console.error("Authentication error:", response instanceof Error ? response.message : String(response));
    return json({ error: "Authentication failed" }, 401);
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Validation error", message: "Request body must be JSON" }, 400);
  }

  if (!body || typeof body !== "object" || (body.action !== "send" && body.action !== "confirm" && body.action !== "status")) {
    return json({ error: "Validation error", message: "action must be 'send', 'confirm' or 'status'" }, 400);
  }

  // Plain addresses only, so the key matches what generate-burner-email stores
  const emailCheck = validateEmail(body.realEmail);
  if (
    !emailCheck.valid ||
    typeof body.realEmail !== "string" ||
    emailCheck.sanitized !== body.realEmail.trim().toLowerCase()
  ) {
    return json({ error: "Validation error", message: "A valid email address is required" }, 400);
  }
  const email: string = emailCheck.sanitized;
  if (isBurnerDomainAddress(email)) {
    return json(
      { error: "Enter your own email address, not a Privaseer burner address.", message: "Burner addresses cannot be used as the forwarding email" },
      400,
    );
  }
  const now = deps.now ? deps.now() : Date.now();

  if (body.action === "status") {
    const state = await isForwardingVerified(deps.supabase, installationId, email);
    if (state === "error") {
      console.error("Verification status check failed");
      return json({ error: "Verification temporarily unavailable" }, 503, { "Retry-After": "30" });
    }
    return json({ success: true, verified: state === "verified" }, 200);
  }

  if (body.action === "send") {
    const started = await startVerification(deps.supabase, installationId, email, now);

    if (!started.ok) {
      if (started.reason === "error") {
        console.error("Verification start failed");
        return json({ error: "Verification temporarily unavailable" }, 503, { "Retry-After": "60" });
      }
      console.warn("Verification send refused:", started.reason, maskEmail(email));
      return json(
        { error: "Too many verification requests", reason: started.reason, retryAfterSeconds: started.retryAfterSeconds },
        429,
        { "Retry-After": String(started.retryAfterSeconds) }
      );
    }

    if (started.alreadyVerified) {
      return json({ success: true, alreadyVerified: true }, 200);
    }

    const sent = await deps.sendCodeEmail(email, started.code);
    if (!sent.ok) {
      // Free the cooldown so the user can try again straight away
      await discardPendingCode(deps.supabase, installationId, email);
      console.error("Verification email could not be sent:", maskEmail(email));
      return json({ error: "Could not send the verification email" }, 502);
    }

    return json({ success: true, alreadyVerified: false }, 200);
  }

  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!/^\d{6}$/.test(code)) {
    return json({ error: "Validation error", message: "code must be 6 digits" }, 400);
  }

  const result = await confirmVerification(deps.supabase, installationId, email, code, now);
  if (result.ok) {
    return json({ success: true, verified: true }, 200);
  }

  switch (result.reason) {
    case "error":
      console.error("Verification confirm failed");
      return json({ error: "Verification temporarily unavailable" }, 503, { "Retry-After": "30" });
    case "try_again":
      return json({ error: "Please try again", reason: result.reason }, 409);
    case "too_many_attempts":
      return json({ error: "Too many wrong codes. Request a new code.", reason: result.reason }, 429);
    case "invalid_code":
      return json(
        { error: "Code is wrong or has expired", reason: result.reason, attemptsRemaining: result.attemptsRemaining },
        400
      );
    default:
      // expired, no_pending
      return json({ error: "Code is wrong or has expired", reason: result.reason }, 400);
  }
}
