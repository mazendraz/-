import type { ApiMessage, ApiThreadSummary } from "@alassema/core";
import { apiGet, apiPost } from "@alassema/mobile-shared";

interface ThreadResult {
  conversation: { id: string; refNumber?: string; companyName?: string };
  messages: ApiMessage[];
}

export function fetchThread(leadId: string, after?: number): Promise<ThreadResult> {
  const qs = after ? `?after=${after}` : "";
  return apiGet<ThreadResult>(`/customer/leads/${leadId}/messages${qs}`);
}

export function sendMessage(leadId: string, body: string): Promise<ApiMessage> {
  return apiPost<ApiMessage>(`/customer/leads/${leadId}/messages`, { body });
}

/** One line per thread this account owns — built and verified server-side;
 *  not yet consumed by a dedicated list screen (see chat/[leadId].tsx's
 *  module comment on why the Requests tab is the entry point for now). */
export function fetchThreadSummaries(): Promise<ApiThreadSummary[]> {
  return apiGet<ApiThreadSummary[]>("/customer/chat/summaries");
}
