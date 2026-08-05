import { useState } from "react";
import { updateLeadStatus, type Lead, type LeadStatus } from "../../lib/requests";
import {
  setWaitlistStatus, deleteWaitlistEntry,
  type WaitlistEntry, type WaitlistStatus,
} from "../../lib/availability";
import { useMutation } from "../../hooks/useMutation";
import { useLocale } from "../../context/LocaleContext";
import { t } from "../../lib/i18n";
import type { LeadListRow } from "../admin/LeadsTab";

interface Options {
  /** Called after a successful lead-status change. The Leads tab passes its
   *  server-search refresh here; Overview passes nothing, because its list
   *  comes from the `useLeads` store, which the mutation already updates. */
  onLeadChanged?: (status: LeadStatus) => void;
  /** Same, for the waiting-list sources. */
  onWaitlistChanged?: (status: WaitlistStatus) => void;
  onWaitlistDeleted?: () => void;
}

/**
 * The lead/waitlist mutations plus the detail-modal selection, shared by the
 * provider's Overview and Leads tabs (DM-02 split them into separate routes,
 * and both show lead rows).
 *
 * UX-06 is preserved: every mutation goes through `useMutation`, so a failed
 * PATCH surfaces a toast and rolls back instead of being swallowed.
 */
export function useProviderLeadActions({ onLeadChanged, onWaitlistChanged, onWaitlistDeleted }: Options = {}) {
  const { locale } = useLocale();
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedWaitlist, setSelectedWaitlist] = useState<WaitlistEntry | null>(null);

  const openRow = (row: LeadListRow) => {
    if (row.kind === "lead") setSelectedLead(row.data);
    else setSelectedWaitlist(row.data);
  };

  const leadStatusMutation = useMutation<{ id: string; status: LeadStatus }>({
    mutate: ({ id, status }) => updateLeadStatus(id, status),
    // Keep an open detail modal in step with the change it just made, and put
    // it back if the request fails — otherwise the modal and the row behind it
    // disagree about the status.
    optimisticUpdate: ({ id, status }) => {
      const prev = selectedLead;
      if (prev?.id === id) setSelectedLead({ ...prev, status });
      return () => { if (prev?.id === id) setSelectedLead(prev); };
    },
    onSuccess: ({ status }) => onLeadChanged?.(status),
    errorMessage: t(locale, "admin_mutation_failed"),
  });

  const waitlistStatusMutation = useMutation<{ entry: WaitlistEntry; status: WaitlistStatus }>({
    mutate: ({ entry, status }) => setWaitlistStatus({ kind: "provider" }, entry.id, status),
    optimisticUpdate: ({ entry, status }) => {
      const prev = selectedWaitlist;
      if (prev?.id === entry.id) setSelectedWaitlist({ ...prev, status });
      return () => { if (prev?.id === entry.id) setSelectedWaitlist(prev); };
    },
    onSuccess: ({ status }) => onWaitlistChanged?.(status),
    errorMessage: t(locale, "admin_mutation_failed"),
  });

  const waitlistDeleteMutation = useMutation<WaitlistEntry>({
    mutate: (entry) => deleteWaitlistEntry({ kind: "provider" }, entry.id),
    onSuccess: () => onWaitlistDeleted?.(),
    errorMessage: t(locale, "admin_delete_failed"),
  });

  return {
    selectedLead, setSelectedLead,
    selectedWaitlist, setSelectedWaitlist,
    openRow,
    handleLeadStatus: (id: string, status: LeadStatus) => { void leadStatusMutation.run({ id, status }); },
    handleWaitlistStatus: (entry: WaitlistEntry, status: WaitlistStatus) => { void waitlistStatusMutation.run({ entry, status }); },
    handleWaitlistDelete: (entry: WaitlistEntry) => { void waitlistDeleteMutation.run(entry); },
  };
}
