/**
 * The two languages the product speaks.
 *
 * Lives here rather than in the website's i18n module because every consumer
 * needs it — plural selection, price formatting and date formatting all branch
 * on it, and the mobile apps have no access to a file full of DOM-era strings.
 */
export type Locale = "en" | "ar";
