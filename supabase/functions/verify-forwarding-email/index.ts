// @ts-nocheck - Deno Edge Function with npm: specifiers resolved at runtime
// supabase:verify_jwt=false
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import * as jose from "npm:jose@5";
import { buildCodeEmail, handleVerificationRequest } from "./handler.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const jwtPublicKeyJwkEnv = Deno.env.get("JWT_PUBLIC_KEY");
const jwtIssuer = Deno.env.get("JWT_ISSUER") ?? "privaseer-burner-auth";
const emailApiKey = Deno.env.get("EMAIL_API_KEY");

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null;

let cachedPublicVerificationKey: jose.KeyLike | null = null;

async function getPublicVerificationKey(): Promise<jose.KeyLike> {
  if (cachedPublicVerificationKey) return cachedPublicVerificationKey;
  if (!jwtPublicKeyJwkEnv) {
    throw new Error("JWT public key not configured");
  }
  cachedPublicVerificationKey = await jose.importJWK(JSON.parse(jwtPublicKeyJwkEnv), "ES256");
  return cachedPublicVerificationKey;
}

function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
  });
}

async function authenticate(req: Request): Promise<{ installationId: string }> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return Promise.reject(unauthorized("Missing authorization"));
  }

  try {
    const { payload } = await jose.jwtVerify(authHeader.slice(7), await getPublicVerificationKey(), {
      algorithms: ["ES256"],
      issuer: jwtIssuer,
    });
    if (!payload.sub) {
      throw new Error("Token missing subject");
    }
    return { installationId: payload.sub as string };
  } catch (error) {
    console.error("JWT verification failed", error instanceof Error ? error.message : String(error));
    return Promise.reject(unauthorized("Invalid authorization token"));
  }
}

async function sendCodeEmail(to: string, code: string): Promise<{ ok: boolean }> {
  const { subject, text, html } = buildCodeEmail(code);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${emailApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: "Privaseer <verify@burner.privaseer.co.uk>",
        to,
        subject,
        text,
        html,
      }),
    });
    if (!response.ok) {
      console.error("Resend rejected verification email, status:", response.status);
    }
    return { ok: response.ok };
  } catch (error) {
    console.error("Verification email request failed:", error instanceof Error ? error.message : String(error));
    return { ok: false };
  }
}

Deno.serve((req: Request) => {
  if (req.method !== "OPTIONS" && (!supabase || !emailApiKey || !jwtPublicKeyJwkEnv)) {
    console.error("verify-forwarding-email is not fully configured");
    return new Response(JSON.stringify({ error: "Email verification not configured" }), {
      status: 500,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  }
  return handleVerificationRequest(req, { supabase, authenticate, sendCodeEmail });
});
