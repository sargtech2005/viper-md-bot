/**
 * VIPER BOT MD — Mailer
 *
 * Configure via env vars:
 *   SMTP_HOST      e.g. smtp.gmail.com
 *   SMTP_PORT      defaults to 465
 *   SMTP_SECURE    'true' for SSL (port 465), 'false' for STARTTLS (port 587)
 *   SMTP_USER      your SMTP username / email
 *   SMTP_PASS      your SMTP password or app-password
 *   SMTP_FROM      "VIPER MD Bot <no-reply@yourdomain.com>"
 *   APP_URL        https://your-render-domain.onrender.com
 *
 * If SMTP_HOST is not set, the verification link is logged to console
 * and the caller should auto-verify the user so the platform stays usable.
 */

const nodemailer = require('nodemailer');

const SMTP_CONFIGURED = !!process.env.SMTP_HOST;

let transporter = null;

if (SMTP_CONFIGURED) {
  transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '465'),
    secure: process.env.SMTP_SECURE !== 'false', // default true (SSL)
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

/**
 * Send a verification email.
 * Returns { sent: true } if email was dispatched.
 * Returns { sent: false, reason: 'no_smtp' } if SMTP is not configured
 * (caller should auto-verify the user in this case).
 */
async function sendVerificationEmail(toEmail, username, token) {
  const appUrl  = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
  const link    = `${appUrl}/api/auth/verify-email?token=${token}`;
  const from    = process.env.SMTP_FROM || `"VIPER MD Bot" <no-reply@viperbot.app>`;

  if (!SMTP_CONFIGURED) {
    console.warn(`[Mailer] ⚠️  SMTP not configured. Verification link for ${toEmail}:`);
    console.warn(`[Mailer]    ${link}`);
    return { sent: false, reason: 'no_smtp' };
  }

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"/></head>
<body style="font-family:sans-serif;background:#f8fafc;margin:0;padding:2rem">
  <div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:2rem">
    <div style="font-size:1.2rem;font-weight:800;color:#0f172a;margin-bottom:.25rem">VIPER MD Bot</div>
    <div style="color:#64748b;font-size:.875rem;margin-bottom:1.5rem">Verify your email address</div>
    <p style="color:#0f172a;margin-bottom:1.25rem">Hi <strong>${username}</strong>,</p>
    <p style="color:#0f172a;margin-bottom:1.5rem">
      Thanks for signing up! Click the button below to verify your email address.
      This link expires in <strong>24 hours</strong>.
    </p>
    <a href="${link}" style="display:inline-block;padding:.75rem 1.5rem;background:#16a34a;color:#fff;font-weight:700;border-radius:8px;text-decoration:none">
      Verify Email Address
    </a>
    <p style="color:#94a3b8;font-size:.75rem;margin-top:1.5rem">
      If you didn't create this account you can ignore this email.<br/>
      Or paste this link: ${link}
    </p>
  </div>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from,
      to:      toEmail,
      subject: 'Verify your VIPER MD Bot email',
      html,
    });
    console.log(`[Mailer] ✅ Verification email sent to ${toEmail}`);
    return { sent: true };
  } catch (err) {
    console.error(`[Mailer] ❌ Failed to send to ${toEmail}:`, err.message);
    throw err;
  }
}

module.exports = { sendVerificationEmail, SMTP_CONFIGURED };
