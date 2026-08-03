import { useNavigate } from "react-router-dom";
import { useLeads } from "../../../lib/requests";
import { useCompanies, useCategoriesWithCounts } from "../../../lib/catalog";
import { AdminOverview } from "../OverviewTab";

export default function OverviewPage() {
  const navigate = useNavigate();
  const leads = useLeads();
  const companies = useCompanies();
  const categories = useCategoriesWithCounts();

  return (
    <AdminOverview
      leads={leads}
      companies={companies}
      categoriesCount={categories.length}
      onOpenLead={(lead) => navigate("/admin/leads", { state: { lead } })}
      onViewAllLeads={() => navigate("/admin/leads")}
      onGoSettings={() => navigate("/admin/settings")}
    />
  );
}
