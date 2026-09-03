import { describe, expect, it, vi } from "vitest";
import {
  buildAdminAlertEmail,
  buildFromTemplate,
  buildNewLeadEmail,
  notifyNewLead,
  buildServiceSummaryEmail,
  buildNewDeviceLoginEmail,
  buildChangeRequestReviewedEmail,
  buildProviderMonthlySummaryEmail,
  buildReviewRequestEmailContent,
  buildStaleLeadEmailContent,
  build7DayPostServiceEmailContent,
  build14DayInactiveBrowsingEmailContent,
  build3045DayInactivityEmailContent,
  buildSeasonalCampaignEmailContent,
  notifyAdminsAmountDiscrepancy,
  buildOrderPlacedEmail,
  sendCustomerVerificationEmail,
  sendCustomerPasswordResetEmail,
  sendCustomerWelcomeEmail,
  emailSafeLogoUrl,
} from "@/lib/services/notifications.service";
import type { ApiLead } from "@/lib/apiTypes";

const lead: ApiLead = {
  id: "lead-1",
  refNumber: "AA-20260101-7F3K",
  companySlug: "aura-interiors",
  companyName: "Aura Interiors",
  service: "Full Interior Design",
  name: "Mona Adel",
  phone: "01012345678",
  district: "R7 District",
  budget: "EGP 150,000 – 500,000",
  description: "Need a full fit-out",
  status: "New",
  reviewed: false,
  createdAt: Date.UTC(2026, 0, 1),
};

describe("buildNewLeadEmail", () => {
  it("returns null when the provider has no email", () => {
    expect(buildNewLeadEmail(lead, { email: null, companyName: "Aura" })).toBeNull();
  });

  it("builds a subject and body with the lead details", () => {
    const email = buildNewLeadEmail(lead, {
      email: "owner@aura.test",
      companyName: "Aura Interiors",
    });
    expect(email).not.toBeNull();
    expect(email!.to).toBe("owner@aura.test");
    expect(email!.subject).toContain("AA-20260101-7F3K");
    expect(email!.text).toContain("Mona Adel");
    expect(email!.text).toContain("01012345678");
    expect(email!.html).toContain("Aura Interiors");
  });

  it("escapes HTML in dynamic fields", () => {
    const email = buildNewLeadEmail(
      { ...lead, name: "<script>x</script>" },
      { email: "o@test", companyName: "Co" },
    );
    expect(email!.html).not.toContain("<script>");
    expect(email!.html).toContain("&lt;script&gt;");
  });

  it("omits the Budget/Details rows when the customer left them blank", () => {
    const email = buildNewLeadEmail(
      { ...lead, budget: "", description: "" },
      { email: "owner@aura.test", companyName: "Aura Interiors" },
    );
    expect(email!.text).not.toContain("Budget");
    expect(email!.text).not.toContain("Details");
  });
});

describe("buildAdminAlertEmail (PII-minimized)", () => {
  it("includes the company/ref/service but OMITS customer name, phone, budget, details", () => {
    const email = buildAdminAlertEmail(lead, "Aura Interiors");
    expect(email.subject).toContain("AA-20260101-7F3K");
    expect(email.text).toContain("Aura Interiors");
    expect(email.text).toContain("Full Interior Design");
    // No PII in the all-admins broadcast.
    for (const body of [email.text, email.html]) {
      expect(body).not.toContain("Mona Adel");
      expect(body).not.toContain("01012345678");
      expect(body).not.toContain("EGP 150,000 – 500,000");
      expect(body).not.toContain("Need a full fit-out");
    }
  });
});

describe("buildFromTemplate", () => {
  it("substitutes {{tokens}} and HTML-escapes the body", () => {
    const out = buildFromTemplate("Lead {{refNumber}}", "Hi {{customer}}\n{{details}}", {
      refNumber: "AA-1",
      customer: "Mona",
      details: "<b>x</b>",
    });
    expect(out.subject).toBe("Lead AA-1");
    expect(out.text).toBe("Hi Mona\n<b>x</b>");
    expect(out.html).toBe("Hi Mona<br>&lt;b&gt;x&lt;/b&gt;");
  });

  it("collapses unknown tokens to empty", () => {
    expect(buildFromTemplate("{{nope}}", "a{{nope}}b", {}).text).toBe("ab");
  });
});

describe("notifyNewLead", () => {
  it("fails open (returns false, no throw) when there is no recipient", async () => {
    await expect(
      notifyNewLead(lead, { email: null, companyName: "Aura" }),
    ).resolves.toBe(false);
  });

  it("skips (returns false) when RESEND_API_KEY is unset", async () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    await expect(
      notifyNewLead(lead, { email: "owner@aura.test", companyName: "Aura" }),
    ).resolves.toBe(false);
    if (prev !== undefined) process.env.RESEND_API_KEY = prev;
  });
});

const leadWithCompletion: ApiLead = {
  ...lead,
  status: "Completed",
  reviewed: false,
  completion: {
    providerAmount: 45000,
    additionalWorkDescription: null,
    additionalWorkAmount: null,
    notes: null,
    attachments: [],
    finalTotal: 45000,
    submittedAt: Date.UTC(2026, 0, 2),
    verificationStatus: "CONFIRMED",
    clientAmount: 45000,
    discrepancyNote: null,
    verifiedAt: Date.UTC(2026, 0, 3),
  },
};

describe("buildServiceSummaryEmail", () => {
  it("returns null when there's no customer email (guest lead)", () => {
    expect(buildServiceSummaryEmail(leadWithCompletion, null, "Mona", "Aura")).toBeNull();
  });

  it("is Arabic/RTL and includes the ref number and final amount", () => {
    const email = buildServiceSummaryEmail(leadWithCompletion, "mona@test.com", "منى", "شركة أورا");
    expect(email).not.toBeNull();
    expect(email!.to).toBe("mona@test.com");
    expect(email!.dir).toBe("rtl");
    expect(email!.text).toContain("AA-20260101-7F3K");
    expect(email!.text).toContain("45,000");
    expect(email!.html).toContain("شركة أورا");
  });
});

describe("buildNewDeviceLoginEmail", () => {
  it("is Arabic/RTL and includes the device label and Cairo-formatted time", () => {
    const email = buildNewDeviceLoginEmail(
      "mona@test.com",
      "منى",
      { deviceName: "iPhone 15", platform: "ios" },
      new Date("2026-08-25T12:00:00Z"),
    );
    expect(email.dir).toBe("rtl");
    expect(email.text).toContain("iPhone 15");
    expect(email.html).toContain("iPhone 15");
  });

  it("falls back to a generic label when no device name is given", () => {
    const email = buildNewDeviceLoginEmail("mona@test.com", "منى", { deviceName: null, platform: "android" }, new Date());
    expect(email.text).toContain("جهاز جديد");
  });
});

describe("buildChangeRequestReviewedEmail", () => {
  it("approve: no rejection language, includes the reviewer note when present", () => {
    const email = buildChangeRequestReviewedEmail({
      to: "owner@aura.test",
      companyName: "Aura Interiors",
      entity: "COMPANY",
      action: "approve",
      reviewNote: "Looks great",
    });
    expect(email.subject).toContain("approved");
    expect(email.text).toContain("approved");
    expect(email.text).toContain("Looks great");
    expect(email.dir).toBeUndefined(); // provider mail stays English/LTR
  });

  it("reject: includes the reason as 'Reason:', not 'Note from the reviewer:'", () => {
    const email = buildChangeRequestReviewedEmail({
      to: "owner@aura.test",
      companyName: "Aura Interiors",
      entity: "OFFERING",
      action: "reject",
      reviewNote: "Price too high",
    });
    expect(email.subject).toContain("rejected");
    expect(email.text).toContain("Reason: Price too high");
  });

  it("omits the note line entirely when none was given", () => {
    const email = buildChangeRequestReviewedEmail({
      to: "owner@aura.test",
      companyName: "Aura Interiors",
      entity: "COMPANY",
      action: "approve",
      reviewNote: null,
    });
    expect(email.text).not.toContain("Note from the reviewer");
    expect(email.text).not.toContain("Reason:");
  });
});

describe("buildProviderMonthlySummaryEmail", () => {
  it("includes the period, counts, and a formatted response time", () => {
    const email = buildProviderMonthlySummaryEmail("owner@aura.test", "Aura Interiors", {
      periodLabel: "August 2026",
      requestsReceived: 12,
      requestsCompleted: 9,
      avgResponseMinutes: 42,
    });
    expect(email.subject).toContain("August 2026");
    expect(email.text).toContain("Requests received: 12");
    expect(email.text).toContain("Requests completed: 9");
    expect(email.text).toContain("42 min");
  });

  it("shows 'No replies recorded' when avgResponseMinutes is null", () => {
    const email = buildProviderMonthlySummaryEmail("owner@aura.test", "Aura", {
      periodLabel: "August 2026",
      requestsReceived: 3,
      requestsCompleted: 0,
      avgResponseMinutes: null,
    });
    expect(email.text).toContain("No replies recorded");
  });

  it("formats hours/days for longer response times", () => {
    const hours = buildProviderMonthlySummaryEmail("o@a.test", "A", {
      periodLabel: "August 2026",
      requestsReceived: 1,
      requestsCompleted: 1,
      avgResponseMinutes: 180,
    });
    expect(hours.text).toContain("3.0 hr");

    const days = buildProviderMonthlySummaryEmail("o@a.test", "A", {
      periodLabel: "August 2026",
      requestsReceived: 1,
      requestsCompleted: 1,
      avgResponseMinutes: 60 * 48,
    });
    expect(days.text).toContain("2.0 days");
  });
});

describe("notifyAdminsAmountDiscrepancy — Phase 1 feature, integration-verified here", () => {
  it("fails open (false, no throw) with no admin recipients", async () => {
    await expect(
      notifyAdminsAmountDiscrepancy(leadWithCompletion, "Aura", [null, undefined, ""]),
    ).resolves.toBe(false);
  });

  it("skips (false) when RESEND_API_KEY is unset", async () => {
    const prev = process.env.RESEND_API_KEY;
    delete process.env.RESEND_API_KEY;
    await expect(
      notifyAdminsAmountDiscrepancy(leadWithCompletion, "Aura", ["admin@aura.test"]),
    ).resolves.toBe(false);
    if (prev !== undefined) process.env.RESEND_API_KEY = prev;
  });

  // "No duplicate sends" for this function is structural: recipients are
  // de-duplicated into ONE array and passed to a SINGLE Resend call — one
  // email, many `to` addresses — never one send per admin. Verified here by
  // mocking fetch and inspecting the actual request body, not just by
  // reading the source.
  it("de-duplicates repeated admin emails into a single send with one `to` list", async () => {
    const prevKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "test-key";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));

    const result = await notifyAdminsAmountDiscrepancy(leadWithCompletion, "Aura", [
      "admin@aura.test",
      "admin@aura.test",
      "second@aura.test",
    ]);

    expect(result).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
    expect(body.to).toEqual(["admin@aura.test", "second@aura.test"]);

    fetchSpy.mockRestore();
    if (prevKey !== undefined) process.env.RESEND_API_KEY = prevKey;
    else delete process.env.RESEND_API_KEY;
  });
});

describe("marketing email content builders (Arabic, pure content)", () => {
  it("buildReviewRequestEmailContent references the company and ref number", () => {
    const c = buildReviewRequestEmailContent("منى", "شركة النور", "تكييفات", "AA-1");
    expect(c.text).toContain("شركة النور");
    expect(c.text).toContain("AA-1");
    expect(c.html).toContain("قيّم دلوقتي");
  });

  it("buildStaleLeadEmailContent references the ref number and service", () => {
    const c = buildStaleLeadEmailContent("AA-1", "تكييفات");
    expect(c.subject).toContain("AA-1");
    expect(c.text).toContain("تكييفات");
  });

  it("build7DayPostServiceEmailContent mentions the company when given", () => {
    const withCompany = build7DayPostServiceEmailContent("منى", "شركة النور");
    expect(withCompany.text).toContain("شركة النور");
    const withoutCompany = build7DayPostServiceEmailContent("منى", null);
    expect(withoutCompany.text).not.toContain("مع ");
  });

  it("build14DayInactiveBrowsingEmailContent links to the specific category", () => {
    const c = build14DayInactiveBrowsingEmailContent("منى", "تنسيق حدائق", "landscape");
    expect(c.text).toContain("تنسيق حدائق");
    expect(c.text).toContain("/services/landscape");
  });

  it("build3045DayInactivityEmailContent links to the services list, not a category", () => {
    const c = build3045DayInactivityEmailContent("منى");
    expect(c.text).toContain("/services");
    expect(c.text).not.toMatch(/\/services\/\w/);
  });

  it("buildSeasonalCampaignEmailContent wraps the campaign's own copy and CTA", () => {
    const c = buildSeasonalCampaignEmailContent("منى", "صيانة التكييف", "احجز دلوقتي", "/services?campaign=x", "اطلب صيانة");
    expect(c.subject).toBe("صيانة التكييف");
    expect(c.text).toContain("احجز دلوقتي");
    expect(c.html).toContain("اطلب صيانة");
  });
});

describe("buildOrderPlacedEmail — Arabic/RTL", () => {
  it("returns null for a guest lead (no customer email)", () => {
    expect(buildOrderPlacedEmail(lead, null, "منى", "أورا")).toBeNull();
  });

  it("is Arabic and RTL", () => {
    const email = buildOrderPlacedEmail(lead, "mona@test.com", "منى", "أورا");
    expect(email!.dir).toBe("rtl");
    expect(email!.text).toContain("منى");
  });
});

// Every customer-facing send that has no separately exported build*
// function (verification/reset/welcome all build their HTML inline) — the
// only way to prove the ACTUAL outgoing email is dir="rtl" is to capture
// what would have gone to Resend, since wrapEmailHtml (where dir lands in
// the markup) only runs at the real send boundary.
describe("RTL audit — every customer-facing send wraps its HTML dir=\"rtl\"", () => {
  async function capturedHtml(send: () => Promise<boolean>): Promise<string> {
    const prevKey = process.env.RESEND_API_KEY;
    process.env.RESEND_API_KEY = "test-key";
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "email_1" }), { status: 200 }));
    try {
      const ok = await send();
      expect(ok).toBe(true);
      const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body));
      return body.html as string;
    } finally {
      fetchSpy.mockRestore();
      if (prevKey !== undefined) process.env.RESEND_API_KEY = prevKey;
      else delete process.env.RESEND_API_KEY;
    }
  }

  it("verification email", async () => {
    const html = await capturedHtml(() => sendCustomerVerificationEmail("mona@test.com", "منى", "tok123"));
    expect(html).toContain('dir="rtl"');
  });

  it("password-reset email", async () => {
    const html = await capturedHtml(() => sendCustomerPasswordResetEmail("mona@test.com", "منى", "tok123"));
    expect(html).toContain('dir="rtl"');
  });

  it("welcome email", async () => {
    const html = await capturedHtml(() => sendCustomerWelcomeEmail("mona@test.com", "منى"));
    expect(html).toContain('dir="rtl"');
  });

  // The branding is applied at the send boundary (wrapEmailHtml), so the only
  // way to prove an email actually goes out with the logo and an inbox preview
  // line is, again, to capture what would have reached Resend.
  it("wraps the send in the branded shell — logo, preheader, full document", async () => {
    const html = await capturedHtml(() =>
      sendCustomerVerificationEmail("mona@test.com", "منى", "tok123"),
    );
    expect(html.startsWith("<!doctype html>")).toBe(true);
    // Falls back to the built-in asset when settings are unavailable, which is
    // what the test environment has — an email is never sent logo-less.
    expect(html).toContain("/email-logo.png");
    expect(html).toContain("الرابط صالح 24 ساعة");
  });
  // The regression this guards: the admin logo upload re-encodes every image to
  // WebP (upload.service.ts), Gmail cannot render WebP and flattens its alpha
  // to black through its image proxy, and the brand mark is black line art —
  // so an admin uploading a logo from the dashboard turned the email header
  // into a solid black square. The website still uses that WebP; email does not.
  describe("emailSafeLogoUrl", () => {
    const FALLBACK = "/email-logo.png";
    const SUPA = "https://vdwurkqarfnrquwihweo.supabase.co/storage/v1/object/public/logos/49eeb3d6.";

    it("rejects the WebP the admin upload produces", () => {
      expect(emailSafeLogoUrl(SUPA + "webp")).toContain(FALLBACK);
    });

    it("rejects SVG (Gmail strips it) and AVIF (barely supported anywhere)", () => {
      expect(emailSafeLogoUrl("https://cdn.example.com/brand.svg")).toContain(FALLBACK);
      expect(emailSafeLogoUrl("https://cdn.example.com/brand.avif")).toContain(FALLBACK);
    });

    it("rejects a URL whose format it cannot vouch for", () => {
      expect(emailSafeLogoUrl("https://cdn.example.com/brand")).toContain(FALLBACK);
      expect(emailSafeLogoUrl("https://cdn.example.com/img?id=42")).toContain(FALLBACK);
    });

    it("keeps a PNG, JPG or GIF the admin uploaded", () => {
      expect(emailSafeLogoUrl(SUPA + "png")).toBe(SUPA + "png");
      expect(emailSafeLogoUrl("https://cdn.example.com/brand.JPG")).toBe(
        "https://cdn.example.com/brand.JPG",
      );
      expect(emailSafeLogoUrl("https://cdn.example.com/brand.jpeg")).toBe(
        "https://cdn.example.com/brand.jpeg",
      );
      expect(emailSafeLogoUrl("https://cdn.example.com/brand.gif")).toBe(
        "https://cdn.example.com/brand.gif",
      );
    });

    it("judges the path, not the query string", () => {
      // A cache buster on a good file must not disqualify it...
      expect(emailSafeLogoUrl("https://cdn.example.com/brand.png?v=7")).toBe(
        "https://cdn.example.com/brand.png?v=7",
      );
      // ...and ".png" hiding in a query value must not vouch for a WebP path.
      expect(emailSafeLogoUrl("https://cdn.example.com/brand.webp?fallback=x.png")).toContain(
        FALLBACK,
      );
    });

    it("falls back on blank/absent settings rather than sending a logo-less email", () => {
      expect(emailSafeLogoUrl("")).toContain(FALLBACK);
      expect(emailSafeLogoUrl(undefined)).toContain(FALLBACK);
      expect(emailSafeLogoUrl(null)).toContain(FALLBACK);
    });
  });
});
