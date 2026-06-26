import { useEffect, useState } from "react";
import { apiGet, apiPost, apiPatch, apiDelete, isApiConfigured } from "./api";
import { getCurrentUser, isAuthenticated } from "./auth";

export type FeedbackType = "problem" | "suggestion" | "inquiry";

export type Feedback = {
  id: string;
  type: FeedbackType;
  name: string;
  phone: string;
  companySlug?: string;
  companyName?: string;
  message: string;
  createdAt: number;
  read: boolean;
};

// API contract shape (mirrors api/src/lib/apiTypes.ts → ApiFeedback).
type ApiFeedback = {
  id: string;
  companySlug: string;
  companyName: string;
  type: FeedbackType;
  name: string | null;
  phone: string | null;
  message: string;
  isRead: boolean;
  createdAt: number; // epoch ms
};

function fromApi(f: ApiFeedback): Feedback {
  return {
    id: f.id,
    type: f.type,
    name: f.name ?? "",
    phone: f.phone ?? "",
    companySlug: f.companySlug,
    companyName: f.companyName,
    message: f.message,
    createdAt: f.createdAt,
    read: f.isRead,
  };
}

export const FEEDBACK_TYPE_LABELS: Record<FeedbackType, string> = {
  problem: "Problem Report",
  suggestion: "Suggestion",
  inquiry: "General Inquiry",
};

export const FEEDBACK_TYPE_ICONS: Record<FeedbackType, string> = {
  problem: "report_problem",
  suggestion: "lightbulb",
  inquiry: "help",
};

export const FEEDBACK_TYPE_COLORS: Record<FeedbackType, string> = {
  problem: "bg-red-50 text-red-700",
  suggestion: "bg-yellow-50 text-yellow-700",
  inquiry: "bg-blue-50 text-blue-700",
};

const KEY = "al-assema-feedback";
const EVENT = "al-assema-feedback-changed";

function generateId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
}

function read(): Feedback[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Feedback[]) : [];
  } catch { return []; }
}

function write(list: Feedback[]) {
  localStorage.setItem(KEY, JSON.stringify(list));
  window.dispatchEvent(new CustomEvent(EVENT));
}

// ── API sync ──────────────────────────────────────────────────────────────────
// Feedback is admin-only to read (no public listing), so hydration only runs in
// an admin session. Mirrors the site-reviews pattern.
function isAdminSession(): boolean {
  return isApiConfigured() && isAuthenticated() && getCurrentUser()?.role === "ADMIN";
}

export async function hydrateFeedbackFromApi(): Promise<void> {
  if (!isAdminSession()) return;
  try {
    const rows = await apiGet<ApiFeedback[]>("/admin/feedback");
    localStorage.setItem(KEY, JSON.stringify(rows.map(fromApi)));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch (err) {
    console.error("Feedback hydration from API failed:", err);
  }
}

export function getFeedbacks(): Feedback[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function getUnreadFeedbackCount(): number {
  return read().filter((f) => !f.read).length;
}

export async function addFeedback(
  data: Omit<Feedback, "id" | "createdAt" | "read">,
  honeypot = "",
): Promise<Feedback> {
  // With the API configured the backend is authoritative — a failed submission
  // must surface (don't fake success).
  if (isApiConfigured()) {
    const created = await apiPost<ApiFeedback>("/feedback", {
      companySlug: data.companySlug,
      type: data.type,
      name: data.name || undefined,
      phone: data.phone || undefined,
      message: data.message,
      hp_field: honeypot, // honeypot — empty for real users
    });
    const item = fromApi(created);
    // Surface immediately to an admin viewing the dashboard in the same session.
    if (isAdminSession()) write([item, ...read()]);
    return item;
  }
  const item: Feedback = { ...data, id: generateId(), createdAt: Date.now(), read: false };
  write([item, ...read()]);
  return item;
}

export function markFeedbackRead(id: string) {
  write(read().map((f) => (f.id === id ? { ...f, read: true } : f))); // optimistic
  if (isAdminSession()) {
    apiPatch(`/admin/feedback/${id}`, { isRead: true }).catch((err) => {
      console.error("Mark feedback read failed:", err);
      void hydrateFeedbackFromApi();
    });
  }
}

export function deleteFeedback(id: string) {
  write(read().filter((f) => f.id !== id)); // optimistic
  if (isAdminSession()) {
    apiDelete(`/admin/feedback/${id}`).catch((err) => {
      console.error("Delete feedback failed:", err);
      void hydrateFeedbackFromApi();
    });
  }
}

export function useFeedbacks(): Feedback[] {
  const [list, setList] = useState<Feedback[]>(getFeedbacks);
  useEffect(() => {
    const refresh = () => setList(getFeedbacks());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    void hydrateFeedbackFromApi(); // refresh on mount (admin only)
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return list;
}

export function useUnreadFeedbackCount(): number {
  const [count, setCount] = useState(getUnreadFeedbackCount);
  useEffect(() => {
    const refresh = () => setCount(getUnreadFeedbackCount());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);
  return count;
}
