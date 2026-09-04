import type { ApprovalQueue } from "../lib/approvals";
import { ChipBar, Chip } from "./ChipBar";

const LABELS: Record<ApprovalQueue, string> = {
  changeRequest: "طلبات التعديل",
  project: "المشاريع",
  review: "التقييمات",
  siteReview: "آراء العملاء",
  feedback: "الرسائل",
};

const ORDER: ApprovalQueue[] = ["changeRequest", "project", "review", "siteReview", "feedback"];

/**
 * The approvals tab's queue selector.
 *
 * Presentation is entirely ChipBar/Chip now — this file owns the queue ORDER
 * (lifecycle, not alphabetical) and the Arabic labels, nothing else. It used to
 * hand-roll its own horizontal ScrollView and carried the stretched-chip bug
 * that fix lives in ChipBar to prevent.
 *
 * `counts[q] || undefined` rather than `counts[q]`: a zero badge is noise, and
 * Chip only renders one when there is genuinely something waiting.
 */

export default function QueueSegments({
  active,
  counts,
  onSelect,
}: {
  active: ApprovalQueue;
  counts: Record<ApprovalQueue, number>;
  onSelect: (queue: ApprovalQueue) => void;
}) {
  return (
    <ChipBar>
      {ORDER.map((q) => (
        <Chip
          key={q}
          label={LABELS[q]}
          active={q === active}
          badge={counts[q] || undefined}
          onPress={() => onSelect(q)}
        />
      ))}
    </ChipBar>
  );
}
