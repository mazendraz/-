import type { ReactNode } from "react";
import { useVisualViewport } from "../hooks/useVisualViewport";

interface Props {
  header: ReactNode;
  children: ReactNode;
  /** Breakpoint at which the desktop two-column layout takes over and this
   *  takeover should disappear — must match the caller's own in-flow desktop
   *  pane (`lg:block` for admin, `md:block` for provider). */
  hiddenFrom: "md" | "lg";
}

const HIDDEN_CLASS = { md: "md:hidden", lg: "lg:hidden" } as const;

/**
 * WhatsApp-style full-screen takeover for an open conversation on mobile.
 * `position: fixed` pins it to the viewport regardless of any scroll on the
 * dashboard page underneath — the old in-flow card just scrolled away with
 * the rest of the page. Height/top are corrected against the *visual*
 * viewport (see useVisualViewport) so the input bar rides just above the
 * on-screen keyboard instead of disappearing behind it.
 *
 * Desktop/tablet are unaffected: they keep the existing bounded-height card
 * in the two-column grid; this renders alongside it, hidden by CSS once
 * `hiddenFrom` kicks in.
 */
export default function MobileChatOverlay({ header, children, hiddenFrom }: Props) {
  const { height, top } = useVisualViewport();

  return (
    <div
      className={`${HIDDEN_CLASS[hiddenFrom]} fixed inset-x-0 z-50 bg-surface-container-lowest flex flex-col`}
      style={{ top, height }}
    >
      {header}
      <div className="dashboard-bottom-safe flex-1 min-h-0 px-3">{children}</div>
    </div>
  );
}
