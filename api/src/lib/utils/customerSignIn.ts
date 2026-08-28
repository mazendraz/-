/**
 * The shared tail of every customer sign-in route.
 *
 * Google, password login and email verification all end the same way: mint an
 * access token, optionally open a device session, set the cookie, answer. Three
 * copies of that drift — and the thing they would drift on is which clients get
 * a refresh token, which is a security decision, not a formatting one.
 */
import type { NextResponse } from "next/server";
import { ok } from "@/lib/utils/response";
import {
  signCustomerToken,
  CUSTOMER_SESSION_COOKIE,
  sessionCookieOptions,
  type CustomerAuthUser,
} from "@/lib/auth";
import * as sessions from "@/lib/services/customerSession.service";
import type { ApiCustomerAuthResponse } from "@/lib/apiTypes";
import { notifyCustomerNewDeviceLogin } from "@/lib/services/notifications.service";
import { runAfterResponse } from "@/lib/utils/afterResponse";

export interface DevicePayload {
  deviceName?: string;
  platform?: "ios" | "android";
}

/**
 * Build the signed-in response.
 *
 * A device session — and therefore a refresh token — is created ONLY when the
 * caller sent `device`. That is how a mobile client asks for one, and how the
 * website avoids being handed a 60-day credential it would have to keep in
 * localStorage where XSS can read it. The cookie it already gets is httpOnly.
 */
export async function customerSignInResponse(
  customer: CustomerAuthUser,
  outcome: ApiCustomerAuthResponse["outcome"],
  device?: DevicePayload,
): Promise<NextResponse> {
  // Minted AFTER the device session below, when there is one, so it can carry
  // that session's id — see signCustomerToken's `sid`. Ordering matters: a
  // token signed before the session exists has nothing to bind to, and
  // "revoke this device" would then only reach the refresh token.
  let token: string;

  const body = {} as ApiCustomerAuthResponse;

  if (device) {
    // "New device" only means something once there's a device to compare
    // against — check BEFORE issuing, since issue() always inserts a fresh
    // CustomerSession row and would otherwise make every login look "new".
    // Skipped for a brand-new account (outcome "created"): its first device
    // isn't suspicious, it's just the first one, and the welcome email
    // already covers that moment — two security-flavored emails for one
    // signup would read as noise, not care.
    const isNewDevice =
      outcome !== "created" &&
      device.deviceName != null &&
      (await sessions.hasSeenDevice(customer.id, device)) === false;

    const issued = await sessions.issue(customer.id, device);
    body.refreshToken = issued.refreshToken;
    token = await signCustomerToken({ sub: customer.id, sid: issued.sessionId });

    if (isNewDevice) {
      runAfterResponse(() =>
        notifyCustomerNewDeviceLogin(customer.email, customer.name, {
          deviceName: device.deviceName ?? null,
          platform: device.platform ?? null,
        }),
      );
    }
  } else {
    // The website: no device session to bind to, so no `sid`. Its revocation
    // story is the account-wide floor (CustomerUser.tokensValidFrom), which a
    // password reset and "sign out everywhere" both move.
    token = await signCustomerToken({ sub: customer.id });
  }

  body.token = token;
  body.customer = customer;
  body.outcome = outcome;

  const res = ok(body);
  // Set regardless: a mobile client has no cookie jar and simply ignores it,
  // while the website depends on it entirely.
  //
  // Its own cookie NAME, not the staff one — see CUSTOMER_SESSION_COOKIE. While
  // the two shared a name, signing in here evicted an admin's dashboard session
  // (and was evicted BY it) in the same browser.
  res.cookies.set(CUSTOMER_SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
