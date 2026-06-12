import { useEffect, useState } from "react";
import { HOME_REVIEWS } from "./data";

export type SiteReview = {
  id: string;
  name: string;
  district: string;
  rating: number;
  text: string;
  createdAt: number;
  visible: boolean;
};

const REVIEWS_KEY = "al-assema-site-reviews";
const ENABLED_KEY = "al-assema-reviews-enabled";
const EVENT = "al-assema-site-reviews-changed";

function generateId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
}

const SEED: SiteReview[] = HOME_REVIEWS.map((r, i) => ({
  id: `seed-${i}`,
  name: r.author,
  district: r.district,
  rating: r.rating,
  text: r.text,
  createdAt: Date.now() - (i + 1) * 86400000 * 30,
  visible: true,
}));

function read(): SiteReview[] {
  try {
    const raw = localStorage.getItem(REVIEWS_KEY);
    if (raw) return JSON.parse(raw) as SiteReview[];
  } catch {}
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(SEED));
  return SEED;
}

function write(list: SiteReview[]) {
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function areReviewsEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) !== "false"; } catch { return true; }
}

export function setReviewsEnabled(v: boolean) {
  localStorage.setItem(ENABLED_KEY, String(v));
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getSiteReviews(includeHidden = false): SiteReview[] {
  const all = read().sort((a, b) => b.createdAt - a.createdAt);
  return includeHidden ? all : all.filter((r) => r.visible);
}

export function addSiteReview(data: Omit<SiteReview, "id" | "createdAt" | "visible">): SiteReview {
  // Default to hidden: customer-submitted reviews are held for admin approval
  // before they appear on the homepage (anti-spam / moderation). The admin
  // Reviews tab reads with includeHidden and can toggle visibility.
  const review: SiteReview = { ...data, id: generateId(), createdAt: Date.now(), visible: false };
  write([review, ...read()]);
  return review;
}

export function setSiteReviewVisible(id: string, visible: boolean) {
  write(read().map((r) => (r.id === id ? { ...r, visible } : r)));
}

export function deleteSiteReview(id: string) {
  write(read().filter((r) => r.id !== id));
}

export function useSiteReviews(includeHidden = false): SiteReview[] {
  const [list, setList] = useState<SiteReview[]>(() => getSiteReviews(includeHidden));
  useEffect(() => {
    const refresh = () => setList(getSiteReviews(includeHidden));
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [includeHidden]);
  return list;
}

export function useReviewsEnabled(): boolean {
  const [enabled, setEnabled] = useState(areReviewsEnabled);
  useEffect(() => {
    const refresh = () => setEnabled(areReviewsEnabled());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return enabled;
}
