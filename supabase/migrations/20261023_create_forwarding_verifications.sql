-- Migration: Forwarding email verification
-- Burner emails only forward to an address the installation has proven it can read.
-- One row per (installation, forwarding address), so verifying once covers every alias.

CREATE TABLE IF NOT EXISTS public.forwarding_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id uuid NOT NULL,
  email text NOT NULL,
  code_hash text,
  code_expires_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  send_count int NOT NULL DEFAULT 0,
  send_window_start timestamptz,
  last_sent_at timestamptz,
  verified_at timestamptz,
  verified_via text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forwarding_verifications_email_lower CHECK (email = lower(email)),
  CONSTRAINT forwarding_verifications_unique UNIQUE (installation_id, email)
);

-- Per-address send limits look at every installation that asked for the same address
CREATE INDEX IF NOT EXISTS idx_forwarding_verifications_email_sent
  ON public.forwarding_verifications (email, last_sent_at);

CREATE INDEX IF NOT EXISTS idx_forwarding_verifications_installation
  ON public.forwarding_verifications (installation_id);

-- Only Edge Functions (service_role) touch this table
ALTER TABLE public.forwarding_verifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forwarding_verifications FORCE ROW LEVEL SECURITY;

CREATE POLICY "no_public_access_by_design" ON public.forwarding_verifications
  FOR ALL TO authenticated, anon
  USING (false)
  WITH CHECK (false);

-- Existing aliases keep forwarding: every address already in use counts as verified
INSERT INTO public.forwarding_verifications (installation_id, email, verified_at, verified_via)
SELECT DISTINCT installation_id, lower(real_email), now(), 'backfill'
FROM public.burner_emails
WHERE real_email IS NOT NULL AND real_email <> ''
ON CONFLICT (installation_id, email) DO NOTHING;
