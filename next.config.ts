import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      allowedOrigins: [
        "localhost:3000",
        "localhost:4001",
        "one.habbgate.com",
        "connect.habbgate.com",
        ...(process.env.VERCEL_URL ? [process.env.VERCEL_URL] : []),
        ...(process.env.NEXTAUTH_URL ? [new URL(process.env.NEXTAUTH_URL).host] : []),
      ],
    },
  },
};

export default withNextIntl(nextConfig);
