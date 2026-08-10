import type { Metadata } from "next";
import "./globals.css";

// ── No webfonts here, deliberately ───────────────────────────────────────────
// This package is an API. Every route it exists to serve is under /api/*; this
// layout wraps one placeholder page nobody navigates to.
//
// It previously imported Geist and Geist Mono via `next/font/google`, which
// FETCHES them at BUILD time. That put a live network call to fonts.googleapis
// .com on the critical path of `next build` — and therefore of every deploy.
// Observed during this audit: a transient blip failed the whole build with
// "Failed to fetch `Geist` from Google Fonts", nothing to do with the code being
// built. An API's build should not be able to fail because a font CDN hiccuped.
//
// page.module.css still names --font-geist-sans; with the variable undefined it
// falls through to the stack after it, which is correct for a page whose only
// job is to not be a 404.
export const metadata: Metadata = {
  title: "Al Assema API",
  description: "Service API for the Al Assema directory. Endpoints live under /api.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
