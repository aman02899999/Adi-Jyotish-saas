"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Zap } from "lucide-react";

type Health =
  | { status: "unconfigured"; model: string }
  | { status: "ok"; model: string; latencyMs: number; usageToday: number; dailyLimit: number }
  | { status: "error"; model: string; httpStatus: number | null; detail: string };

/**
 * Turns "the key is set" into "the key works". The banner beside this only reads the environment
 * variable, which cannot tell a working key from a revoked, mistyped, referrer-restricted or
 * out-of-quota one — and all of those fail identically for members, as a reading that never
 * finishes. One button, one real call, the actual answer.
 */
export function AdminGeminiHealth() {
  const [checking, setChecking] = useState(false);
  const [health, setHealth] = useState<Health | null>(null);
  const [failure, setFailure] = useState("");

  async function runCheck() {
    setChecking(true);
    setFailure("");
    setHealth(null);
    try {
      const response = await fetch("/api/admin/gemini-health", { method: "POST" });
      const body = await response.json();
      if (!response.ok) setFailure(body.error ?? "The check could not be run.");
      else setHealth(body as Health);
    } catch {
      setFailure("The check could not reach the server.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="gemini-health">
      <div className="gemini-health-row">
        <div>
          <strong>Live reading connection</strong>
          <small>Sends one real request to Gemini and reports what came back — the only way to confirm the key itself is valid, not merely present.</small>
        </div>
        <button type="button" className="button button--small" onClick={runCheck} disabled={checking}>
          {checking ? <Loader2 size={15} className="gemini-health-spin" /> : <Zap size={15} />}
          {checking ? "Testing…" : "Test connection"}
        </button>
      </div>

      {failure && <p className="gemini-health-result is-bad" role="status"><AlertTriangle size={15} /> {failure}</p>}

      {health?.status === "ok" && (
        <p className="gemini-health-result is-good" role="status">
          <CheckCircle2 size={15} />
          <span>
            <strong>Working.</strong> {health.model} replied in {health.latencyMs} ms.
            {" "}Today&rsquo;s usage: {health.usageToday} of {health.dailyLimit} calls.
          </span>
        </p>
      )}

      {health?.status === "unconfigured" && (
        <p className="gemini-health-result is-bad" role="status">
          <AlertTriangle size={15} />
          <span><strong>No key.</strong> GEMINI_API_KEY is not set on this deployment. Note that adding it in your hosting provider only takes effect on the <em>next</em> deployment — an existing one keeps the environment it was built with.</span>
        </p>
      )}

      {health?.status === "error" && (
        <p className="gemini-health-result is-bad" role="status">
          <AlertTriangle size={15} />
          <span>
            <strong>Not working{health.httpStatus ? ` (HTTP ${health.httpStatus})` : ""}.</strong>{" "}
            {health.httpStatus === 400 && "Gemini rejected the request — usually an invalid or malformed API key. "}
            {health.httpStatus === 403 && "Gemini refused the key — it may be revoked, restricted to particular referrers or IPs, or the Generative Language API may not be enabled on that Google Cloud project. "}
            {health.httpStatus === 404 && `The model ${health.model} is not available to this key. `}
            {health.httpStatus === 429 && "The key is valid but out of quota for now. "}
            <span className="gemini-health-detail">{health.detail}</span>
          </span>
        </p>
      )}
    </div>
  );
}
