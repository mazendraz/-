// Simplified port of app/src/context/ToastContext.tsx — no locale system here
// (the Business Control Center is English-only, matching the mockups), so
// this drops LocaleContext/i18n but keeps the same shape/behavior so
// hooks/useMutation.ts (also ported) works unmodified.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export type ToastVariant = "success" | "error";

export interface ToastOptions {
  message: string;
  variant?: ToastVariant;
  /** ms before auto-dismiss. Defaults to 5000. Pass 0 to require manual dismissal. */
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

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
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

  const showToast = useCallback(
    (opts: ToastOptions) => {
      const id = nextId++;
      const variant = opts.variant ?? "success";
      const duration = opts.duration ?? 5000;
      setToasts((list) => [...list, { ...opts, id, variant }]);
      if (duration > 0) {
        timers.current.set(id, setTimeout(() => dismiss(id), duration));
      }
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div className="fixed inset-x-0 bottom-6 z-[200] flex flex-col items-center gap-2 px-4 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            role={toast.variant === "error" ? "alert" : "status"}
            aria-live={toast.variant === "error" ? "assertive" : "polite"}
            className={`pointer-events-auto flex items-center gap-3 w-full sm:w-auto sm:max-w-md rounded-lg shadow-lift px-4 py-3 font-body-sm text-body-sm ${
              toast.variant === "error" ? "bg-error text-on-error" : "bg-inverse-surface text-inverse-on-surface"
            }`}
          >
            <span className="material-symbols-outlined flex-shrink-0" style={{ fontVariationSettings: "'FILL' 1" }}>
              {toast.variant === "error" ? "error" : "check_circle"}
            </span>
            <span className="flex-grow">{toast.message}</span>
            <button
              onClick={() => dismiss(toast.id)}
              aria-label="Dismiss"
              className="flex-shrink-0 w-7 h-7 -m-1 flex items-center justify-center rounded-full hover:bg-white/15 transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
