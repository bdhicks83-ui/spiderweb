/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remotion's tooling can't be webpack-bundled — load from node_modules at runtime.
  serverExternalPackages: [
    "@remotion/bundler",
    "@remotion/renderer",
  ],
};

export default nextConfig;
