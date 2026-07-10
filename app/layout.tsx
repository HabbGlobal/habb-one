import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import { NavigationProgress } from "@/components/layout/NavigationProgress";
import "./globals.css";

export const metadata: Metadata = {
  title: "HABB One",
  description:
    "HABB One — modular ERP for SME workshops: CRM, orders, quotes, invoices with QR-Bill, workshop planning, staff planning and time tracking.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const messages = await getMessages();
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen antialiased" suppressHydrationWarning>
        <NextIntlClientProvider locale="en" messages={messages}>
          <NavigationProgress />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
