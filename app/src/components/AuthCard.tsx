import { Link } from "react-router-dom";
import Icon from "./Icon";
import Logo from "./Logo";
import { useLocale } from "../context/LocaleContext";
import { t, type StringKey } from "../lib/i18n";

/**
 * The shell every standalone account screen sits in.
 *
 * SignIn and VerifyEmail each hand-rolled this same card (centred on
 * `surface-container`, white, `rounded-3xl`, `shadow-bloom`, `page-enter`), and
 * the password-reset pair would have made four copies of it. One component
 * instead, so the family stays a family — the pages that a customer bounces
 * between while locked out are exactly the ones where a shifting layout reads
 * as "did I land somewhere else?".
 *
 * ── The halo ─────────────────────────────────────────────────────────────────
 * A single soft primary glow behind the card, pointer-events-none and hidden
 * from assistive tech. It is the one decorative element here: these screens are
 * one card on a flat field, and without it the page reads as an error state
 * rather than a step in a flow. Kept to the brand's own primary at very low
 * alpha rather than a new gradient, so it can't drift from the palette.
 *
 * `tone` picks the medallion's colour role, which is the whole visual signal for
 * where this screen sits: `brand` for a step you are meant to take, `success`
 * for one that worked, `error` for a dead end.
 */
export type AuthCardTone = "brand" | "success" | "error";

const TONE_CLASS: Record<AuthCardTone, string> = {
  brand: "bg-primary/10 text-primary",
  success: "bg-success-container text-on-success-container",
  error: "bg-error-container text-on-error-container",
};

export default function AuthCard({
  icon,
  tone = "brand",
  title,
  children,
  backTo = "/signin",
  backLabel = "signin_back_to_signin",
}: {
  /** Material symbol name for the medallion above the title. */
  icon: string;
  tone?: AuthCardTone;
  /** Already-resolved text — callers translate, since some interpolate. */
  title: string;
  children: React.ReactNode;
  /** Omit with `null` on a screen that is itself the destination. */
  backTo?: string | null;
  backLabel?: StringKey;
}) {
  const { locale } = useLocale();

  return (
    <div className="relative min-h-screen bg-surface-container flex items-center justify-center p-4 overflow-hidden">
      {/* Decorative only — see the note above.
          PHYSICAL `left-1/2`, not logical `start-1/2`: `translate-x` is always
          physical, so pairing it with a logical offset centres the glow in LTR
          and shoves it off the far edge in RTL — which is the direction this
          site actually renders in. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[38rem] h-[38rem] rounded-full bg-primary/[0.08] blur-3xl"
      />

      <div className="relative w-full max-w-sm bg-surface-container-lowest rounded-3xl shadow-bloom p-8 page-enter">
        <div className="flex flex-col items-center text-center">
          <Logo className="h-14 w-14 rounded-2xl object-contain" width={56} height={56} />

          <div
            className={`mt-5 w-14 h-14 rounded-2xl flex items-center justify-center ${TONE_CLASS[tone]}`}
          >
            <Icon name={icon} className="text-headline" />
          </div>

          <h1 className="mt-4 font-display font-bold text-title text-on-surface">{title}</h1>
        </div>

        {children}

        {backTo && (
          <Link
            to={backTo}
            className="mt-6 flex items-center justify-center gap-1 text-label font-bold text-outline hover:text-on-surface transition-colors"
          >
            <Icon name="arrow_back" className="text-body rtl-flip" />
            {t(locale, backLabel)}
          </Link>
        )}
      </div>
    </div>
  );
}
