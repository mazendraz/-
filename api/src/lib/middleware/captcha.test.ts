import { describe, expect, it } from "vitest";
import { captchaEnabled, verifyCaptcha } from "@/lib/middleware/captcha";

// No CAPTCHA secret is set in the test env, so verification is a no-op and the
// helper reports itself disabled. (The configured paths hit external verifiers
// and are covered by integration/manual testing.)
describe("captcha (unconfigured)", () => {
  it("reports disabled when no secret is set", () => {
    expect(captchaEnabled()).toBe(false);
  });

  it("passes through without a token when disabled", async () => {
    await expect(verifyCaptcha(undefined)).resolves.toBeUndefined();
    await expect(verifyCaptcha("anything", "1.2.3.4")).resolves.toBeUndefined();
  });
});
