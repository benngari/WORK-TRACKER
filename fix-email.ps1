# Fix: stop a missing RESEND_API_KEY from crashing the backend on startup.
# Run from your work-tracker project root:
#   powershell -ExecutionPolicy Bypass -File .\fix-email.ps1
$ErrorActionPreference = "Stop"

if (-not (Test-Path ./backend)) {
    Write-Host "ERROR: Run this from your work-tracker project root (the folder containing backend)." -ForegroundColor Red
    exit 1
}

$emailJs = @'
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
'@

$fullPath = Join-Path (Get-Location) "backend/utils/email.js"
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($fullPath, $emailJs, $utf8NoBom)
Write-Host "  wrote backend/utils/email.js" -ForegroundColor Green
Write-Host ""
Write-Host "Next: git add . ; git commit -m 'Make Resend client lazy'; git push" -ForegroundColor Yellow
