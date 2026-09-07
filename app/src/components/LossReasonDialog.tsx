import { useState } from "react";
import Modal from "./Modal";
import Select from "./Select";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import {
  LEAD_LOSS_REASONS,
  LEAD_LOSS_REASON_LABELS_AR,
  LEAD_LOSS_REASON_LABELS_EN,
  LOSS_NOTE_REQUIRED_FOR,
  checkLossReason,
  type ApiLeadLossReason,
} from "@alassema/core";
import type { LeadStatus } from "../lib/requests";

export interface LossPayload {
  lossReason: ApiLeadLossReason;
  lossNote?: string;
}

/**
 * Asks why a request is being cancelled, because the API will not record the
 * cancellation without an answer (leads.service.updateStatus).
 *
 * The point of the field is that it gets filled with something true, so the
 * dialog is deliberately one screen with no free-text-only escape: a fixed
 * short list, plus a note that is optional everywhere except "Other" — where a
 * blank note would make the whole record say nothing.
 */
export function LossReasonDialog({ onCancel, onConfirm, busy }: {
  onCancel: () => void;
  onConfirm: (loss: LossPayload) => void;
  busy?: boolean;
}) {
  const { locale } = useLocale();
  const labels = locale === "ar" ? LEAD_LOSS_REASON_LABELS_AR : LEAD_LOSS_REASON_LABELS_EN;
  const [reason, setReason] = useState<ApiLeadLossReason | "">("");
  const [note, setNote] = useState("");
  const [touched, setTouched] = useState(false);

  const problem = checkLossReason(reason || null, note);
  const noteRequired = reason !== "" && LOSS_NOTE_REQUIRED_FOR.includes(reason);

  return (
    <Modal onClose={busy ? () => {} : onCancel} title={t(locale, "loss_reason_title")} closeDisabled={busy}>
      <div className="space-y-4">
        <p className="text-label text-outline leading-relaxed">{t(locale, "loss_reason_desc")}</p>

        <div>
          <label className="block text-label font-bold mb-1.5 text-on-surface">
            {t(locale, "loss_reason_label")}<span className="text-error ms-0.5">*</span>
          </label>
          <Select
            value={reason}
            onChange={(v) => { setReason(v as ApiLeadLossReason); setTouched(true); }}
            placeholder={t(locale, "loss_reason_ph")}
            options={[
              { value: "", label: t(locale, "loss_reason_ph") },
              ...LEAD_LOSS_REASONS.map((r) => ({ value: r, label: labels[r] })),
            ]}
          />
        </div>

        <div>
          <label className="block text-label font-bold mb-1.5 text-on-surface">
            {t(locale, "loss_reason_note")}
            {noteRequired && <span className="text-error ms-0.5">*</span>}
          </label>
          <textarea
            className="field-input resize-none"
            rows={3}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t(locale, noteRequired ? "loss_reason_note_req_ph" : "loss_reason_note_ph")}
          />
        </div>

        {touched && problem && <p className="text-caption text-error font-bold">{problem}</p>}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onCancel} disabled={busy}
            className="px-4 py-2.5 rounded-xl font-bold text-label text-on-surface-variant hover:bg-surface-container transition-colors touch-press disabled:opacity-50">
            {t(locale, "common_cancel")}
          </button>
          <button
            type="button"
            disabled={busy || problem != null}
            onClick={() => { setTouched(true); if (!problem && reason) onConfirm({ lossReason: reason, lossNote: note.trim() || undefined }); }}
            className="bg-error text-on-error px-5 py-2.5 rounded-xl font-bold text-label transition-colors touch-press btn-press disabled:opacity-50 disabled:cursor-not-allowed">
            {t(locale, "loss_reason_confirm")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Wraps a status-change handler so that moving a lead to "Cancelled" collects a
 * reason first and every other transition is untouched.
 *
 * A hook rather than a prop on each modal because the same interception is
 * needed from four screens (admin table + modal, provider table + overview) and
 * they all already funnel into one `handleLeadStatus(id, status)`. Wrapping
 * that one function is the difference between one gate and four that drift.
 */
export function useLossReasonGate(
  run: (id: string, status: LeadStatus, loss?: LossPayload) => void,
) {
  const [pendingId, setPendingId] = useState<string | null>(null);

  return {
    /** Drop-in replacement for the original handler. */
    onStatusChange: (id: string, status: LeadStatus) => {
      if (status === "Cancelled") { setPendingId(id); return; }
      run(id, status);
    },
    /** Render this next to the screen's other modals. */
    dialog: pendingId ? (
      <LossReasonDialog
        onCancel={() => setPendingId(null)}
        onConfirm={(loss) => { run(pendingId, "Cancelled", loss); setPendingId(null); }}
      />
    ) : null,
  };
}
