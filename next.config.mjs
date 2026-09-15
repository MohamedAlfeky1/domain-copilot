/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  env: {
    JWT_SECRET: process.env.JWT_SECRET || "domain-copilot-assessment-secure-jwt-key-32-chars",
  },
  experimental: {
    serverComponentsExternalPackages: ["@electric-sql/pglite", "pg"],
    cpus: 1,
    workerThreads: false,
  },
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }
    return config;
  },
};

export default nextConfig;
