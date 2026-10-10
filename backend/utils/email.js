const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendPasswordResetEmail(to, resetUrl) {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    to,
    subject: 'Reset your Work Tracker password',
    html: `
      <p>Someone requested a password reset for your Work Tracker account.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
  });
}

module.exports = { sendPasswordResetEmail };