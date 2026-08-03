import { useLocation, useNavigate } from "react-router-dom";
import { useCompanies } from "../../../lib/catalog";
import { TeamTab } from "../TeamTab";

/**
 * Companies → "Create login" navigates here with `location.state.prefillCompanyId`
 * so the new-user editor opens pre-linked to that company — replaces the
 * `teamPrefillCompany` state that used to live in the (now-gone) shared
 * admin/index.tsx monolith, since Companies and Team are separate routes now.
 */
export default function TeamPage() {
  const companies = useCompanies();
  const location = useLocation();
  const navigate = useNavigate();
  const prefillCompanyId = (location.state as { prefillCompanyId?: string } | null)?.prefillCompanyId ?? null;

  return (
    <TeamTab
      companies={companies}
      initialCompanyId={prefillCompanyId}
      onConsumeInitial={() => {
        // Clear the one-shot state so a later back/forward through history
        // doesn't re-open the editor.
        navigate(location.pathname, { replace: true, state: null });
      }}
    />
  );
}
