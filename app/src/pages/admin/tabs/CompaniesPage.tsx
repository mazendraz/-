import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useLeads } from "../../../lib/requests";
import { useCompanies, useCategoriesWithCounts, type Company } from "../../../lib/catalog";
import { isApiConfigured } from "../../../lib/api";
import { setCompanyAvailability, isBusy, formatReopenDate, availableAgainAt } from "../../../lib/availability";
import { canManageUsers } from "../../../lib/users";
import { useServerSearch } from "../../../hooks/useServerSearch";
import { useToast } from "../../../context/ToastContext";
import SearchInput from "../../../components/SearchInput";
import Pagination from "../../../components/Pagination";
import { CompanyEditor } from "../CompanyEditor";
import { ConfirmDialog } from "../components/confirm";
import { EmptyState } from "../components/EmptyState";
import { Loading } from "../components/Loading";
import { useLocale } from "../../../context/LocaleContext";
import { t, tCount } from "../../../lib/i18n";
import Icon from "../../../components/Icon";

export default function CompaniesPage() {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const leads = useLeads();
  const companies = useCompanies();
  const categories = useCategoriesWithCounts();

  const { showToast } = useToast();
  const [companyQuery, setCompanyQuery] = useState("");
  const [editingCompany, setEditingCompany] = useState<{ company: Company | null } | null>(null);
  const [busyToggleId, setBusyToggleId] = useState<string | null>(null); // company row availability quick-toggle in flight
  const [busyError, setBusyError] = useState<string | null>(null); // company id whose toggle just failed
  // UX-08: this toggle changes the PUBLIC site (swaps every "Request service"
  // CTA for a waiting list) on a single click in a dense row of small buttons —
  // confirm first, and name the actual consequence rather than a generic
  // "are you sure".
  const [confirmingToggle, setConfirmingToggle] = useState<Company | null>(null);

  // `busy` is the target state to set, passed explicitly rather than
  // recomputed from `c.busy` each call — Undo needs to flip back to exactly
  // what it was before, not toggle again off a stale `c` snapshot.
  function setAvailability(c: Company, busy: boolean) {
    setBusyToggleId(c.id);
    setBusyError(null);
    void setCompanyAvailability(c.id, { busy })
      .then(() => {
        showToast({
          message: t(locale, busy ? "admin_busy_toggle_success_busy" : "admin_busy_toggle_success_available"),
          action: { label: t(locale, "admin_busy_undo"), onClick: () => setAvailability(c, !busy) },
        });
      })
      // A rejected request used to be an unhandled promise: the spinner
      // stopped, the row did not change, and nothing said why. Silence looked
      // exactly like a button that does nothing.
      .catch(() => setBusyError(c.id))
      .finally(() => setBusyToggleId(null));
  }

  const cq = companyQuery.trim().toLowerCase();
  const filteredCompanies = companies.filter((c) => !cq || [c.name, ...c.categories.map((cc) => cc.label), ...c.services].some((v) => v.toLowerCase().includes(cq)));

  // Server-driven search/pagination over the COMPLETE catalog in API mode; the
  // client filter above is the demo-mode path. The catalog mutations
  // (add/update/delete) call refreshCatalogFromApi() on settle, which updates
  // `companies` — so re-running the server query on that change keeps the list in
  // sync after edits without racing the optimistic write.
  const companyApiMode = isApiConfigured();
  const companySearch = useServerSearch<Company>(
    "/admin/companies",
    companyQuery,
    {},
    { pageSize: 12, enabled: companyApiMode },
  );
  const refreshCompanyList = companySearch.refresh;
  useEffect(() => {
    if (companyApiMode) refreshCompanyList();
  }, [companies, companyApiMode, refreshCompanyList]);
  const companyList = companyApiMode ? companySearch.data : filteredCompanies;
  const companyTotal = companyApiMode ? companySearch.total : filteredCompanies.length;

  const companiesRefetching = companyApiMode && companySearch.loading && companyList.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]"><SearchInput value={companyQuery} onChange={setCompanyQuery} placeholder={t(locale, "admin_companies_search")} /></div>
        {/* DM-17: label is `hidden sm:inline` below sm, leaving a bare "+". */}
        <button onClick={() => setEditingCompany({ company: null })} aria-label={t(locale, "admin_add_company")} className="flex items-center gap-1.5 bg-primary text-on-primary px-3 md:px-4 py-2 rounded-xl font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press flex-shrink-0">
          <Icon name="add" className="text-subhead" /><span className="hidden sm:inline">{t(locale, "admin_add_company")}</span>
        </button>
      </div>
      <p className="text-label text-outline" role="status" aria-live="polite" aria-atomic="true">
        <span className="font-black text-on-surface">{companyTotal}</span> {tCount(locale, "noun_company", companyTotal)}
      </p>
      {companyApiMode && companySearch.error && (
        <div className="bg-error/10 border border-error/25 text-error rounded-xl px-4 py-2.5 text-label font-bold">{companySearch.error}</div>
      )}
      {companyList.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
          {companyApiMode && companySearch.loading
            ? <Loading msg={t(locale, "admin_searching")} />
            : <EmptyState msg={t(locale, "admin_companies_none")} icon="search_off" />}
        </div>
      ) : (
      <div
        className={`grid grid-cols-1 lg:grid-cols-2 gap-4 transition-opacity ${companiesRefetching ? "opacity-60 pointer-events-none" : ""}`}
        aria-busy={companiesRefetching}
      >
        {companyList.map((c) => {
          // From the server's COUNT when present. Filtering the local lead
          // list only works in demo mode, where localStorage holds every
          // lead; in API mode it is one capped page and under-reports.
          const cLeads = c.leadCount ?? leads.filter((l) => l.companySlug === c.slug).length;
          const cBackAt = availableAgainAt(c);
          return (
            // DM-08: was `flex items-center gap-4` with no breakpoint — a 56px
            // logo + text + a 4-button vertical action column (~190px tall
            // regardless of content) left ~128px for the name, category and
            // stats line at 390px. Column below sm:, the original row above it.
            <div key={c.id} className="bg-surface-container-lowest rounded-2xl p-4 shadow-bloom flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <img src={c.logo} alt="" className="w-14 h-14 rounded-xl object-cover border border-outline-variant/20 flex-shrink-0" loading="lazy" width={56} height={56} />
              <div className="flex-1 min-w-0 w-full">
                <div className="flex items-center gap-1.5">
                  <p className="font-bold text-body text-on-surface truncate">{c.name}</p>
                  {c.featured !== false && <Icon name="star" className="text-secondary text-body" style={{ fontVariationSettings: "'FILL' 1" }} title={t(locale, "admin_featured")} />}
                  {isBusy(c) && (
                    // DM-11: the reopen date used to live ONLY in `title` — a
                    // touch device (this is the admin company LIST, the one
                    // screen where an admin scans "who's busy and until
                    // when" across many rows at once) never saw it at all.
                    // Now shown inline; `title` stays as a bonus mouse
                    // tooltip that says the same thing.
                    <span className="flex items-center gap-0.5 bg-amber-100 text-amber-800 text-caption font-bold px-1.5 py-0.5 rounded-full flex-shrink-0 flex-wrap"
                      title={cBackAt ? `${t(locale, "admin_busy_until")} ${formatReopenDate(cBackAt, locale)}` : t(locale, "admin_busy")}>
                      <Icon name="event_busy" className="text-caption" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" />
                      {t(locale, "admin_busy")}
                      {cBackAt && <span className="font-normal opacity-90">· {formatReopenDate(cBackAt, locale)}</span>}
                    </span>
                  )}
                </div>
                <p className="text-caption text-outline truncate">{c.categoryLabel}</p>
                {/* flex-wrap: DM-08 — the row stayed on one line before and
                    could get clipped in a narrow column layout. */}
                <div className="flex flex-wrap items-center gap-2 text-caption text-outline mt-0.5">
                  <span>★ {c.rating}</span><span>·</span><span>{c.completedProjects} {tCount(locale, "noun_project", c.completedProjects)}</span><span>·</span><span>{cLeads} {tCount(locale, "noun_lead", cLeads)}</span>
                </div>
              </div>
              {/* DM-08: row of buttons on mobile (wraps if needed) instead of
                  a fixed vertical stack that ate most of the card's width. */}
              <div className="flex flex-row flex-wrap sm:flex-col gap-1.5 flex-shrink-0 w-full sm:w-auto">
                <button onClick={() => setEditingCompany({ company: c })} className="flex items-center gap-1 bg-surface-container px-3 py-1.5 min-h-[44px] rounded-lg text-caption font-bold text-on-surface hover:bg-surface-container-high transition-colors">
                  <Icon name="edit" className="text-label" /> {t(locale, "admin_edit")}
                </button>
                <button
                  onClick={() => {
                    if (busyToggleId === c.id) return; // in flight — ignore a second click
                    setConfirmingToggle(c);
                  }}
                  disabled={busyToggleId === c.id}
                  title={t(locale, isBusy(c) ? "admin_mark_available" : "admin_mark_busy")}
                  className={`flex items-center gap-1 px-3 py-1.5 min-h-[44px] rounded-lg text-caption font-bold transition-colors disabled:opacity-60 ${
                    isBusy(c) ? "text-amber-700 hover:bg-amber-50" : "text-outline hover:text-primary"
                  }`}>
                  <span className="material-symbols-outlined text-label" aria-hidden="true" translate="no">{busyToggleId === c.id ? "progress_activity" : (isBusy(c) ? "event_available" : "event_busy")}</span>
                  {t(locale, isBusy(c) ? "admin_open" : "admin_busy")}
                </button>
                {busyError === c.id && (
                  <p className="text-caption font-bold text-error max-w-[9rem] leading-snug">
                    {t(locale, "admin_busy_toggle_failed")}
                  </p>
                )}
                <Link to={`/companies/${c.slug}`} target="_blank" className="flex items-center gap-1 px-3 py-1.5 min-h-[44px] rounded-lg text-caption font-bold text-outline hover:text-primary transition-colors">
                  <Icon name="open_in_new" className="text-label" /> {t(locale, "admin_view")}
                </Link>
                {canManageUsers() && (
                  <button onClick={() => navigate("/admin/team", { state: { prefillCompanyId: c.id } })}
                    title={t(locale, "admin_create_login_title")}
                    className="flex items-center gap-1 px-3 py-1.5 min-h-[44px] rounded-lg text-caption font-bold text-outline hover:text-primary transition-colors">
                    <Icon name="person_add" className="text-label" /> {t(locale, "admin_login")}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      )}
      {companyApiMode && (
        <Pagination page={companySearch.page} pageCount={companySearch.pageCount} total={companySearch.total} pageSize={companySearch.pageSize} onPage={companySearch.setPage} nounKey="noun_company" />
      )}

      {editingCompany && (
        <CompanyEditor
          company={editingCompany.company}
          categories={categories}
          onClose={() => setEditingCompany(null)}
        />
      )}

      {confirmingToggle && (
        <ConfirmDialog
          title={`${t(locale, isBusy(confirmingToggle) ? "admin_mark_available" : "admin_mark_busy")} — ${confirmingToggle.name}`}
          message={t(locale, isBusy(confirmingToggle) ? "admin_confirm_mark_available_body" : "admin_confirm_mark_busy_body")}
          confirmLabel={t(locale, isBusy(confirmingToggle) ? "admin_open" : "admin_busy")}
          danger={!isBusy(confirmingToggle)}
          onConfirm={() => {
            const c = confirmingToggle;
            setConfirmingToggle(null);
            setAvailability(c, !isBusy(c));
          }}
          onCancel={() => setConfirmingToggle(null)}
        />
      )}
    </div>
  );
}
