import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getMessages, getLocale } from "next-intl/server";
import "./globals.css";

export const metadata: Metadata = {
  title: "HABB One",
  description:
    "HABB One — modulares ERP für KMU-Werkstätten: CRM, Aufträge, Offerten, Rechnungen mit Schweizer QR-Bill, Werkstatt-Plan, Personal-Plan und Zeiterfassung.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html lang={locale} suppressHydrationWarning>
      <body className="min-h-screen antialiased">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
