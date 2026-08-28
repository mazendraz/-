/**
 * The shared HTML shell + building blocks for every outgoing email.
 *
 * Why a module of its own: every builder in notifications.service.ts used to
 * hand-write its own `<h2 style="text-align:right">` / `<p>` / bare `<table>`,
 * which meant (a) the same inline styles copy-pasted a dozen times, (b) any
 * client without a helpful default stylesheet — Outlook's Word engine most of
 * all — rendering the mail in Times New Roman at whatever width the window
 * happened to be, and (c) no single place to change the look. Everything
 * user-visible about the frame now lives here.
 *
 * Rules this file follows, all of them forced by mail clients rather than
 * taste:
 *   - Layout is `<table>`, never flex/grid/float. Outlook renders through Word,
 *     which supports neither, and ignores `max-width` on a `<div>` — the reason
 *     the old wrapper stretched edge-to-edge on desktop Outlook.
 *   - Every style is INLINE. Gmail strips <style> blocks in a forwarded message
 *     and in some clipped views; anything that must survive is on the element.
 *     The <style> block here carries only progressive enhancement (webfont,
 *     one mobile media query) that the mail is fine without.
 *   - Colors are always stated explicitly, plus color-scheme "light only", so
 *     dark-mode clients don't invert the white card out from under a logo that
 *     is black line art.
 *   - The CTA button is a padded <a> for everyone, with a VML rectangle behind
 *     an mso-only conditional so Outlook gets a real filled button instead of a
 *     bare link.
 */

/** Brand palette — #005578 and #785a02 are the site's own (app/src/index.css). */
export const EMAIL_COLORS = {
  brand: "#005578",
  brandDark: "#00405c",
  gold: "#785a02",
  canvas: "#eef1f5",
  card: "#ffffff",
  border: "#e3e8ee",
  hairline: "#eef1f4",
  text: "#16202b",
  muted: "#6b7278",
  faint: "#9aa0a6",
  danger: "#a3261f",
  dangerBg: "#fdf3f2",
  dangerBorder: "#f2d6d3",
} as const;

export type EmailDir = "ltr" | "rtl";

const FONT_RTL = "'Cairo','Segoe UI',Tahoma,Arial,sans-serif";
const FONT_LTR = "'Inter','Segoe UI',Helvetica,Arial,sans-serif";

function fontFor(dir: EmailDir): string {
  return dir === "rtl" ? FONT_RTL : FONT_LTR;
}

function alignFor(dir: EmailDir): "right" | "left" {
  return dir === "rtl" ? "right" : "left";
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Content blocks ────────────────────────────────────────────────────────────
// Each returns a self-contained, fully-inlined fragment meant to sit in the
// shell's content cell. `text` arguments are escaped here; the ones that take
// pre-built HTML say so in the parameter name (…Html / html).

/** The one headline at the top of an email's body. */
export function emailHeading(text: string, dir: EmailDir = "rtl"): string {
  return (
    `<h1 style="margin:0 0 16px;font-family:${fontFor(dir)};font-size:22px;line-height:1.4;` +
    `mso-line-height-rule:exactly;font-weight:700;color:${EMAIL_COLORS.text};text-align:${alignFor(dir)}">` +
    `${escapeHtml(text)}</h1>`
  );
}

/** A body paragraph. Takes HTML so callers can keep their <strong> emphasis —
 *  every value interpolated into it must already be escaped by the caller. */
export function emailParagraph(html: string, dir: EmailDir = "rtl"): string {
  return (
    `<p style="margin:0 0 14px;font-family:${fontFor(dir)};font-size:16px;line-height:1.75;` +
    `mso-line-height-rule:exactly;color:${EMAIL_COLORS.text};text-align:${alignFor(dir)}">${html}</p>`
  );
}

/** Small print — expiry notes, "ignore this email if it wasn't you", etc. */
export function emailMuted(html: string, dir: EmailDir = "rtl"): string {
  return (
    `<p style="margin:0 0 10px;font-family:${fontFor(dir)};font-size:13px;line-height:1.7;` +
    `mso-line-height-rule:exactly;color:${EMAIL_COLORS.muted};text-align:${alignFor(dir)}">${html}</p>`
  );
}

/**
 * The primary call to action. Outlook's Word engine drops padding on an inline
 * <a>, which would leave a naked blue link where the button should be — hence
 * the VML roundrect in an mso-only conditional, with the plain <a> hidden from
 * Outlook alone (`mso-hide:all`) so no client ever shows both.
 */
export function emailButton(label: string, url: string, dir: EmailDir = "rtl"): string {
  const href = escapeHtml(url);
  const text = escapeHtml(label);
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" ` +
    `style="margin:22px auto 18px"><tr><td align="center" bgcolor="${EMAIL_COLORS.brand}" ` +
    `style="border-radius:10px">` +
    `<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" ` +
    `href="${href}" style="height:46px;v-text-anchor:middle;width:260px" arcsize="22%" strokecolor="${EMAIL_COLORS.brand}" ` +
    `fillcolor="${EMAIL_COLORS.brand}"><w:anchorlock/><center style="color:#ffffff;font-family:Arial,sans-serif;` +
    `font-size:16px;font-weight:bold">${text}</center></v:roundrect><![endif]-->` +
    `<!--[if !mso]><!-- --><a href="${href}" style="display:inline-block;background:${EMAIL_COLORS.brand};` +
    `color:#ffffff;font-family:${fontFor(dir)};font-size:16px;font-weight:700;line-height:1;` +
    `padding:15px 34px;border-radius:10px;text-decoration:none;mso-hide:all">${text}</a><!--<![endif]-->` +
    `</td></tr></table>`
  );
}

/** A secondary text link — "browse services", "open the chat". */
export function emailLink(label: string, url: string): string {
  return (
    `<a href="${escapeHtml(url)}" style="color:${EMAIL_COLORS.brand};text-decoration:underline">` +
    `${escapeHtml(label)}</a>`
  );
}

/**
 * The label/value block used for receipts (order reference, final amount,
 * device + time). A bordered box rather than a bare <table>, because a bare one
 * inherits the client's default table styling and reads as debug output.
 */
export function emailDataTable(rows: [string, string][], dir: EmailDir = "rtl"): string {
  const align = alignFor(dir);
  const valueAlign = dir === "rtl" ? "left" : "right";
  const cells = rows
    .map(([label, value], i) => {
      const pad = i === 0 ? "0 0 10px" : "10px 0";
      const rule = i === 0 ? "" : `border-top:1px solid ${EMAIL_COLORS.hairline};`;
      return (
        `<tr>` +
        `<td style="padding:${pad};${rule}font-family:${fontFor(dir)};font-size:14px;` +
        `color:${EMAIL_COLORS.muted};text-align:${align};white-space:nowrap">${escapeHtml(label)}</td>` +
        `<td style="padding:${pad};${rule}font-family:${fontFor(dir)};font-size:15px;font-weight:700;` +
        `color:${EMAIL_COLORS.text};text-align:${valueAlign}">${escapeHtml(value)}</td>` +
        `</tr>`
      );
    })
    .join("");
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" dir="${dir}" ` +
    `style="width:100%;margin:6px 0 18px;background:#f8fafb;border:1px solid ${EMAIL_COLORS.border};` +
    `border-radius:10px;border-collapse:separate">` +
    `<tr><td style="padding:16px 18px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%">` +
    cells +
    `</table></td></tr></table>`
  );
}

/** A tinted callout — currently only the "wasn't you?" warning on the
 *  new-device email, which has to be impossible to skim past. */
export function emailNotice(html: string, dir: EmailDir = "rtl"): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" dir="${dir}" ` +
    `style="width:100%;margin:8px 0 14px;background:${EMAIL_COLORS.dangerBg};` +
    `border:1px solid ${EMAIL_COLORS.dangerBorder};border-radius:10px;border-collapse:separate">` +
    `<tr><td style="padding:14px 16px;font-family:${fontFor(dir)};font-size:14px;line-height:1.7;` +
    `mso-line-height-rule:exactly;color:${EMAIL_COLORS.danger};text-align:${alignFor(dir)}">${html}</td></tr></table>`
  );
}

// ── The shell ─────────────────────────────────────────────────────────────────

/** Everything the footer prints. All optional but `siteName`/`siteUrl` — an
 *  empty support email or address drops its row rather than printing a blank. */
export interface EmailFooterInfo {
  siteName: string;
  siteUrl: string;
  supportEmail?: string;
  phone?: string;
  address?: string;
}

export interface EmailShellOptions {
  bodyHtml: string;
  logoUrl: string;
  dir?: EmailDir;
  /** The grey preview line clients show next to the subject in the inbox.
   *  Without one they scrape the first words of the body, which for a
   *  logo-first email is whatever the alt text happens to be. */
  preheader?: string;
  footer?: EmailFooterInfo;
  /** Appended at the top of the footer block — the marketing unsubscribe line. */
  footerExtraHtml?: string;
}

function footerHtml(info: EmailFooterInfo, dir: EmailDir, extraHtml?: string): string {
  const font = fontFor(dir);
  const contact: string[] = [];
  if (info.supportEmail) {
    contact.push(
      `<a href="mailto:${escapeHtml(info.supportEmail)}" style="color:${EMAIL_COLORS.muted};` +
        `text-decoration:none">${escapeHtml(info.supportEmail)}</a>`,
    );
  }
  if (info.phone) contact.push(escapeHtml(info.phone));
  contact.push(
    `<a href="${escapeHtml(info.siteUrl)}" style="color:${EMAIL_COLORS.muted};text-decoration:none">` +
      `${escapeHtml(info.siteUrl.replace(/^https?:\/\//, ""))}</a>`,
  );

  return (
    `<tr><td style="padding:22px 32px 26px;background:#fbfcfd;border-top:1px solid ${EMAIL_COLORS.hairline}" ` +
    `bgcolor="#fbfcfd">` +
    (extraHtml ?? "") +
    `<p style="margin:0 0 6px;font-family:${font};font-size:13px;line-height:1.7;` +
    `color:${EMAIL_COLORS.muted};text-align:center">` +
    contact.join(' <span style="color:#c8cfd6">&middot;</span> ') +
    `</p>` +
    (info.address
      ? `<p style="margin:0 0 6px;font-family:${font};font-size:12px;line-height:1.6;` +
        `color:${EMAIL_COLORS.faint};text-align:center">${escapeHtml(info.address)}</p>`
      : "") +
    `<p style="margin:0;font-family:${font};font-size:12px;line-height:1.6;` +
    `color:${EMAIL_COLORS.faint};text-align:center">` +
    `&copy; ${new Date().getFullYear()} ${escapeHtml(info.siteName)} &mdash; ` +
    `${dir === "rtl" ? "كل الحقوق محفوظة" : "All rights reserved"}</p>` +
    `</td></tr>`
  );
}

/**
 * Wrap a body fragment in the full branded document. Returns a complete
 * `<!doctype html>` page — Resend takes the whole thing as the `html` field,
 * and a full document (rather than the bare <div> this replaced) is what lets
 * the mail carry <head> metadata: charset, viewport, the dark-mode opt-out,
 * and the webfont.
 */
export function renderEmailDocument(opts: EmailShellOptions): string {
  const dir: EmailDir = opts.dir ?? "ltr";
  const font = fontFor(dir);
  const logo = escapeHtml(opts.logoUrl);
  const siteUrl = opts.footer?.siteUrl ?? "";
  const logoAlt = escapeHtml(opts.footer?.siteName ?? "Al Assema");

  // Hidden preview line. The trailing entity run is the standard trick that
  // stops Gmail from padding the preview out with the body's first words.
  const preheader = opts.preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;` +
      `color:${EMAIL_COLORS.canvas};opacity:0">` +
      escapeHtml(opts.preheader) +
      "&#847;&zwnj;&nbsp;".repeat(60) +
      `</div>`
    : "";

  const logoImg =
    `<img src="${logo}" alt="${logoAlt}" width="132" style="display:block;width:132px;max-width:132px;` +
    `height:auto;border:0;outline:none;text-decoration:none;margin:0 auto" />`;

  return (
    `<!doctype html>` +
    `<html dir="${dir}" lang="${dir === "rtl" ? "ar" : "en"}" xmlns:v="urn:schemas-microsoft-com:vml" ` +
    `xmlns:o="urn:schemas-microsoft-com:office:office">` +
    `<head>` +
    `<meta charset="utf-8" />` +
    `<meta name="viewport" content="width=device-width,initial-scale=1" />` +
    `<meta http-equiv="X-UA-Compatible" content="IE=edge" />` +
    `<meta name="x-apple-disable-message-reformatting" />` +
    // Opting OUT of client dark-mode inversion on purpose: the brand logo is
    // black line art on white, so an inverted card would hide it entirely.
    `<meta name="color-scheme" content="light only" />` +
    `<meta name="supported-color-schemes" content="light only" />` +
    `<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch>` +
    `</o:OfficeDocumentSettings></xml><![endif]-->` +
    `<style>` +
    // Cairo, self-hosted on the site (app/public/fonts) — the same face the
    // website uses. Clients that ignore <style> (Gmail) fall through the
    // family list to a system Arabic face, which is why the fallbacks matter
    // more than the @font-face does.
    (siteUrl
      ? `@font-face{font-family:'Cairo';font-style:normal;font-weight:400;font-display:swap;` +
        `src:url('${siteUrl}/fonts/cairo-arabic-400.woff2') format('woff2');}` +
        `@font-face{font-family:'Cairo';font-style:normal;font-weight:700;font-display:swap;` +
        `src:url('${siteUrl}/fonts/cairo-arabic-400.woff2') format('woff2');}`
      : "") +
    `body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}` +
    `table{border-collapse:collapse}` +
    `img{-ms-interpolation-mode:bicubic}` +
    `@media only screen and (max-width:620px){` +
    `.ae-card{width:100%!important;border-radius:0!important;border-left:0!important;border-right:0!important}` +
    `.ae-pad{padding-left:20px!important;padding-right:20px!important}` +
    `.ae-outer{padding:0!important}` +
    `}` +
    `</style>` +
    `</head>` +
    `<body dir="${dir}" style="margin:0;padding:0;background:${EMAIL_COLORS.canvas};` +
    `font-family:${font};color:${EMAIL_COLORS.text}">` +
    preheader +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="width:100%;background:${EMAIL_COLORS.canvas}" bgcolor="${EMAIL_COLORS.canvas}">` +
    `<tr><td align="center" class="ae-outer" style="padding:32px 12px">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="ae-card" ` +
    `dir="${dir}" style="width:600px;max-width:600px;background:${EMAIL_COLORS.card};` +
    `border:1px solid ${EMAIL_COLORS.border};border-radius:14px;overflow:hidden" bgcolor="${EMAIL_COLORS.card}">` +
    // Header: logo on white — the mark is black line art and would vanish on
    // a brand-colored bar, so the brand color goes in the rule beneath it.
    `<tr><td align="center" style="padding:30px 24px 22px">` +
    (siteUrl ? `<a href="${escapeHtml(siteUrl)}" style="text-decoration:none">${logoImg}</a>` : logoImg) +
    `</td></tr>` +
    `<tr><td style="height:3px;line-height:3px;font-size:0;background:${EMAIL_COLORS.brand}" ` +
    `bgcolor="${EMAIL_COLORS.brand}">&nbsp;</td></tr>` +
    `<tr><td class="ae-pad" style="padding:32px 34px 26px">${opts.bodyHtml}</td></tr>` +
    (opts.footer ? footerHtml(opts.footer, dir, opts.footerExtraHtml) : "") +
    `</table>` +
    `</td></tr></table>` +
    `</body></html>`
  );
}
