import { isValidPhoneNumber } from "libphonenumber-js/min";

// Canonicalize an Egyptian mobile to its last 10 significant digits, so the
// local (01…), country-code (201…) and E.164 (+201…) forms all compare equal.
// Used to match a stored phone against one supplied for lookup/verification.
export function phoneTail(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}

// Full E.164 validity for any country — used on NEW submissions (the
// frontend's PhoneInput always normalizes to E.164 before sending). Lookup
// endpoints that only need a legacy secret to feed into phoneTail() above
// stay on a plain length check instead — see validation/leads.ts.
export function isValidE164Phone(phone: string): boolean {
  try {
    return isValidPhoneNumber(phone);
  } catch {
    return false;
  }
}
