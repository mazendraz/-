import { describe, expect, it } from "vitest";
import {
  buildAdminAlertEmail,
  buildFromTemplate,
  buildNewLeadEmail,
  notifyNewLead,
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
