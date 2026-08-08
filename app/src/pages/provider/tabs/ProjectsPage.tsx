import { useCallback, useEffect, useRef, useState } from "react";
import { isApiConfigured } from "../../../lib/api";
import { listMyProjects, createMyProject, updateMyProject, deleteMyProject, type ProjectInput } from "../../../lib/projects";
import { uploadImage } from "../../../lib/image";
import type { Project } from "../../../lib/data";
import Modal from "../../../components/Modal";
import Icon from "../../../components/Icon";
import { EmptyState } from "../../admin/components/EmptyState";
// `Loading` is defined locally at the bottom of this file (it came over with
// the projects tab) — no import.
import { useLocale } from "../../../context/LocaleContext";
import { t, type StringKey } from "../../../lib/i18n";
import { useProvider } from "../context";
import { useVisualViewport } from "../../../hooks/useVisualViewport";

export default function ProjectsPage() {
  const { company } = useProvider();
  return <ProviderProjectsTab company={company} />;
}

type Company = ReturnType<typeof useProvider>["company"];

// Status pill shown on each provider project card.
const PROJECT_STATUS_BADGE: Record<string, { labelKey: StringKey; cls: string; icon: string }> = {
  PENDING: { labelKey: "prov_proj_status_pending" as StringKey, cls: "bg-amber-100 text-amber-800", icon: "hourglass_top" },
  APPROVED: { labelKey: "prov_proj_status_approved" as StringKey, cls: "bg-green-100 text-green-800", icon: "check_circle" },
  REJECTED: { labelKey: "prov_proj_status_rejected" as StringKey, cls: "bg-error/10 text-error", icon: "cancel" },
};

// Provider portfolio management. Providers build their own projects; each new or
// edited project is submitted for admin approval before it shows on the public
// profile. Demo mode (no API) stays read-only.
function ProviderProjectsTab({ company }: { company: Company }) {
  const { locale } = useLocale();
  const apiMode = isApiConfigured();
  const [projects, setProjects] = useState<Project[]>(company.projects);
  const [loading, setLoading] = useState(apiMode);
  // The translation KEY, resolved at render — calling t() inside the callback
  // captured the language it was built with, and adding `locale` to the deps
  // would refetch the project list on every language toggle.
  const [errorKey, setErrorKey] = useState<StringKey | null>(null);
  const error = errorKey ? t(locale, errorKey) : "";
  const [editing, setEditing] = useState<{ project: Project | null } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!apiMode) { setProjects(company.projects); setLoading(false); return; }
    setLoading(true); setErrorKey(null);
    try { setProjects(await listMyProjects()); }
    catch { setErrorKey("prov_proj_err_load"); }
    finally { setLoading(false); }
  }, [apiMode, company.projects]);

  useEffect(() => { void reload(); }, [reload]);

  async function handleDelete(p: Project) {
    if (!p.id) return;
    setBusyId(p.id); setErrorKey(null);
    try { await deleteMyProject(p.id); await reload(); }
    catch { setErrorKey("prov_proj_err_delete"); }
    // finally, not just the catch: clearing it only on failure left the flag set
    // for a row that no longer exists, so a later project reusing that position
    // rendered with a spinner and disabled buttons it never earned.
    finally { setBusyId(null); }
  }

  // Demo mode (no API): keep the old read-only view.
  if (!apiMode) {
    return (
      <div className="space-y-4">
        {company.projects.length === 0 ? (
          <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg={t(locale, "prov_proj_empty")} icon="photo_library" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
            {company.projects.map((p) => (
              <div key={p.title} className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom">
                <div className="relative h-48 overflow-hidden">
                  <img src={p.img} alt={p.title} className="w-full h-full object-cover" width={400} height={192} />
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-caption font-display px-2 py-0.5 rounded-full">{p.year}</div>
                </div>
                <div className="p-4">
                  <h3 className="font-display text-title text-on-surface mb-1">{p.title}</h3>
                  <p className="text-on-surface-variant text-sm leading-relaxed">{p.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="bg-surface-container-lowest rounded-2xl p-6 text-center shadow-bloom">
          <p className="text-body text-outline">{t(locale, "prov_proj_needs_api")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-bold text-body text-on-surface">{t(locale, "prov_proj_title")}</h2>
          <p className="text-caption text-outline mt-0.5 max-w-md leading-relaxed">
            {t(locale, "prov_proj_desc")}
          </p>
        </div>
        <button onClick={() => setEditing({ project: null })}
          className="flex items-center gap-1.5 bg-primary text-on-primary px-4 py-2 rounded-xl font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press flex-shrink-0">
          <Icon name="add_photo_alternate" className="text-subhead" /> {t(locale, "prov_proj_add")}
        </button>
      </div>

      {error && <p className="text-label text-error font-bold bg-error/8 rounded-lg px-3 py-2">{error}</p>}

      {loading && projects.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-10 text-center text-label text-outline">
          <span className="spinner spinner-primary mx-auto mb-3 block" /> {t(locale, "prov_proj_loading")}
        </div>
      ) : projects.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg={t(locale, "prov_proj_empty_add")} icon="photo_library" /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-gutter">
          {projects.map((p) => {
            const badge = PROJECT_STATUS_BADGE[p.status ?? "APPROVED"] ?? PROJECT_STATUS_BADGE.APPROVED;
            return (
              <div key={p.id ?? p.title} className="bg-surface-container-lowest rounded-2xl overflow-hidden shadow-bloom flex flex-col">
                <div className="relative h-44 overflow-hidden">
                  <img src={p.img} alt={p.title} className="w-full h-full object-cover" width={400} height={176} />
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-caption font-bold px-2 py-0.5 rounded-full">{p.year}</div>
                  <span className={`absolute top-2 left-2 flex items-center gap-1 text-caption font-bold px-2 py-0.5 rounded-full ${badge.cls}`}>
                    <span className="material-symbols-outlined text-label" aria-hidden="true" translate="no">{badge.icon}</span>{t(locale, badge.labelKey)}
                  </span>
                </div>
                <div className="p-4 flex flex-col flex-grow">
                  <h3 className="font-bold text-body text-on-surface mb-1">{p.title}</h3>
                  <p className="text-label text-on-surface-variant leading-relaxed line-clamp-3 flex-grow">{p.description}</p>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-outline-variant/15">
                    <button onClick={() => setEditing({ project: p })} disabled={busyId === p.id}
                      className="flex-1 flex items-center justify-center gap-1 bg-surface-container py-2 min-h-[44px] rounded-lg text-caption font-bold text-on-surface hover:bg-surface-container-high transition-colors disabled:opacity-60">
                      <Icon name="edit" className="text-label" /> {t(locale, "prov_proj_edit_btn")}
                    </button>
                    {/* Icon-only, and unlabeled before: pre-existing critical
                        a11y bug carried over verbatim from the old monolith,
                        found while closing out Phase 3. */}
                    <button onClick={() => handleDelete(p)} disabled={busyId === p.id}
                      aria-label={`${t(locale, "admin_delete")} ${p.title}`}
                      className="flex items-center justify-center gap-1 border border-error/30 text-error rounded-lg font-bold hover:bg-error/5 transition-colors px-3 py-2 min-h-[44px] text-caption disabled:opacity-60">
                      <span className="material-symbols-outlined text-label" aria-hidden="true" translate="no">{busyId === p.id ? "progress_activity" : "delete"}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <ProjectEditorModal
          project={editing.project}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void reload(); }}
        />
      )}
    </div>
  );
}

function ProjectEditorModal({ project, onClose, onSaved }: {
  project: Project | null; onClose: () => void; onSaved: () => void;
}) {
  const { locale } = useLocale();
  const isNew = !project;
  const [title, setTitle] = useState(project?.title ?? "");
  const [year, setYear] = useState(project?.year ?? String(new Date().getFullYear()));
  const [description, setDescription] = useState(project?.description ?? "");
  const [img, setImg] = useState(project?.img ?? "");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true); setError("");
    try { setImg(await uploadImage(f, "projects", 1600, "/provider/upload")); }
    catch (err) { setError(err instanceof Error ? err.message : t(locale, "prov_proj_err_upload")); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ""; }
  }

  async function save() {
    if (title.trim().length < 1) { setError(t(locale, "prov_proj_err_title")); return; }
    if (!img) { setError(t(locale, "prov_proj_err_image")); return; }
    if (!year.trim()) { setError(t(locale, "prov_proj_err_year")); return; }
    setSaving(true); setError("");
    const input: ProjectInput = { title: title.trim(), img, description: description.trim(), year: year.trim() };
    try {
      if (project?.id) await updateMyProject(project.id, input);
      else await createMyProject(input);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(locale, "prov_proj_err_save"));
      setSaving(false);
    }
  }

  const wasApproved = project?.status === "APPROVED";
  // On mobile, focusing a field opens the on-screen keyboard, which shrinks the
  // *visual* viewport without shrinking `100vh` (the layout viewport) on iOS
  // Safari — so the sticky Save footer below, sized off `max-h-screen`, ends up
  // rendered underneath the keyboard. Cap the panel to the visible height once
  // the keyboard is open so the footer stays reachable.
  const { height: vvHeight } = useVisualViewport();
  const keyboardOpen = typeof window !== "undefined" && window.innerHeight - vvHeight > 60;

  return (
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-on-background/45 backdrop-blur-sm" onClick={onClose}>
      <div
        className="bg-surface-container-lowest w-full max-w-lg sm:rounded-2xl shadow-2xl max-h-screen sm:max-h-[92vh] overflow-y-auto"
        style={keyboardOpen ? { maxHeight: vvHeight } : undefined}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20 sticky top-0 bg-surface-container-lowest z-10">
          <h2 className="font-bold text-subhead text-on-surface">{t(locale, isNew ? "prov_proj_add" : "prov_proj_edit")}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-container transition-colors"><Icon name="close" className="text-outline" /></button>
        </div>
        <div className="p-5 space-y-4">
          {/* Image */}
          <div>
            <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "prov_proj_image")}</label>
            <div onClick={() => fileRef.current?.click()}
              className="relative h-44 w-full rounded-xl border-2 border-dashed border-outline-variant/40 hover:border-primary/50 hover:bg-surface-container/40 flex flex-col items-center justify-center text-center overflow-hidden cursor-pointer transition-colors">
              {uploading ? <span className="spinner spinner-primary" />
                : img ? <img src={img} alt="" className="w-full h-full object-cover" width={450} height={176} />
                : (<><Icon name="cloud_upload" className="text-outline/60 text-headline" />
                    <p className="text-caption font-bold text-outline mt-1">{t(locale, "prov_upload_drop")} <span className="text-primary">{t(locale, "prov_upload_browse")}</span></p></>)}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "prov_proj_field_title")}</label>
              <input className="field-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t(locale, "prov_proj_title_ph")} />
            </div>
            <div>
              <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "prov_proj_year")}</label>
              <input className="field-input" value={year} onChange={(e) => setYear(e.target.value)} placeholder={t(locale, "prov_proj_year_ph")} />
            </div>
          </div>
          <div>
            <label className="block text-label font-bold text-on-surface mb-1.5">{t(locale, "prov_proj_description")}</label>
            <textarea className="field-input resize-y" rows={4} value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t(locale, "prov_proj_description_ph")} />
          </div>

          <div className="flex items-start gap-2 bg-amber-50 text-amber-800 rounded-xl px-3 py-2.5 text-caption font-medium">
            <Icon name="info" className="text-subhead flex-shrink-0" />
            <span>{wasApproved
              ? t(locale, "prov_proj_note_edit")
              : t(locale, "prov_proj_note_new")}</span>
          </div>

          {error && <p className="text-label text-error font-bold">{error}</p>}
        </div>
        <div className="flex justify-end gap-3 p-5 border-t border-outline-variant/20 sticky bottom-0 bg-surface-container-lowest">
          <button onClick={onClose} disabled={saving} className="px-5 py-2.5 rounded-xl border border-outline-variant/40 font-bold text-label text-on-surface hover:bg-surface-container transition-colors disabled:opacity-60">{t(locale, "prov_proj_cancel")}</button>
          <button onClick={save} disabled={saving || uploading}
            className="px-6 py-2.5 rounded-xl bg-primary text-on-primary font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2">
            {saving && <Icon name="progress_activity" className="text-subhead animate-spin" />}
            {saving ? t(locale, "prov_proj_submitting") : t(locale, isNew ? "prov_proj_submit" : "prov_proj_save")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** In-flight state — visually distinct from EmptyState (CMP-02): a spinner,
 * never the "no results" icon, so a still-loading list can't be read as
 * "nothing found" while data is on the way. */
function Loading({ msg }: { msg: string }) {
  return (
    <div className="text-center py-14 px-6">
      <span className="spinner spinner-primary mx-auto mb-3 block" />
      <p className="text-subhead text-outline max-w-sm mx-auto">{msg}</p>
    </div>
  );
}

