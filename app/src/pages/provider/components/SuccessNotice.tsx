import Icon from "../../../components/Icon";

/** Replaces the plain text flash banner with a brief success card — a filled
 *  checkmark badge plus the "submitted for review" copy. Reuses the existing
 *  `.toast-enter` keyframe (index.css) rather than inventing a new animation. */
export default function SuccessNotice({ title, message }: { title: string; message: string }) {
  return (
    <div className="toast-enter flex items-start gap-3 bg-primary/8 border border-primary/25 rounded-xl px-4 py-3.5">
      <span className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center">
        <Icon name="check" className="text-subhead" />
      </span>
      <div className="min-w-0">
        <p className="font-bold text-label text-on-surface">{title}</p>
        <p className="text-label text-on-surface-variant mt-0.5">{message}</p>
      </div>
    </div>
  );
}
