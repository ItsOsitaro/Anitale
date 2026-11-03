// Outgoing email (SMTP). Works with any provider: set SMTP_HOST, SMTP_PORT,
// SMTP_USER, SMTP_PASS and SMTP_FROM in server/.env. Without SMTP_HOST the mail
// is printed to the server log instead (handy for local development).
import nodemailer from 'nodemailer';

export const mailConfigured = () => Boolean(process.env.SMTP_HOST);

// Links inside emails must never be built from the request's Host header
// (host-header injection), so they come from configuration only.
export const siteUrl = () => String(process.env.SITE_URL || `http://127.0.0.1:${process.env.PORT || 3000}`).trim().replace(/\/+$/, '');

let transporter = null;
const getTransporter = () => {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === '1' : port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }
  return transporter;
};

export const sendMail = async ({ to, subject, text, html }) => {
  if (!mailConfigured()) {
    console.log(`[mail:not-sent] SMTP_HOST is not set. To: ${to}\nSubject: ${subject}\n${text}\n`);
    return { sent: false };
  }
  await getTransporter().sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html,
  });
  return { sent: true };
};

const esc = (value) => String(value).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

const shell = (faTitle, faBody, faButton, enTitle, enBody, enButton, link) => `<!doctype html>
<html lang="fa" dir="rtl"><body style="margin:0;background:#f6f3f5;font-family:Tahoma,Arial,sans-serif;color:#2a2230">
<div style="max-width:520px;margin:0 auto;padding:28px 18px">
  <div style="background:#fff;border-radius:18px;padding:28px 24px;border:1px solid #eadfe5">
    <h1 style="margin:0 0 10px;font-size:20px">${esc(faTitle)}</h1>
    <p style="line-height:1.9;margin:0 0 18px">${esc(faBody)}</p>
    <p style="margin:0 0 22px"><a href="${esc(link)}" style="display:inline-block;background:#d1375c;color:#fff;text-decoration:none;padding:12px 22px;border-radius:12px;font-weight:bold">${esc(faButton)}</a></p>
    <hr style="border:none;border-top:1px solid #eadfe5;margin:18px 0">
    <div dir="ltr" style="text-align:left;color:#5b5163;font-size:14px;line-height:1.7">
      <strong>${esc(enTitle)}</strong><br>${esc(enBody)}<br><a href="${esc(link)}" style="color:#d1375c">${esc(enButton)}</a>
    </div>
    <p dir="ltr" style="text-align:left;color:#8a8092;font-size:12px;word-break:break-all;margin:14px 0 0">${esc(link)}</p>
  </div>
</div></body></html>`;

export const verifyEmailMail = ({ username, link }) => ({
  subject: 'تأیید ایمیل · Verify your email — انی‌تیل Anitale',
  text: `سلام ${username}،\nبرای تأیید ایمیلت این لینک را باز کن:\n${link}\n\nاگر این حساب را تو نساخته‌ای، این پیام را نادیده بگیر. لینک تا ۲۴ ساعت معتبر است.\n\n---\nHi ${username},\nOpen this link to verify your email:\n${link}\n\nIf you did not create this account, ignore this message. The link is valid for 24 hours.\n`,
  html: shell('تأیید ایمیل', `سلام ${username}، برای تأیید ایمیل حسابت روی دکمه بزن. لینک تا ۲۴ ساعت معتبر است.`, 'تأیید ایمیل', 'Verify your email', `Hi ${username}, confirm this address for your Anitale account. The link is valid for 24 hours.`, 'Verify email', link),
});

export const resetPasswordMail = ({ username, link }) => ({
  subject: 'بازیابی رمز · Reset your password — انی‌تیل Anitale',
  text: `سلام ${username}،\nبرای ساختن رمز تازه این لینک را باز کن:\n${link}\n\nاگر تو درخواست نکرده‌ای، این پیام را نادیده بگیر؛ رمزت عوض نمی‌شود. لینک تا یک ساعت معتبر است و فقط یک‌بار کار می‌کند.\n\n---\nHi ${username},\nOpen this link to choose a new password:\n${link}\n\nIf you did not ask for this, ignore the message; your password stays the same. The link works once and expires in one hour.\n`,
  html: shell('بازیابی رمز', `سلام ${username}، برای ساختن رمز تازه روی دکمه بزن. اگر تو درخواست نکرده‌ای، این پیام را نادیده بگیر. لینک یک ساعت معتبر است و فقط یک‌بار کار می‌کند.`, 'ساخت رمز جدید', 'Reset your password', `Hi ${username}, choose a new password with the button below. If you did not ask for this, ignore the message. The link works once and expires in one hour.`, 'Choose a new password', link),
});
