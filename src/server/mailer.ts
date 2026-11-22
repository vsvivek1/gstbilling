import "server-only";
import nodemailer, { type Transporter } from "nodemailer";

export type MailMessage = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Extra headers, e.g. List-Unsubscribe. */
  headers?: Record<string, string>;
};
export type MailResult = { provider: "smtp" | "resend" | "log"; ok: boolean; error?: string };

/**
 * Which mail service sends:
 * - "smtp": SMTP_USER + SMTP_PASS set (Nodemailer; Gmail by default, e.g. a Gmail app password)
 * - "resend": RESEND_API_KEY + EMAIL_FROM set
 * - "log": nothing set, messages are only written to the server log
 */
export function mailProvider(): MailResult["provider"] {
  if (process.env.SMTP_USER && process.env.SMTP_PASS) return "smtp";
  if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) return "resend";
  return "log";
}

let transporter: Transporter | null = null;

function smtp(): Transporter {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      pool: true,
      maxConnections: 2,
    });
  }
  return transporter;
}

/** Sender shown to buyers: EMAIL_FROM, else "Calecute Technologies <SMTP_USER>". */
function smtpFrom(): string {
  return process.env.EMAIL_FROM || `Calecute Technologies <${process.env.SMTP_USER}>`;
}

/**
 * Send one email. Without a mail service configured, the message is only
 * written to the server log, so billing can be tried before email is set up.
 */
export async function sendMail(msg: MailMessage): Promise<MailResult> {
  const provider = mailProvider();
  if (provider === "log") {
    console.info(`[mail:log] to=${msg.to} subject=${JSON.stringify(msg.subject)}`);
    return { provider, ok: true };
  }
  if (provider === "smtp") {
    try {
      await smtp().sendMail({ from: smtpFrom(), to: msg.to, subject: msg.subject, text: msg.text, html: msg.html, headers: msg.headers });
      return { provider, ok: true };
    } catch (err) {
      return { provider, ok: false, error: (err instanceof Error ? err.message : String(err)).slice(0, 300) };
    }
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM,
        to: [msg.to],
        subject: msg.subject,
        text: msg.text,
        html: msg.html,
        ...(msg.headers ? { headers: msg.headers } : {}),
      }),
    });
    if (res.ok) return { provider: "resend", ok: true };
    return { provider: "resend", ok: false, error: `${res.status} ${(await res.text()).slice(0, 300)}` };
  } catch (err) {
    return { provider: "resend", ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
