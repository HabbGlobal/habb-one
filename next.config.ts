import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  allowedDevHosts: ["one.habbgate.com"],
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "connect.habbgate.com",
        ...(process.env.VERCEL_URL ? [process.env.VERCEL_URL] : []),
        ...(process.env.NEXTAUTH_URL ? [new URL(process.env.NEXTAUTH_URL).host] : []),
      ],
    },
  },
};

export default withNextIntl(nextConfig);
