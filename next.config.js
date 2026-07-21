/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    // The rewrites() proxy below defaults to a 10MB request body ceiling
    // (silently truncates anything larger -- confirmed empirically: a real
    // audio upload past 10MB got cut off mid-multipart-body, which Flask then
    // rejected as a malformed request). auto-edit-backend's own ceiling is
    // MAX_CONTENT_LENGTH = 4GB (web/app.py, sized for phone-shot video) --
    // match it here so the proxy is never the tighter constraint.
    proxyClientMaxBodySize: "4gb",
  },
  // @remotion/renderer dynamically requires platform-specific compositor
  // binaries at runtime; webpack can't statically resolve those, so this
  // package must run un-bundled via native require() in the Node runtime.
  serverExternalPackages: [
    "@remotion/renderer",
    "@remotion/bundler",
    "@remotion/tailwind-v4",
    "@tailwindcss/oxide",
    "lightningcss",
  ],
  // Proxies the browser's same-origin /api/auto-edit/* calls to the separate
  // Flask backend (auto-edit-backend/, a different process/port -- its heavy
  // Python ML deps (WhisperX, DeepFilterNet, PANNs, Silero VAD) can't run in
  // Node). Deliberately NOT calling Flask directly from the browser with CORS:
  // auto-edit-backend's LAN access (phone on the same Wi-Fi uploading footage,
  // see auto-edit-backend/README.md) means the browser's origin host varies
  // (localhost vs a LAN IP) -- a hardcoded/env-baked absolute URL would break
  // on whichever host it wasn't built for. Routing through this server-side
  // rewrite keeps every browser call relative and same-origin regardless of
  // how the Next.js page itself was reached, and it also means middleware.ts's
  // SITE_PASSWORD gate (whose matcher already covers /api/auto-edit/*) applies
  // to the Flask endpoints too, instead of them sitting on an ungated port.
  async rewrites() {
    const backend = process.env.AUTO_EDIT_BACKEND_URL ?? "http://localhost:5050";
    return [
      {
        source: "/api/auto-edit/:path*",
        destination: `${backend}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
