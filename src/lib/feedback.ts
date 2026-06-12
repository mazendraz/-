import { useEffect, useState } from "react";

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

export function getFeedbacks(): Feedback[] {
  return read().sort((a, b) => b.createdAt - a.createdAt);
}

export function getUnreadFeedbackCount(): number {
  return read().filter((f) => !f.read).length;
}

export function addFeedback(data: Omit<Feedback, "id" | "createdAt" | "read">): Feedback {
  const item: Feedback = { ...data, id: generateId(), createdAt: Date.now(), read: false };
  write([item, ...read()]);
  return item;
}

export function markFeedbackRead(id: string) {
  write(read().map((f) => (f.id === id ? { ...f, read: true } : f)));
}

export function deleteFeedback(id: string) {
  write(read().filter((f) => f.id !== id));
}

export function useFeedbacks(): Feedback[] {
  const [list, setList] = useState<Feedback[]>(getFeedbacks);
  useEffect(() => {
    const refresh = () => setList(getFeedbacks());
    window.addEventListener(EVENT, refresh);
    window.addEventListener("storage", refresh);
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
