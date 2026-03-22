"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { EyeOff, LogIn } from "lucide-react";

interface LoginClientProps {
  ssoEnabled?: boolean;
}

export default function LoginClient({ ssoEnabled = false }: LoginClientProps) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password.");
      } else {
        router.push("/");
        router.refresh();
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleMicrosoftSignIn() {
    setSsoLoading(true);
    // Redirect-based flow — the page will navigate away to Microsoft login
    signIn("microsoft-entra-id", { callbackUrl: "/" });
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

        <form onSubmit={handleSubmit} className="card" aria-label="Sign in">
          <h2 className="text-lg font-heading font-semibold text-txt-primary mb-4">
            Sign In
          </h2>

          {error && (
            <div
              id="login-error"
              role="alert"
              aria-live="polite"
              className="mb-4 p-3 bg-red-50 border border-red-200 rounded-card text-sm text-red-700"
            >
              {error}
            </div>
          )}

          {/* ---- Azure AD / Microsoft SSO ---- */}
          {ssoEnabled ? (
            <>
              <button
                type="button"
                onClick={handleMicrosoftSignIn}
                disabled={ssoLoading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-border rounded-card text-sm font-medium text-txt-primary bg-white hover:bg-gray-50 transition-colors disabled:opacity-60"
              >
                {ssoLoading ? (
                  <span>Redirecting...</span>
                ) : (
                  <>
                    {/* Microsoft logo SVG */}
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="16"
                      height="16"
                      viewBox="0 0 21 21"
                      aria-hidden="true"
                    >
                      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                    </svg>
                    Sign in with Microsoft
                  </>
                )}
              </button>

              <p className="mt-4 text-xs text-txt-secondary text-center">
                Sign in with your organisation&apos;s Azure AD credentials.
              </p>
            </>
          ) : (
            /* Credentials form — only shown when SSO is not configured (local dev) */
            <>
              <div className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-sm font-medium text-txt-primary mb-1.5">
                    Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    className="input-field"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    aria-required="true"
                    aria-invalid={error ? "true" : undefined}
                    aria-describedby={error ? "login-error" : undefined}
                    autoComplete="email"
                  />
                </div>
                <div>
                  <label htmlFor="login-password" className="block text-sm font-medium text-txt-primary mb-1.5">
                    Password
                  </label>
                  <input
                    id="login-password"
                    type="password"
                    className="input-field"
                    placeholder="Enter password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    aria-required="true"
                    aria-invalid={error ? "true" : undefined}
                    aria-describedby={error ? "login-error" : undefined}
                    autoComplete="current-password"
                  />
                </div>
                <button
                  type="submit"
                  className="btn-primary w-full flex items-center justify-center gap-2"
                  disabled={loading}
                >
                  {loading ? (
                    <span>Signing in...</span>
                  ) : (
                    <>
                      <LogIn className="w-4 h-4" />
                      Sign In
                    </>
                  )}
                </button>
              </div>
            </>
          )}
        </form>

        <div className="mt-6 flex justify-center">
          <Image
            src="/images/Datasing_Logo-01.svg"
            alt="DataSing"
            width={120}
            height={32}
            priority
          />
        </div>
      </div>
    </div>
  );
}
