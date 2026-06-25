import { useEffect, useState } from "react";
import { HOME_REVIEWS } from "./data";
import { apiGet, apiPost, apiPut, apiPatch, apiDelete, isApiConfigured } from "./api";
import { getCurrentUser, isAuthenticated } from "./auth";

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
  // In API mode the backend is the source of truth — don't seed demo reviews;
  // hydration fills the cache. Demo mode seeds so the homepage is populated.
  if (isApiConfigured()) return [];
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(SEED));
  return SEED;
}

function write(list: SiteReview[]) {
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVENT));
}

// ── API sync ──────────────────────────────────────────────────────────────────
// Admins hydrate from /admin/site-reviews (all, for moderation); everyone else
// from /site-reviews (visible only). Mirrors the catalog/leads pattern.
function isAdminSession(): boolean {
  return isApiConfigured() && isAuthenticated() && getCurrentUser()?.role === "ADMIN";
}

export async function hydrateSiteReviewsFromApi(): Promise<void> {
  if (!isApiConfigured()) return;
  try {
    const reviews = await apiGet<SiteReview[]>(
      isAdminSession() ? "/admin/site-reviews" : "/site-reviews",
    );
    localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews));
    try {
      const s = await apiGet<{ enabled: boolean }>("/site-reviews/settings");
      localStorage.setItem(ENABLED_KEY, String(s.enabled));
    } catch {
      /* settings is best-effort; keep last known value */
    }
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch (err) {
    console.error("Site reviews hydration from API failed:", err);
  }
}

if (typeof window !== "undefined") void hydrateSiteReviewsFromApi();

export function areReviewsEnabled(): boolean {
  try { return localStorage.getItem(ENABLED_KEY) !== "false"; } catch { return true; }
}

export function setReviewsEnabled(v: boolean) {
  localStorage.setItem(ENABLED_KEY, String(v)); // optimistic
  window.dispatchEvent(new CustomEvent(EVENT));
  if (isAdminSession()) {
    void apiPut("/admin/site-reviews/settings", { enabled: v }).catch((err) => {
      console.error("Update reviews-enabled failed:", err);
      void hydrateSiteReviewsFromApi();
    });
  }
}

export function getSiteReviews(includeHidden = false): SiteReview[] {
  const all = read().sort((a, b) => b.createdAt - a.createdAt);
  return includeHidden ? all : all.filter((r) => r.visible);
}

export async function addSiteReview(
  data: Omit<SiteReview, "id" | "createdAt" | "visible">,
  honeypot = "",
): Promise<SiteReview> {
  // With the API configured the backend is authoritative — a failed submission
  // must surface (don't fake success). New reviews are held for moderation, so
  // they won't appear on the homepage until an admin approves them.
  if (isApiConfigured()) {
    const created = await apiPost<SiteReview>("/site-reviews", { ...data, website: honeypot });
    write([created, ...read()]);
    return created;
  }
  const review: SiteReview = { ...data, id: generateId(), createdAt: Date.now(), visible: false };
  write([review, ...read()]);
  return review;
}

export function setSiteReviewVisible(id: string, visible: boolean) {
  write(read().map((r) => (r.id === id ? { ...r, visible } : r))); // optimistic
  if (isAdminSession()) {
    apiPatch(`/admin/site-reviews/${id}`, { visible }).catch((err) => {
      console.error("Toggle review visibility failed:", err);
      void hydrateSiteReviewsFromApi();
    });
  }
}

export function deleteSiteReview(id: string) {
  write(read().filter((r) => r.id !== id)); // optimistic
  if (isAdminSession()) {
    apiDelete(`/admin/site-reviews/${id}`).catch((err) => {
      console.error("Delete review failed:", err);
      void hydrateSiteReviewsFromApi();
    });
  }
}

export function useSiteReviews(includeHidden = false): SiteReview[] {
  const [list, setList] = useState<SiteReview[]>(() => getSiteReviews(includeHidden));
  useEffect(() => {
    const refresh = () => setList(getSiteReviews(includeHidden));
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    void hydrateSiteReviewsFromApi(); // refresh on mount (picks up admin vs public)
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
