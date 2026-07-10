/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
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
};

module.exports = nextConfig;
