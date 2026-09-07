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
      className={`bg-surface-container-lowest border border-outline-variant/25 rounded-2xl p-5 md:p-6 ${className}`}
      aria-labelledby="safety-title"
    >
      <h2 id="safety-title" className="flex items-center gap-2 text-body font-black text-on-surface mb-4">
        <Icon name="shield" className="text-primary text-subhead" fill />
        {t(locale, "safety_title")}
      </h2>

      <ol className="space-y-3">
        {POINTS.map((key, i) => (
          <li key={key} className="flex items-start gap-3">
            <span className="shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary font-black text-caption grid place-items-center tabular-nums">
              {i + 1}
            </span>
            <span className="text-label text-on-surface leading-relaxed">{t(locale, key)}</span>
          </li>
        ))}
      </ol>

      {wa && (
        <a
          href={`https://wa.me/${wa}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary text-on-primary px-4 py-2.5 font-bold text-label transition-colors hover:bg-primary-container touch-press"
        >
          <Icon name="chat" className="text-subhead" />
          {t(locale, "safety_contact")}
        </a>
      )}
    </section>
  );
}
