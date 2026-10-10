const { Resend } = require('resend');

let client = null;

// Created on first use rather than at startup, so a missing API key only
// affects password-reset emails instead of crashing the whole server.
function getClient() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY is not set');
  }
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
}

async function sendPasswordResetEmail(to, resetUrl) {
  const { error } = await getClient().emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
    to,
    subject: 'Reset your Work Tracker password',
    html: `
      <p>Someone requested a password reset for your Work Tracker account.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
  });
  // Resend reports API problems (bad key, unverified recipient) in the
  // response instead of throwing, so surface them to the caller's logs.
  if (error) throw new Error(error.message);
}

module.exports = { sendPasswordResetEmail };