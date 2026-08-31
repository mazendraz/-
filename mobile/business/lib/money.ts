/**
 * "12,000 ج" — whole Egyptian pounds, no piastres (matches api's own
 * convention — see ApiOffering's comment in packages/core/apiTypes.ts).
 * Same Intl.NumberFormat locale as mobile/client's lib/pricing.ts formatEgp,
 * kept as its own one-liner here rather than pulled in from that file: the
 * rest of pricing.ts is customer-facing offering-preview math this app has
 * no use for, and duplicating one formatter is cheaper than importing that
 * coupling.
 */
export function formatEgp(amount: number): string {
  return `${new Intl.NumberFormat("ar-EG-u-nu-latn", { maximumFractionDigits: 0 }).format(amount)} ج`;
}
