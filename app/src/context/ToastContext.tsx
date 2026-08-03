import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { useLocale } from "./LocaleContext";
import { t } from "../lib/i18n";
import Icon from "../components/Icon";

export type ToastVariant = "success" | "error";

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  action?: ToastAction;
  /** ms before auto-dismiss. Defaults to 5000 (7000 with an action — Undo needs
   * time to actually be clicked). Pass 0 to require manual dismissal. */
  duration?: number;
}

interface Toast extends ToastOptions {
  id: number;
  variant: ToastVariant;
}

interface ToastCtx {
  showToast: (opts: ToastOptions) => void;
}

const ToastContext = createContext<ToastCtx>({ showToast: () => {} });

/** One region for every success/error result in the app (CMP-12) — replaces
 * ~20 different inline "it worked" / "it failed" styles, most of which had no
 * guarantee of being anywhere near the viewport when they rendered. */
export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { locale } = useLocale();
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((list) => list.filter((item) => item.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const showToast = useCallback((opts: ToastOptions) => {
    const id = nextId++;
    const variant = opts.variant ?? "success";
    const duration = opts.duration ?? (opts.action ? 7000 : 5000);
    setToasts((list) => [...list, { ...opts, id, variant }]);
    if (duration > 0) {
      timers.current.set(id, setTimeout(() => dismiss(id), duration));
    }
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {/* Above BottomNav on mobile (which only exists on public pages, but the
          offset is harmless where it doesn't). Each toast carries its own
          role/aria-live — success and error are announced differently, so one
          shared wrapper isn't itself a single (wrong) live region. */}
      <div className="fixed inset-x-0 bottom-[calc(var(--bottom-nav-h)+1rem)] md:bottom-6 z-[200] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.variant === "error" ? "alert" : "status"}
            aria-live={toast.variant === "error" ? "assertive" : "polite"}
            className={`toast-enter pointer-events-auto flex items-center gap-3 w-full sm:w-auto sm:max-w-md rounded-2xl shadow-2xl px-4 py-3 text-label font-bold ${
              toast.variant === "error" ? "bg-error text-white" : "bg-on-surface text-surface"
            }`}
          >
            <Icon
              name={toast.variant === "error" ? "error" : "check_circle"}
              className="text-title flex-shrink-0"
              style={{ fontVariationSettings: "'FILL' 1" }}
            />
            <span className="flex-grow">{toast.message}</span>
            {toast.action && (
              <button
                onClick={() => { toast.action!.onClick(); dismiss(toast.id); }}
                className="flex-shrink-0 underline underline-offset-2 hover:no-underline"
              >
                {toast.action.label}
              </button>
            )}
            <button
              onClick={() => dismiss(toast.id)}
              aria-label={t(locale, "toast_dismiss")}
              className="flex-shrink-0 w-8 h-8 -m-1 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors"
            >
              <Icon name="close" className="text-label" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
