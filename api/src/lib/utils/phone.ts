// Canonicalize an Egyptian mobile to its last 10 significant digits, so the
// local (01…), country-code (201…) and E.164 (+201…) forms all compare equal.
// Used to match a stored phone against one supplied for lookup/verification.
export function phoneTail(phone: string): string {
  return phone.replace(/\D/g, "").slice(-10);
}
