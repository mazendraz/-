import { useCallback, useState } from "react";
import { useToast } from "../context/ToastContext";

interface MutationOptions<TArgs> {
  /** Runs the actual write. Reject on failure — this hook does the rest. */
  mutate: (args: TArgs) => Promise<void>;
  /**
   * Applied synchronously before `mutate` settles, so the UI reflects the
   * change instantly instead of waiting on the network. Return an `undo`
   * callback; it runs automatically if `mutate` rejects.
   */
  optimisticUpdate?: (args: TArgs) => () => void;
  /** Runs after `mutate` resolves (e.g. re-fetch a server-paginated list so
   * it matches what actually landed, rather than trusting the optimistic
   * guess forever). */
  onSuccess?: (args: TArgs) => void;
  /** Toast message on failure. Defaults to a generic "couldn't save" string. */
  errorMessage?: string | ((args: TArgs) => string);
}

/**
 * Fire-and-forget admin mutations (status changes, deletes) used to have no
 * pending state, no `.catch`, and no rollback (UX-06) — a request that failed
 * (network drop, 500) was swallowed entirely; the UI just sat on stale data
 * with nothing telling the admin it hadn't actually saved. This wraps a
 * mutation with: pending state, an optimistic update applied immediately
 * (when the caller has one to give), automatic rollback + an error toast on
 * failure, and an `onSuccess` hook for reconciling against the server.
 */
export function useMutation<TArgs>({ mutate, optimisticUpdate, onSuccess, errorMessage }: MutationOptions<TArgs>) {
  const [pending, setPending] = useState(false);
  const { showToast } = useToast();

  const run = useCallback(async (args: TArgs) => {
    setPending(true);
    const rollback = optimisticUpdate?.(args);
    try {
      await mutate(args);
      onSuccess?.(args);
    } catch {
      rollback?.();
      const message = typeof errorMessage === "function" ? errorMessage(args) : errorMessage;
      showToast({ message: message ?? "Couldn't save that change. Please try again.", variant: "error" });
    } finally {
      setPending(false);
    }
  }, [showToast]);

  return { run, pending };
}
