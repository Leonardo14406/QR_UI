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
  webpack: (config, { isServer }) => {
    // Avoid bundling optional Node deps from ws in the client build
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.fallback = {
        ...(config.resolve.fallback || {}),
        ws: false,
        bufferutil: false,
        'utf-8-validate': false,
      };
      // Force engine.io-client to use browser websocket transport
      config.resolve.alias = {
        ...(config.resolve.alias || {}),
        'engine.io-client/build/esm/transports/websocket.node.js': 'engine.io-client/build/esm/transports/websocket.js',
        'engine.io-client/build/esm-debug/transports/websocket.node.js': 'engine.io-client/build/esm-debug/transports/websocket.js',
        ws: false,
      };
    }
    return config;
  },
};

module.exports = nextConfig;
