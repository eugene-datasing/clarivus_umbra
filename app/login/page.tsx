"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Shield, LogIn } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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

  return (
    <div className="min-h-screen bg-surface-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-full bg-brand-primary flex items-center justify-center mx-auto mb-4">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-heading font-bold text-txt-primary">Veil</h1>
          <p className="text-sm text-txt-secondary mt-1">
            AI-Powered Document Redaction Platform
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card">
          <h2 className="text-lg font-heading font-semibold text-txt-primary mb-4">
            Sign In
          </h2>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-card text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-txt-primary mb-1.5">
                Email
              </label>
              <input
                type="email"
                className="input-field"
                placeholder="you@npdc.govt.nz"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-txt-primary mb-1.5">
                Password
              </label>
              <input
                type="password"
                className="input-field"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
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

          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-txt-secondary text-center mb-2">Demo accounts:</p>
            <div className="space-y-1 text-xs text-txt-secondary">
              <p><span className="font-mono">k.williams@npdc.govt.nz</span> (Reviewer)</p>
              <p><span className="font-mono">a.richardson@npdc.govt.nz</span> (Senior Reviewer)</p>
              <p><span className="font-mono">admin@npdc.govt.nz</span> (Admin)</p>
              <p className="text-txt-secondary/60">Password for all: <span className="font-mono">demo123</span></p>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
