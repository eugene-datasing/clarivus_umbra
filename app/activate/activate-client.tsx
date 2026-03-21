"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { EyeOff, KeyRound, CheckCircle2, AlertCircle, User } from "lucide-react";
import { redeemActivationCode } from "@/lib/actions/activation-actions";

/**
 * Format raw input into VEIL-XXXX-XXXX-XXXX pattern.
 * Strips non-alphanumeric chars (except the VEIL- prefix),
 * auto-inserts dashes at the right positions.
 */
function formatActivationCode(raw: string): string {
  // Strip everything except alphanumeric
  const stripped = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");

  // If starts with VEIL, skip those 4 chars from the grouping
  let prefix = "";
  let body = stripped;
  if (stripped.startsWith("VEIL")) {
    prefix = "VEIL";
    body = stripped.slice(4);
  }

  // Cap body at 12 chars (3 groups of 4) so excess input is rejected
  // rather than silently dropped
  body = body.slice(0, 12);

  // Group remaining chars into blocks of 4
  const groups: string[] = [];
  for (let i = 0; i < body.length; i += 4) {
    groups.push(body.slice(i, i + 4));
  }

  if (prefix) {
    return groups.length > 0 ? `${prefix}-${groups.join("-")}` : prefix;
  }
  return groups.join("-");
}

interface ActivateClientProps {
  userName: string;
}

export default function ActivateClient({ userName }: ActivateClientProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleCodeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatActivationCode(e.target.value);
    setCode(formatted);
    setError("");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await redeemActivationCode(code);

      if (result.success) {
        setSuccess(true);
        // Redirect to setup wizard after a brief success message
        setTimeout(() => {
          router.push("/setup");
          router.refresh();
        }, 2000);
      } else {
        setError(result.error || "Activation failed. Please try again.");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-surface-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-brand-primary flex items-center justify-center mx-auto mb-4">
            <EyeOff className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-heading font-bold text-txt-primary">Veil</h1>
          <p className="text-sm text-txt-secondary mt-1">
            AI-Powered Document Redaction Platform
          </p>
        </div>

        <div className="card">
          {success ? (
            <div className="text-center py-4" role="status" aria-live="polite">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-3" aria-hidden="true" />
              <h2 className="text-lg font-heading font-semibold text-txt-primary mb-2">
                Activated
              </h2>
              <p className="text-sm text-txt-secondary">
                Your Veil instance is now active. Redirecting to setup...
              </p>
            </div>
          ) : (
            <>
              {userName && (
                <div className="flex items-center gap-2 mb-4 p-2 bg-surface-raised rounded-card text-sm text-txt-secondary">
                  <User className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                  <span>Signed in as <strong className="text-txt-primary">{userName}</strong></span>
                </div>
              )}

              <div className="flex items-center gap-2 mb-4">
                <KeyRound className="w-5 h-5 text-brand-primary" />
                <h2 className="text-lg font-heading font-semibold text-txt-primary">
                  Activate Instance
                </h2>
              </div>

              <p className="text-sm text-txt-secondary mb-4">
                Enter the activation code provided by DataSing to unlock this Veil instance.
                You will be set up as the initial administrator.
              </p>

              {error && (
                <div
                  id="activation-error"
                  role="alert"
                  aria-live="assertive"
                  className="mb-4 p-3 bg-red-50 border border-red-200 rounded-card text-sm text-red-700 flex items-start gap-2"
                >
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden="true" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} aria-label="Activate instance">
                <div className="space-y-4">
                  <div>
                    <label htmlFor="activation-code" className="block text-sm font-medium text-txt-primary mb-1.5">
                      Activation Code
                    </label>
                    <input
                      id="activation-code"
                      type="text"
                      className="input-field font-mono text-center text-lg tracking-wider"
                      placeholder="VEIL-XXXX-XXXX-XXXX"
                      value={code}
                      onChange={handleCodeChange}
                      maxLength={19}
                      autoComplete="off"
                      autoFocus
                      required
                      aria-required="true"
                      aria-invalid={error ? "true" : undefined}
                      aria-describedby={error ? "activation-error" : "activation-hint"}
                    />
                  </div>
                  <button
                    type="submit"
                    className="btn-primary w-full flex items-center justify-center gap-2"
                    disabled={loading || code.length < 19}
                  >
                    {loading ? (
                      <span>Verifying...</span>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        Activate
                      </>
                    )}
                  </button>
                </div>
              </form>

              <p id="activation-hint" className="mt-4 pt-4 border-t border-border text-xs text-txt-secondary text-center">
                Contact your DataSing account manager if you don&apos;t have an activation code.
              </p>
            </>
          )}
        </div>

        <p className="text-center text-xs text-txt-secondary mt-6">
          Veil &mdash; DataSing / Clarivus AI
        </p>
      </div>
    </div>
  );
}
