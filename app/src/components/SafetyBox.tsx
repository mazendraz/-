import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { useSettings } from "../lib/settings";
import Icon from "./Icon";

const POINTS = ["safety_1", "safety_2", "safety_3", "safety_4"] as const;

/**
 * "How we protect you" — the four things Al Assema does about the risk a
 * customer is actually weighing.
 *
 * It sits on the home page and under the price block on a company profile,
 * because those are the two moments the question is live: "who are these
 * people" and "what if this goes wrong after I've paid".
 *
 * Point 3 ("talk to us, not to them") is the one that does the work, and it is
 * the one with a cost: it is a commitment to actually pick up. It is written
 * here with a WhatsApp button beside it deliberately — a promise the reader
 * can act on in one tap is a promise; the same words with no way to reach
 * anyone are decoration, and a broken promise is worse than none.
 */
export default function SafetyBox({ className = "" }: { className?: string }) {
  const { locale } = useLocale();
  const settings = useSettings();
  // The platform's own number, not the company's — the whole point of point 3
  // is that it routes around the provider.
  const wa = settings.public_phone.replace(/[^\d]/g, "");

  return (
    <section
      className={`bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 md:p-8 shadow-soft ${className}`}
      aria-labelledby="safety-title"
    >
      {/* Header. The old one was text-body (15px) with a 18px icon in a box
          that can run 1280px wide — it read as a caption, not a heading. */}
      <h2
        id="safety-title"
        className="flex items-center gap-2.5 text-subhead md:text-title font-black text-on-surface mb-5 md:mb-6"
      >
        <Icon name="shield" className="text-primary text-title md:text-headline" fill />
        {t(locale, "safety_title")}
      </h2>

      {/* Two columns from md up. Four 13px lines stacked down the left edge of
          a full-width card left most of it empty and gave each line a very
          long measure; two columns halve the measure and let the type come up
          to body size without the card growing. */}
      <ol className="grid grid-cols-1 md:grid-cols-2 gap-x-8 lg:gap-x-12 gap-y-4">
        {POINTS.map((key, i) => (
          <li key={key} className="flex items-start gap-3.5">
            <span className="shrink-0 w-7 h-7 mt-px rounded-full bg-primary/10 text-primary font-black text-label grid place-items-center tabular-nums">
              {i + 1}
            </span>
            <span className="text-body text-on-surface leading-[1.75]">{t(locale, key)}</span>
          </li>
        ))}
      </ol>

      {wa && (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary text-on-primary px-5 py-3 font-bold text-body transition-colors hover:bg-primary-container touch-press"
        >
          <Icon name="chat" className="text-subhead" />
          {t(locale, "safety_contact")}
        </a>
      )}
    </section>
  );
}
