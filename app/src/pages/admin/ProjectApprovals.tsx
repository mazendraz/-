import { useState, useEffect, useCallback } from "react";
import {
  listModerationProjects, setProjectStatus, deleteProjectAdmin, type ModerationProject,
} from "../../lib/projects";
import type { ProjectStatus } from "../../lib/data";
import { EmptyState } from "./components/EmptyState";
import { useLocale } from "../../context/LocaleContext";
import { t } from "../../lib/i18n";
import Icon from "../../components/Icon";

// Moderation queue for provider-submitted portfolio projects. Pending projects
// are hidden from the public profile until approved here. Also lets the admin
// revisit rejected ones (re-approve or delete).
export function ProjectApprovals() {
  const { locale } = useLocale();
  const [status, setStatus] = useState<ProjectStatus>("PENDING");
  const [items, setItems] = useState<ModerationProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [preview, setPreview] = useState<ModerationProject | null>(null);

  const reload = useCallback(async () => {
    setLoading(true); setError("");
    try { setItems(await listModerationProjects(status)); }
    catch { setError(t(locale, "admin_pa_load_error")); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { void reload(); }, [reload]);

  async function act(p: ModerationProject, next: ProjectStatus) {
    if (!p.id) return;
    setBusyId(p.id); setError("");
    try { await setProjectStatus(p.id, next); setItems((cur) => cur.filter((x) => x.id !== p.id)); setPreview(null); }
    catch { setError(t(locale, "admin_pa_action_failed")); }
    finally { setBusyId(null); }
  }
  async function remove(p: ModerationProject) {
    if (!p.id) return;
    setBusyId(p.id); setError("");
    try { await deleteProjectAdmin(p.id); setItems((cur) => cur.filter((x) => x.id !== p.id)); setPreview(null); }
    catch { setError(t(locale, "admin_pa_delete_error")); }
    finally { setBusyId(null); }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-body text-on-surface">{t(locale, "admin_pa_title")}</h2>
          <p className="text-caption text-outline mt-0.5">{t(locale, "admin_pa_sub")}</p>
        </div>
        <div className="flex bg-surface-container rounded-xl p-0.5">
          {(["PENDING", "REJECTED"] as ProjectStatus[]).map((s) => (
            <button key={s} onClick={() => setStatus(s)}
              className={`px-3 py-1.5 min-h-[44px] rounded-lg text-caption font-bold transition-colors ${status === s ? "bg-surface-container-lowest text-primary shadow-sm" : "text-outline hover:text-on-surface"}`}>
              {t(locale, s === "PENDING" ? "admin_pa_pending" : "admin_pa_rejected")}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="text-label text-error font-bold bg-error/8 rounded-lg px-3 py-2">{error}</p>}

      {loading ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-8 text-center text-label text-outline">
          <span className="spinner spinner-primary mx-auto mb-3 block" /> {t(locale, "admin_loading")}
        </div>
      ) : items.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
          <EmptyState msg={t(locale, status === "PENDING" ? "admin_pa_none_pending" : "admin_pa_none_rejected")} icon="task_alt" />
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((p) => (
            <div key={p.id} className="bg-surface-container-lowest rounded-xl p-3 shadow-bloom flex gap-3">
              <button onClick={() => setPreview(p)} className="flex-shrink-0 group relative" title={t(locale, "admin_pa_view_project")}>
                <img src={p.img} alt="" className="w-20 h-20 rounded-lg object-cover border border-outline-variant/20" width={80} height={80} />
                <span className="absolute inset-0 rounded-lg bg-on-background/0 group-hover:bg-on-background/30 flex items-center justify-center transition-colors">
                  <Icon name="zoom_in" className="text-white text-title opacity-0 group-hover:opacity-100 transition-opacity" />
                </span>
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setPreview(p)} className="font-bold text-label text-on-surface text-start hover:text-primary transition-colors min-h-[44px] flex items-center">{p.title}</button>
                  <span className="text-caption text-outline">{p.year}</span>
                </div>
                <p className="text-caption font-bold text-primary truncate">{p.companyName}</p>
                <p className="text-caption text-on-surface-variant line-clamp-2 mt-0.5">{p.description}</p>
                {/* flex-wrap: found while closing out Phase 3 — up to 4 actions
                    (view/approve/reject/delete) in a row with a fixed 80px
                    thumbnail left ~278px of a 390px card for them, and Phase 2's
                    44px touch-target pass (min-h-[44px] on View/Approve) was
                    enough width to push it into a real horizontal overflow.
                    Wrapping keeps every button reachable without shrinking the
                    touch targets back down. */}
                <div className="flex flex-wrap gap-2 mt-2">
                  <button onClick={() => setPreview(p)}
                    className="flex items-center gap-1 bg-surface-container px-3 py-1.5 min-h-[44px] rounded-lg text-caption font-bold text-on-surface hover:bg-surface-container-high transition-colors">
                    <Icon name="visibility" className="text-label" /> {t(locale, "admin_view")}
                  </button>
                  {status !== "APPROVED" && (
                    <button onClick={() => act(p, "APPROVED")} disabled={busyId === p.id}
                      className="flex items-center gap-1 bg-primary text-on-primary px-3 py-1.5 min-h-[44px] rounded-lg text-caption font-bold hover:bg-primary-container transition-colors disabled:opacity-60">
                      <Icon name="check" className="text-label" /> {t(locale, "admin_approve")}
                    </button>
                  )}
                  {status === "PENDING" && (
                    <button onClick={() => act(p, "REJECTED")} disabled={busyId === p.id}
                      className="flex items-center gap-1 border border-error/30 text-error px-3 py-1.5 min-h-[44px] rounded-lg text-caption font-bold hover:bg-error/5 transition-colors disabled:opacity-60">
                      <Icon name="close" className="text-label" /> {t(locale, "admin_reject")}
                    </button>
                  )}
                  <button onClick={() => remove(p)} disabled={busyId === p.id} aria-label={`${t(locale, "admin_delete")} ${p.title}`}
                    className="flex items-center gap-1 text-outline w-11 h-11 -m-2.5 justify-center rounded-lg font-bold hover:text-error hover:bg-error/5 transition-colors disabled:opacity-60">
                    <Icon name="delete" className="text-label" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {preview && (
        <ProjectPreviewModal
          project={preview}
          busy={busyId === preview.id}
          onClose={() => setPreview(null)}
          onApprove={() => act(preview, "APPROVED")}
          onReject={() => act(preview, "REJECTED")}
          onDelete={() => remove(preview)}
        />
      )}
    </div>
  );
}

// Full-detail view of a submitted project so the admin can read everything before
// deciding. Approve / Reject / Delete are available right here too.
export function ProjectPreviewModal({ project, busy, onClose, onApprove, onReject, onDelete }: {
  project: ModerationProject;
  busy: boolean;
  onClose: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
}) {
  const { locale } = useLocale();
  const isRejected = project.status === "REJECTED";
  return (
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-on-background/45 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface-container-lowest w-full max-w-xl sm:rounded-2xl shadow-2xl max-h-screen sm:max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20 sticky top-0 bg-surface-container-lowest z-10">
          <h2 className="font-bold text-subhead text-on-surface">{t(locale, "admin_pa_modal_title")}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-container transition-colors"><Icon name="close" className="text-outline" /></button>
        </div>
        <div className="p-5 space-y-4">
          <img src={project.img} alt={project.title} className="w-full max-h-[50vh] object-contain rounded-xl bg-surface-container" />
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-subhead text-on-surface">{project.title}</h3>
              <span className="text-caption font-bold text-outline">{project.year}</span>
              {isRejected && <span className="text-caption font-bold px-2 py-0.5 rounded-full bg-error/10 text-error">{t(locale, "admin_pa_rejected")}</span>}
            </div>
            <p className="text-label font-bold text-primary mt-0.5">{project.companyName}</p>
          </div>
          {project.description
            ? <p className="text-label text-on-surface-variant leading-relaxed whitespace-pre-wrap">{project.description}</p>
            : <p className="text-label text-outline italic">{t(locale, "admin_pa_no_description")}</p>}
        </div>
        <div className="flex flex-wrap justify-end gap-2.5 p-5 border-t border-outline-variant/20 sticky bottom-0 bg-surface-container-lowest">
          <button onClick={onDelete} disabled={busy}
            className="me-auto flex items-center gap-1 text-outline px-3 py-2.5 rounded-xl text-label font-bold hover:text-error hover:bg-error/5 transition-colors disabled:opacity-60">
            <Icon name="delete" className="text-body" /> {t(locale, "admin_delete")}
          </button>
          {!isRejected && (
            <button onClick={onReject} disabled={busy}
              className="flex items-center gap-1 border border-error/30 text-error px-4 py-2.5 rounded-xl text-label font-bold hover:bg-error/5 transition-colors disabled:opacity-60">
              <Icon name="close" className="text-body" /> {t(locale, "admin_reject")}
            </button>
          )}
          <button onClick={onApprove} disabled={busy}
            className="flex items-center gap-1 bg-primary text-on-primary px-5 py-2.5 rounded-xl text-label font-bold hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60 disabled:cursor-not-allowed">
            {busy ? <Icon name="progress_activity" className="text-body animate-spin" /> : <Icon name="check" className="text-body" />}
            {t(locale, busy ? "admin_working" : "admin_approve")}
          </button>
        </div>
      </div>
    </div>
  );
}
