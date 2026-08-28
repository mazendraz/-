import type { ApiCustomerNotificationPreferences, ApiCustomerNotificationsResponse } from "@alassema/core";
import { apiGet, apiPatch, apiPost } from "./api";

/** This account's notification center: latest rows + unread count. */
export function fetchNotifications(): Promise<ApiCustomerNotificationsResponse> {
  return apiGet<ApiCustomerNotificationsResponse>("/customer/notifications");
}

export function markNotificationRead(id: string): Promise<void> {
  return apiPatch(`/customer/notifications/${id}`, {});
}

export function markAllNotificationsRead(): Promise<void> {
  return apiPost("/customer/notifications/read-all", {});
}

export function fetchNotificationPreferences(): Promise<ApiCustomerNotificationPreferences> {
  return apiGet<ApiCustomerNotificationPreferences>("/customer/notification-preferences");
}

export function updateNotificationPreferences(
  patch: Partial<ApiCustomerNotificationPreferences>,
): Promise<ApiCustomerNotificationPreferences> {
  return apiPatch<ApiCustomerNotificationPreferences>("/customer/notification-preferences", patch);
}
