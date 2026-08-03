import { useSettings } from "../lib/settings";

interface Props {
  /** "inverse" = footer's light-on-dark styling; "surface" = standalone page's normal on-surface styling. */
  tone?: "inverse" | "surface";
}

/** Admin-managed contact details + social links (see lib/settings) — shared by
 *  the footer and the standalone /contact page so there's one source of truth. */
export default function ContactInfo({ tone = "surface" }: Props) {
  const s = useSettings();
  const socials = [
    { label: "Facebook", url: s.social_facebook },
    { label: "Instagram", url: s.social_instagram },
    { label: "X", url: s.social_twitter },
    { label: "LinkedIn", url: s.social_linkedin },
  ].filter((x) => x.url.trim() !== "");

  const textClass = tone === "inverse" ? "text-inverse-on-surface/70" : "text-on-surface-variant";
  const hoverClass = tone === "inverse" ? "hover:text-white" : "hover:text-primary";

  if (!s.support_email && !s.public_phone && !s.address && socials.length === 0) return null;

  return (
    <>
      {(s.support_email || s.public_phone || s.address) && (
        <ul className="space-y-2">
          {s.support_email && (
            <ContactLine icon="mail" href={`mailto:${s.support_email}`} text={s.support_email} textClass={textClass} hoverClass={hoverClass} />
          )}
          {s.public_phone && (
            <ContactLine icon="call" href={`tel:${s.public_phone.replace(/\s/g, "")}`} text={s.public_phone} textClass={textClass} hoverClass={hoverClass} />
          )}
          {s.address && <ContactLine icon="location_on" text={s.address} textClass={textClass} hoverClass={hoverClass} />}
        </ul>
      )}
      {socials.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-3">
          {socials.map((x) => (
            <a
              key={x.label}
              href={x.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`text-caption font-bold ${textClass} ${hoverClass} transition-colors`}
            >
              {x.label}
            </a>
          ))}
        </div>
      )}
    </>
  );
}

function ContactLine({ icon, text, href, textClass, hoverClass }: {
  icon: string; text: string; href?: string; textClass: string; hoverClass: string;
}) {
  const body = (
    <span className={`flex items-center gap-2 text-sm ${textClass}`}>
      <span className="material-symbols-outlined text-body flex-shrink-0" aria-hidden="true" translate="no">{icon}</span>
      <span className="break-words">{text}</span>
    </span>
  );
  return (
    <li>
      {href ? (
        <a href={href} className={`${hoverClass} transition-colors block`}>{body}</a>
      ) : (
        body
      )}
    </li>
  );
}
