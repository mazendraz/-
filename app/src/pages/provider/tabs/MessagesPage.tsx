import ProviderChat from "../../../components/ProviderChat";

/** The provider's customer conversations. Its own route/chunk since DM-02 —
 *  the chat client no longer ships with the rest of the dashboard. */
export default function MessagesPage() {
  return <ProviderChat />;
}
