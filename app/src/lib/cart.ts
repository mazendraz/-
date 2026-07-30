// A request basket, scoped PER COMPANY.
//
// One basket per company, not one global one: a request goes to a single
// provider, so mixing companies would produce a basket that cannot be submitted.
// Keying the storage by slug also means browsing a second company never disturbs
// what you already picked at the first.
//
// Same shape as useSaved.ts: localStorage + a CustomEvent so every mounted view
// updates together.
import { useCallback, useEffect, useState } from "react";

const KEY_PREFIX = "al-assema-cart-";
const EVENT = "al-assema-cart-changed";

/** A chosen line. No prices — the server prices the request at submit time. */
export interface CartItem {
  offeringId: string;
  qty: number;
  tierId?: string | null;
}

function keyFor(companySlug: string): string {
  return `${KEY_PREFIX}${companySlug}`;
}

export function readCart(companySlug: string): CartItem[] {
  if (!companySlug) return [];
  try {
    const raw = localStorage.getItem(keyFor(companySlug));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    // Corrupt or unavailable storage (private mode) — an empty basket is the
    // safe reading; never let it break the page.
    return [];
  }
}

function write(companySlug: string, items: CartItem[]): void {
  try {
    if (items.length === 0) localStorage.removeItem(keyFor(companySlug));
    else localStorage.setItem(keyFor(companySlug), JSON.stringify(items));
  } catch { /* storage unavailable — the in-memory state still updates */ }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { companySlug } }));
}

export function addToCart(companySlug: string, item: CartItem): void {
  const items = readCart(companySlug);
  // Same offering + same tier is the same line — bump the quantity rather than
  // adding a duplicate row the customer then has to reconcile.
  const existing = items.findIndex(
    (i) => i.offeringId === item.offeringId && (i.tierId ?? null) === (item.tierId ?? null),
  );
  if (existing >= 0) {
    items[existing] = { ...items[existing], qty: items[existing].qty + item.qty };
  } else {
    items.push(item);
  }
  write(companySlug, items);
}

export function setQty(companySlug: string, offeringId: string, tierId: string | null, qty: number): void {
  const items = readCart(companySlug)
    .map((i) =>
      i.offeringId === offeringId && (i.tierId ?? null) === tierId
        ? { ...i, qty: Math.max(1, Math.trunc(qty) || 1) }
        : i,
    );
  write(companySlug, items);
}

export function removeFromCart(companySlug: string, offeringId: string, tierId: string | null = null): void {
  write(
    companySlug,
    readCart(companySlug).filter(
      (i) => !(i.offeringId === offeringId && (i.tierId ?? null) === tierId),
    ),
  );
}

/** Emptied after a successful submit — the basket has become a request. */
export function clearCart(companySlug: string): void {
  write(companySlug, []);
}

export function isInCart(companySlug: string, offeringId: string): boolean {
  return readCart(companySlug).some((i) => i.offeringId === offeringId);
}

/** Live basket for one company. */
export function useCart(companySlug: string): {
  items: CartItem[];
  count: number;
  refresh: () => void;
} {
  const [items, setItems] = useState<CartItem[]>(() => readCart(companySlug));

  const refresh = useCallback(() => setItems(readCart(companySlug)), [companySlug]);

  useEffect(() => {
    refresh();
    const onChange = (e: Event) => {
      // Ignore changes to another company's basket.
      const detail = (e as CustomEvent<{ companySlug?: string }>).detail;
      if (!detail?.companySlug || detail.companySlug === companySlug) refresh();
    };
    window.addEventListener(EVENT, onChange);
    // "storage" fires in OTHER tabs — keeps a second tab of the same profile
    // in step.
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, onChange);
      window.removeEventListener("storage", refresh);
    };
  }, [companySlug, refresh]);

  return { items, count: items.length, refresh };
}
