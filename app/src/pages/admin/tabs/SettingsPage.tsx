import { useLeads } from "../../../lib/requests";
import { SettingsTab } from "../SettingsTab";

export default function SettingsPage() {
  const leads = useLeads();
  return <SettingsTab leadCount={leads.length} />;
}
