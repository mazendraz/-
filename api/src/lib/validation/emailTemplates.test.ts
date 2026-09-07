// The regression this file exists for: `email_provider_subject` was "what" and
// `email_provider_body` was "fuafjasfja" in production. Those two rows override
// the built-in provider email completely, so every provider's only notification
// of every lead was two nonsense words — no reference, no service, no customer
// name, no phone number. Validation was `text(200)` / `text(5000)`, which both
// strings pass, so nothing objected and nothing surfaced it: the emails sent
// successfully, and the only symptom was leads that went nowhere.
//
// So the tests below are not about length. They are about the tokens a lead
// notification is worthless without, and about the two silent failure modes —
// an unknown token that substitutes to nothing, and a half-filled pair the API
// ignores entirely.
import { describe, expect, it } from "vitest";
import { checkEmailTemplate, checkEmailTemplatePair } from "@alassema/core";
import { updateEmailTemplatesSchema } from "./settings";

const GOOD_PROVIDER_BODY =
  "طلب جديد {{refNumber}}\nالخدمة: {{service}}\nالعميل: {{customer}}\nالتليفون: {{phone}}";

describe("checkEmailTemplate", () => {
  it("accepts a blank field — blank means 'send the built-in email'", () => {
    expect(checkEmailTemplate("providerBody", "")).toBeNull();
    expect(checkEmailTemplate("providerBody", "   \n ")).toBeNull();
  });

  it("rejects the exact pair that shipped to production", () => {
    expect(checkEmailTemplate("providerSubject", "what")).toMatch(/refNumber/);
    expect(checkEmailTemplate("providerBody", "fuafjasfja")).toMatch(/refNumber/);
  });

  it("accepts a provider body carrying everything the provider must act on", () => {
    expect(checkEmailTemplate("providerBody", GOOD_PROVIDER_BODY)).toBeNull();
  });

  // Each of these alone makes the email unusable: without the phone number the
  // provider cannot call, without the name they don't know who, without the
  // service they don't know what, without the reference nobody can find it again.
  it.each(["refNumber", "service", "customer", "phone"])(
    "rejects a provider body missing {{%s}}",
    (token) => {
      const body = GOOD_PROVIDER_BODY.replace(`{{${token}}}`, "—");
      expect(checkEmailTemplate("providerBody", body)).toMatch(token);
    },
  );

  // The admin copy deliberately carries no customer PII (buildAdminAlertEmail),
  // so it is held to a different bar, not the same one.
  it("does not demand customer contact details in the admin body", () => {
    expect(
      checkEmailTemplate("adminBody", "طلب {{refNumber}} على {{company}} — {{service}}"),
    ).toBeNull();
  });

  it("rejects a typo'd token instead of silently substituting nothing", () => {
    // The dangerous case: this LOOKS right, passes every length check, and
    // sends an email with a blank where the reference should be.
    const typo = GOOD_PROVIDER_BODY.replace("{{refNumber}}", "{{refNumer}}");
    const problem = checkEmailTemplate("providerBody", typo);
    expect(problem).toMatch(/refNumer/);
    expect(problem).toMatch(/Unknown token/);
  });
});

describe("checkEmailTemplatePair", () => {
  it("accepts both blank (built-in email) and both filled (override)", () => {
    expect(checkEmailTemplatePair("", "")).toBeNull();
    expect(checkEmailTemplatePair("Lead {{refNumber}}", GOOD_PROVIDER_BODY)).toBeNull();
  });

  // Half a pair is the quietest failure of the three: the field saves, the admin
  // sees it persisted, and the API goes on sending the built-in email because it
  // only uses an override when BOTH halves are non-blank.
  it("rejects a subject with no body", () => {
    expect(checkEmailTemplatePair("Lead {{refNumber}}", "")?.field).toBe("body");
  });

  it("rejects a body with no subject", () => {
    expect(checkEmailTemplatePair("", GOOD_PROVIDER_BODY)?.field).toBe("subject");
  });
});

describe("updateEmailTemplatesSchema", () => {
  it("refuses the production values at the API boundary, not just in the UI", () => {
    const result = updateEmailTemplatesSchema.safeParse({
      providerSubject: "what",
      providerBody: "fuafjasfja",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.map((i) => i.path[0]).sort()).toEqual([
        "providerBody",
        "providerSubject",
      ]);
    }
  });

  it("accepts a valid override", () => {
    expect(
      updateEmailTemplatesSchema.safeParse({
        providerSubject: "طلب جديد {{refNumber}}",
        providerBody: GOOD_PROVIDER_BODY,
      }).success,
    ).toBe(true);
  });

  it("still accepts clearing a field back to the built-in email", () => {
    expect(
      updateEmailTemplatesSchema.safeParse({ providerSubject: "", providerBody: "" }).success,
    ).toBe(true);
  });
});
