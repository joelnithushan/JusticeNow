/**
 * JusticeNow — Sri Lankan NIC + mobile-number validation.
 *
 * NIC formats:
 *   - OLD: 9 digits + a letter V or X (e.g. "751234567V"). 2-digit year → 19YY
 *          (old NICs were issued to people born up to the mid-2010s).
 *   - NEW: 12 digits (e.g. "197512345678"). 4-digit year.
 *
 * The 3-digit "day of year" field encodes BOTH gender and the birth date:
 *   - value > 500  → FEMALE (subtract 500 to get the real day of year)
 *   - value ≤ 500  → MALE
 * The NIC calendar always reserves a Feb-29 slot (day 60), so day 60 maps to
 * Feb 29 and is valid ONLY in a leap year — otherwise the NIC is rejected.
 */

function isLeapYear(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Decode + validate a Sri Lankan NIC.
 * @param {string} raw
 * @returns {{ valid: boolean, error?: string, gender?: 'male'|'female',
 *             dateOfBirth?: string, year?: number }}
 */
function decodeNic(raw) {
  const nic = String(raw || '')
    .trim()
    .toUpperCase();

  let year;
  let dayField;

  if (/^\d{9}[VX]$/.test(nic)) {
    year = 1900 + parseInt(nic.slice(0, 2), 10);
    dayField = parseInt(nic.slice(2, 5), 10);
  } else if (/^\d{12}$/.test(nic)) {
    year = parseInt(nic.slice(0, 4), 10);
    dayField = parseInt(nic.slice(4, 7), 10);
  } else {
    return { valid: false, error: 'format' };
  }

  let gender;
  let day;
  if (dayField > 500) {
    gender = 'female';
    day = dayField - 500;
  } else {
    gender = 'male';
    day = dayField;
  }

  // Day-of-year must be 1..366 (the +500 female offset is already removed).
  if (day < 1 || day > 366) {
    return { valid: false, error: 'day' };
  }

  const leap = isLeapYear(year);
  // Month lengths with February ALWAYS 29 (the NIC convention): day 60 = Feb 29.
  const months = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let remaining = day;
  let month = 0;
  while (remaining > months[month]) {
    remaining -= months[month];
    month += 1;
  }

  // Feb 29 (month index 1, day 29) only exists in a leap year.
  if (month === 1 && remaining === 29 && !leap) {
    return { valid: false, error: 'leap' };
  }

  const dateOfBirth = `${year}-${String(month + 1).padStart(2, '0')}-${String(remaining).padStart(2, '0')}`;
  return { valid: true, gender, dateOfBirth, year };
}

function isValidNic(raw) {
  return decodeNic(raw).valid;
}

/**
 * Validate a Sri Lankan mobile number. Accepts local (07XXXXXXXX) and
 * international (+947XXXXXXXX / 947XXXXXXXX) forms; second digit 0-8 (070–078).
 * Spaces and dashes are ignored.
 */
function isValidLkMobile(raw) {
  const digits = String(raw || '').replace(/[\s-]/g, '');
  return /^(?:\+94|0094|94|0)?7[0-8]\d{7}$/.test(digits);
}

module.exports = { decodeNic, isValidNic, isValidLkMobile, isLeapYear };
