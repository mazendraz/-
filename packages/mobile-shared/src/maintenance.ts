/**
 * Maintenance mode — shared by both mobile apps, and the mobile counterpart
 * of the website's own maintenance check.
 *
 * Extracted alongside the phase-1 modules but a beat later, discovered while
 * wiring the Business App's own root layout in phase 2 (see
 * docs/architecture/business-app/phase-2-foundation-auth.md): `GET /status`
 * is a public, role-agnostic route, and the gating logic (a generation guard
 * against out-of-order responses, re-checking on foreground, holding the
 * splash screen on `loading`) is identical for a customer and a staff
 * account — there was nothing app-specific left to duplicate.
 *
 * Deliberately its own `/status` call, not folded into ApiPlatformSettings —
 * `/settings` is served with a max-age=30/s-maxage=60 cache, so routing
 * maintenance through it could delay taking the app's traffic down by up to
 * five minutes. `/status` is `no-store`.
 */
import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { ApiMaintenanceStatus } from "@alassema/core";
import { apiGet } from "./api";

/** Public: current maintenance state. */
export function fetchMaintenance(): Promise<ApiMaintenanceStatus> {
  return apiGet<ApiMaintenanceStatus>("/status");
}

export const MAINTENANCE_OFF: ApiMaintenanceStatus = {
  enabled: false,
  title_en: "",
  title_ar: "",
  message_en: "",
  message_ar: "",
  eta: null,
};

/**
 * Maintenance state for the app shell (each app's own root layout renders
 * its own MaintenanceScreen in place of the whole navigator while `enabled`).
 *
 * `loading` matters the same way it does on the website: the real app must
 * not flash for a moment before the maintenance screen lands, so the caller
 * holds the splash screen until this resolves.
 *
 * Re-checks when the app returns to the foreground (the mobile equivalent of
 * the website's `visibilitychange` re-check) — otherwise an account already
 * inside the app when maintenance is flipped on wouldn't see it until they
 * force-quit and reopen.
 */
export function useMaintenance(): {
  status: ApiMaintenanceStatus;
  loading: boolean;
  refetch: () => void;
} {
  const [status, setStatus] = useState<ApiMaintenanceStatus>(MAINTENANCE_OFF);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);
  const loadRef = useRef<() => void>(() => {});

  useEffect(() => {
    alive.current = true;
    // Ordering guard. `load` runs on mount, on every AppState "active", and
    // on every refetch() from the maintenance screen's retry button, with
    // nothing serialising them. Without a generation the last RESPONSE wins
    // rather than the last REQUEST, so a slow earlier read landing late can
    // reinstate a status that is no longer true — and this value decides
    // whether the whole app is replaced by the maintenance screen.
    let generation = 0;
    const load = () => {
      const mine = ++generation;
      const current = () => alive.current && mine === generation;
      fetchMaintenance()
        .then((s) => {
          if (current()) setStatus(s);
        })
        // A failed /status read must not take the app down — reachability is
        // a separate concern (api.ts's own reachability signal).
        .catch(() => {
          if (current()) setStatus(MAINTENANCE_OFF);
        })
        .finally(() => {
          if (current()) setLoading(false);
        });
    };
    loadRef.current = load;
    load();

    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") load();
    });

    return () => {
      alive.current = false;
      sub.remove();
    };
  }, []);

  return { status, loading, refetch: () => loadRef.current() };
}
