import { Link } from "react-router-dom";
import Icon from "./Icon";

interface EmptyStateAction {
  label: string;
  onClick: () => void;
}

interface EmptyStateProps {
  icon: string;
  title?: string;
  /** Body copy — the only text for a simple "nothing here" state; a
   * supporting line under `title` for the richer ones. */
  msg?: string;
  /** A button that runs a callback (retry, clear filters, open an editor). */
  action?: EmptyStateAction;
  /** A real `<Link>` instead of a button, for "browse X" navigational CTAs —
   * keeps them as actual anchors rather than button-triggered navigation. */
  actionHref?: { label: string; to: string };
  /** "error" tints the icon circle for a failure state (CatalogError). */
  tone?: "primary" | "error";
  className?: string;
}

/**
 * One empty-state block for the whole app (CMP-05) — the
 * `w-16 h-16 rounded-full bg-{color}/8 + icon` circle used to be hand-written
 * in six-plus places (Companies, Services, Saved, MyRequests, Messages,
 * admin's OverviewTab, CatalogError), each a separate chance to drift, plus a
 * bare-icon variant duplicated across every admin tab and the provider
 * dashboard.
 */
export default function EmptyState({ icon, title, msg, action, actionHref, tone = "primary", className = "" }: EmptyStateProps) {
  const actionClassName = "inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-label hover:bg-primary-container transition-colors touch-press";
  return (
    <div className={`text-center py-14 px-6 ${className}`}>
      <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${tone === "error" ? "bg-error/8" : "bg-primary/8"}`}>
        <Icon name={icon} className={`text-headline ${tone === "error" ? "text-error" : "text-primary"}`} />
      </div>
      {title && <p className="font-bold text-subhead text-on-surface mb-1">{title}</p>}
      {msg && <p className={title ? "text-label text-outline max-w-sm mx-auto mb-5" : "text-body text-outline max-w-sm mx-auto"}>{msg}</p>}
      {action && <button onClick={action.onClick} className={actionClassName}>{action.label}</button>}
      {actionHref && <Link to={actionHref.to} className={actionClassName}>{actionHref.label}</Link>}
    </div>
  );
}
