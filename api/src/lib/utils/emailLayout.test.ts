import { describe, it, expect } from "vitest";
import {
  emailButton,
  emailDataTable,
  emailHeading,
  emailMuted,
  emailNotice,
  emailParagraph,
  escapeHtml,
  renderEmailDocument,
} from "@/lib/utils/emailLayout";

const LOGO = "https://alassema.com/email-logo.png";
const FOOTER = {
  siteName: "العاصمة",
  siteUrl: "https://alassema.com",
  supportEmail: "support@alassema.com",
  phone: "+20 100 123 4567",
  address: "العاصمة الإدارية الجديدة",
};

describe("escaping", () => {
  it("escapes the four dangerous characters", () => {
    expect(escapeHtml(`<b> & "x"`)).toBe("&lt;b&gt; &amp; &quot;x&quot;");
  });

  // The blocks that take plain text (rather than pre-built HTML) must escape
  // it themselves — a company name, a device name and a campaign title all
  // reach these from user- or admin-controlled data.
  it("escapes text handed to the heading, the data table and the button", () => {
    expect(emailHeading("<script>x</script>")).toContain("&lt;script&gt;");
    expect(emailHeading("<script>x</script>")).not.toContain("<script>");

    const table = emailDataTable([["<b>k</b>", "<i>v</i>"]]);
    expect(table).toContain("&lt;b&gt;k&lt;/b&gt;");
    expect(table).not.toContain("<b>k</b>");

    const button = emailButton("<b>go</b>", 'https://x.test/?a="1"');
    expect(button).toContain("&lt;b&gt;go&lt;/b&gt;");
    expect(button).toContain("https://x.test/?a=&quot;1&quot;");
  });

  // emailParagraph/emailMuted/emailNotice take HTML on purpose (callers keep
  // their <strong>), so they must NOT double-escape what they're handed.
  it("passes HTML blocks through untouched", () => {
    expect(emailParagraph("<strong>hi</strong>")).toContain("<strong>hi</strong>");
    expect(emailMuted("<strong>hi</strong>")).toContain("<strong>hi</strong>");
    expect(emailNotice("<strong>hi</strong>")).toContain("<strong>hi</strong>");
  });
});

describe("direction", () => {
  it("aligns right and uses the Arabic stack in rtl, left and Latin in ltr", () => {
    expect(emailHeading("x", "rtl")).toContain("text-align:right");
    expect(emailHeading("x", "rtl")).toContain("Cairo");
    expect(emailHeading("x", "ltr")).toContain("text-align:left");
    expect(emailHeading("x", "ltr")).not.toContain("Cairo");
  });

  it("puts the data-table value on the far side of the label", () => {
    expect(emailDataTable([["k", "v"]], "rtl")).toContain("text-align:left");
    expect(emailDataTable([["k", "v"]], "ltr")).toContain("text-align:right");
  });
});

describe("the CTA button", () => {
  it("ships an Outlook VML fallback alongside the plain anchor", () => {
    const html = emailButton("اضغط", "https://alassema.com/requests");
    expect(html).toContain("<!--[if mso]>");
    expect(html).toContain("v:roundrect");
    // Outlook must see the VML and NOT the anchor; everyone else the reverse.
    expect(html).toContain("mso-hide:all");
    expect(html).toContain('<a href="https://alassema.com/requests"');
  });
});

describe("renderEmailDocument", () => {
  const doc = renderEmailDocument({
    bodyHtml: "<p>BODY</p>",
    logoUrl: LOGO,
    dir: "rtl",
    preheader: "سطر المعاينة",
    footer: FOOTER,
  });

  it("is a complete document, not a fragment", () => {
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain("</html>");
    expect(doc).toContain('<meta charset="utf-8" />');
  });

  it("carries the logo and links it back to the site", () => {
    expect(doc).toContain(`src="${LOGO}"`);
    expect(doc).toContain('alt="العاصمة"');
    expect(doc).toContain(`<a href="${FOOTER.siteUrl}"`);
  });

  it("sets the direction on the document, the body and the card", () => {
    expect(doc).toContain('<html dir="rtl" lang="ar"');
    expect(doc).toContain('<body dir="rtl"');
  });

  it("opts out of client dark-mode inversion", () => {
    // The brand mark is black line art on white: an inverted card hides it.
    expect(doc).toContain('name="color-scheme" content="light only"');
    expect(doc).toContain('name="supported-color-schemes" content="light only"');
  });

  it("emits a hidden preheader for the inbox preview line", () => {
    expect(doc).toContain("سطر المعاينة");
    expect(doc).toContain("display:none;max-height:0");
  });

  it("prints the contact details in the footer", () => {
    expect(doc).toContain("mailto:support@alassema.com");
    expect(doc).toContain("+20 100 123 4567");
    expect(doc).toContain("العاصمة الإدارية الجديدة");
    expect(doc).toContain("كل الحقوق محفوظة");
  });

  it("drops the rows it has no value for instead of printing them blank", () => {
    const bare = renderEmailDocument({
      bodyHtml: "<p>BODY</p>",
      logoUrl: LOGO,
      dir: "rtl",
      footer: { siteName: "العاصمة", siteUrl: "https://alassema.com" },
    });
    expect(bare).not.toContain("mailto:");
    // The site URL row is the one that always survives.
    expect(bare).toContain("alassema.com");
  });

  it("places footerExtraHtml (the unsubscribe line) inside the footer block", () => {
    const withUnsub = renderEmailDocument({
      bodyHtml: "<p>BODY</p>",
      logoUrl: LOGO,
      dir: "rtl",
      footer: FOOTER,
      footerExtraHtml: '<p id="unsub">إلغاء الاشتراك</p>',
    });
    // After the body, before the copyright — i.e. in the footer, not the body.
    expect(withUnsub.indexOf("BODY")).toBeLessThan(withUnsub.indexOf('id="unsub"'));
    expect(withUnsub.indexOf('id="unsub"')).toBeLessThan(withUnsub.indexOf("كل الحقوق محفوظة"));
  });

  it("lays out on tables so Outlook honours the 600px width", () => {
    expect(doc).toContain('width="600"');
    expect(doc).toContain('role="presentation"');
  });
});
