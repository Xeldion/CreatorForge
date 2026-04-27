/** @type {import("next").NextConfig} */
const nextConfig = {
  // Turbopack is stable in Next.js 14 for development
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "googleapis", "bullmq", "ioredis"],
  },

  // Image optimization — allow R2 and YouTube domains
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.r2.cloudflarestorage.com",
      },
      {
        protocol: "https",
        hostname: "cdn.creatorforge.com",
      },
      {
        protocol: "https",
        hostname: "i.ytimg.com",
      },
      {
        protocol: "https",
        hostname: "yt3.ggpht.com",
      },
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },

  // Redirects for clean URLs
  async redirects() {
    return [
      {
        source: "/app",
        destination: "/dashboard",
        permanent: true,
      },
    ];
  },
};

module.exports = nextConfig;
