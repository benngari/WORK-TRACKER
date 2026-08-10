/**
 * Parses a pasted M-PESA confirmation SMS and extracts structured fields.
 * Handles the common "Confirmed" receive-money format, e.g.:
 *
 *  "TENDE12ABC Confirmed. You have received Ksh3,000.00 from TENDE B2C
 *   0722123456 on 15/7/26 at 7:24 AM. New M-PESA balance is Ksh12,450.00."
 *
 * Real M-PESA messages vary in wording, so this is best-effort: it returns
 * whatever it can confidently find and flags what it couldn't, so the UI
 * can prompt for manual correction rather than silently guessing wrong.
 */

function parseMpesaMessage(rawMessage) {
  const message = (rawMessage || '').trim();
  const result = {
    transactionCode: null,
    amount: null,
    sender: null,
    transactionDate: null,
    mpesaBalance: null,
    originalMessage: message,
    parsedSuccessfully: false,
    warnings: [],
  };

  if (!message) {
    result.warnings.push('Empty message');
    return result;
  }

  // Transaction code: first token, usually 10 alphanumeric chars, e.g. "QAB1XYZ23"
  const codeMatch = message.match(/^([A-Z0-9]{6,12})\s/);
  if (codeMatch) {
    result.transactionCode = codeMatch[1];
  } else {
    result.warnings.push('Could not find transaction code');
  }

  // Amount: "received Ksh3,000.00" or "Ksh 3,000"
  const amountMatch = message.match(/received\s+Ksh?\.?\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (amountMatch) {
    result.amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  } else {
    result.warnings.push('Could not find amount received');
  }

  // Sender: "from TENDE B2C 0722123456" or "from JOHN DOE 254722123456"
  const senderMatch = message.match(/from\s+([A-Z0-9 .&'\-]+?)(?:\s+\d{9,12})?\s+on\s+\d/i);
  if (senderMatch) {
    result.sender = senderMatch[1].trim();
  } else {
    // fallback: everything between "from" and "on <date>"
    const fallback = message.match(/from\s+(.+?)\s+on\s+/i);
    if (fallback) {
      result.sender = fallback[1].trim();
    } else {
      result.warnings.push('Could not find sender');
    }
  }

  // Date + time: "on 15/7/26 at 7:24 AM"
  const dateMatch = message.match(
    /on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+at\s+(\d{1,2}:\d{2}\s?[AP]M)/i
  );
  if (dateMatch) {
    const [, datePart, timePart] = dateMatch;
    result.transactionDate = buildDate(datePart, timePart);
  } else {
    result.warnings.push('Could not find transaction date/time');
  }

  // Balance: "New M-PESA balance is Ksh12,450.00"
  const balanceMatch = message.match(/balance\s+is\s+Ksh?\.?\s?([\d,]+(?:\.\d{1,2})?)/i);
  if (balanceMatch) {
    result.mpesaBalance = parseFloat(balanceMatch[1].replace(/,/g, ''));
  }

  result.parsedSuccessfully = Boolean(
    result.transactionCode && result.amount && result.transactionDate
  );

  return result;
}

function buildDate(datePart, timePart) {
  try {
    const [d, m, y] = datePart.split('/').map((n) => parseInt(n, 10));
    const fullYear = y < 100 ? 2000 + y : y;

    const timeMatch = timePart.match(/(\d{1,2}):(\d{2})\s?([AP]M)/i);
    if (!timeMatch) return null;
    let [, hh, mm, ampm] = timeMatch;
    hh = parseInt(hh, 10);
    mm = parseInt(mm, 10);
    if (/PM/i.test(ampm) && hh !== 12) hh += 12;
    if (/AM/i.test(ampm) && hh === 12) hh = 0;

    return new Date(fullYear, m - 1, d, hh, mm);
  } catch {
    return null;
  }
}

module.exports = { parseMpesaMessage };
