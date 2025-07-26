import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "ik.imagekit.io",
        port: "",
      },
      {
        protocol: "https",
        hostname: "campuscredentials.com",
        port: "",
      },
    ],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  webpack: (config: any, { isServer }: { isServer: boolean }) => {
    if (isServer) {
      // Fix for OpenTelemetry modules in server-side rendering
      config.externals = config.externals || [];
      config.externals.push({
        '@opentelemetry/api': 'commonjs @opentelemetry/api',
        '@opentelemetry/resources': 'commonjs @opentelemetry/resources',
        '@opentelemetry/semantic-conventions': 'commonjs @opentelemetry/semantic-conventions',
        '@opentelemetry/instrumentation': 'commonjs @opentelemetry/instrumentation',
      });
    }

    // Handle client-side module resolution
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
    };

    return config;
  },
  serverExternalPackages: [
    '@opentelemetry/api',
    '@opentelemetry/resources',
    '@opentelemetry/semantic-conventions',
    '@opentelemetry/instrumentation',
  ],
};

export default nextConfig;
