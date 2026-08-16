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
  SESSION_COOKIE,
  sessionCookieOptions,
  type CustomerAuthUser,
} from "@/lib/auth";
import * as sessions from "@/lib/services/customerSession.service";
import type { ApiCustomerAuthResponse } from "@/lib/apiTypes";

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
  const token = await signCustomerToken({ sub: customer.id });

  const body: ApiCustomerAuthResponse = { token, customer, outcome };

  if (device) {
    const issued = await sessions.issue(customer.id, device);
    body.refreshToken = issued.refreshToken;
  }

  const res = ok(body);
  // Set regardless: a mobile client has no cookie jar and simply ignores it,
  // while the website depends on it entirely.
  res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
  return res;
}
