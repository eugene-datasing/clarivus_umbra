import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  output: "standalone",
  // pdfjs-dist 5.x ships as pure ESM. Next.js 15's webpack dev pipeline
  // crashes client-side at module init with "TypeError: Object.defineProperty
  // called on non-object" when loading pdfjs-dist/build/pdf.mjs.
  // transpilePackages is the documented mitigation and is kept here to
  // signal intent for future bundler configuration, but on Next 15.5.13 +
  // pdfjs-dist 5.4.296 it was not sufficient on its own (tried aliasing
  // to legacy/build, esmExternals: "loose", extensionAlias tweaks — none
  // resolved the webpack init error). Turbopack handles the same module
  // graph cleanly; the `dev` npm script therefore runs `next dev --turbo`.
  // Production `next build` + `next start` still use webpack and need a
  // separate smoke-check before Slice D flips the default VIEWER_MODE.
  // See Slice A PR body for the full rationale.
  transpilePackages: ["pdfjs-dist"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Next.js dev server requires 'unsafe-eval' and 'unsafe-inline' for HMR
              process.env.NODE_ENV === "development"
                ? "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://unpkg.com"
                : "script-src 'self' 'unsafe-inline' https://unpkg.com",
              "worker-src 'self' blob:",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self' data:",
              "connect-src 'self' https://unpkg.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
        ],
      },
    ];
  },
};
export default nextConfig;
