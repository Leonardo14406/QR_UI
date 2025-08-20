/** @type {import('next').NextConfig} */
const nextConfig = {
  // Remove output: 'export' to enable server-side rendering for dynamic routes
  // output: 'export',
  eslint: {
    ignoreDuringBuilds: true,
  },
  images: { unoptimized: true },
  // Enable React strict mode
  reactStrictMode: true,
  // Configure page extensions (optional)
  pageExtensions: ['tsx', 'ts', 'jsx', 'js'],
};

module.exports = nextConfig;
