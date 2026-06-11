/**
 * SMTP-Mailversand für HABB One — geht über Zoho SMTP via Nodemailer.
 *
 * Dev-Fallback: wenn `SMTP_HOST` fehlt ODER `MAIL_DEV_LOG_ONLY=true` ist,
 * loggen wir die Mail nach stdout statt zu versenden. Damit ist lokales
 * Testen ohne echten SMTP-Account trivial.
 *
 * Prod-Guard: in `NODE_ENV=production` ist `MAIL_DEV_LOG_ONLY=true`
 * verboten — der Wrapper wirft, damit ein Konfigurationsfehler nicht
 * versehentlich Kundenmails dunkelschaltet.
 *
 * One module-level transporter so wir nicht pro Request neu connecten.
 */

import nodemailer, { type Transporter, type TransportOptions } from "nodemailer";
import type SMTPTransport from "nodemailer/lib/smtp-transport";

const devLogOnly = process.env.MAIL_DEV_LOG_ONLY === "true";

function buildTransporter(): Transporter | null {
  const host = process.env.SMTP_HOST;
  const portRaw = process.env.SMTP_PORT;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !portRaw || !user || !pass) return null;

  const port = Number(portRaw);
  // Port 465 = implicit TLS; alles andere (587, 25) = STARTTLS.
  const secure = port === 465;

  const options: SMTPTransport.Options = {
    host,
    port,
    secure,
    auth: { user, pass },
  };
  // Nodemailer defaults: kein Pooling (=einmalige Connection pro send),
  // genau richtig für Vercel-Serverless wo Connection-Reuse über Calls
  // ohnehin nicht zuverlässig wäre.
  return nodemailer.createTransport(options as unknown as TransportOptions);
}

let transporter: Transporter | null = null;
function getTransporter(): Transporter | null {
  if (transporter) return transporter;
  transporter = buildTransporter();
  return transporter;
}

export interface SendMailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional Reply-To (z.B. die persönliche habb.ch-Adresse des Owners). */
  replyTo?: string;
  /** Logischer Tag — wird in den Mail-Headern als `X-HABB-Tag` mitgegeben. */
  tag?: string;
}

export interface SendMailResult {
  /** SMTP message-id, oder "dev-log" wenn nur geloggt. */
  id: string;
  /** True wenn echt an SMTP übergeben, false in dev-log-Mode. */
  delivered: boolean;
}

function assertNotProdDevLog(): void {
  if (process.env.NODE_ENV === "production" && devLogOnly) {
    throw new Error(
      "[mail] MAIL_DEV_LOG_ONLY must not be enabled in production. " +
        "Refusing to silently drop a customer mail.",
    );
  }
}

/** Default-Absender. `MAIL_FROM` setzen, sonst Fallback auf SMTP_USER. */
export function defaultFrom(): string {
  return (
    process.env.MAIL_FROM ??
    (process.env.SMTP_USER ? `HABB One <${process.env.SMTP_USER}>` : "noreply@localhost")
  );
}

export async function sendMail(input: SendMailInput): Promise<SendMailResult> {
  assertNotProdDevLog();

  const t = getTransporter();
  if (!t || devLogOnly) {
    // eslint-disable-next-line no-console
    console.log("[mail:dev-log]", {
      to: input.to,
      subject: input.subject,
      tag: input.tag,
      // Erste 200 Zeichen vom Plain-Text — OTPs in Tests einfach greifbar.
      preview: input.text.slice(0, 200),
    });
    return { id: "dev-log", delivered: false };
  }

  const info = await t.sendMail({
    from: defaultFrom(),
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    replyTo: input.replyTo,
    headers: input.tag ? { "X-HABB-Tag": input.tag } : undefined,
  });

  return { id: info.messageId, delivered: true };
}
