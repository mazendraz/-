import { useEffect, useRef, useState } from "react";
import { t, type Locale, type StringKey } from "../../lib/i18n";
import { submitReview, type Lead } from "../../lib/requests";
import { captchaConfigured } from "../../lib/captcha";
import Captcha from "../Captcha";
import StarRatingInput from "../StarRatingInput";
import Icon from "../Icon";

// Mockup's per-star helper text ("Tap to rate" → "Excellent"), indexed by rating.
const RATING_LABEL_KEYS: StringKey[] = [
  "verify_rating_0", "verify_rating_1", "verify_rating_2",
  "verify_rating_3", "verify_rating_4", "verify_rating_5",
];

/**
 * Mockup's "cRating" state — optional and skippable (per the product
 * requirement: verification is mandatory, review never is). Reuses the same
 * submitReview() call as MyRequests' ReviewModal, but only the rating is
 * required here — the mockup's own "Write a review (optional)" label means
 * it, so a star-only submission (no comment) is a valid review, not a
 * disabled button. "Skip for now" is still there for leaving no review at all.
 */
export default function ReviewStep({ lead, onDone, locale }: { lead: Lead; onDone: () => void; locale: Locale }) {
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [captchaReset, setCaptchaReset] = useState(0);
  // The "thanks" panel shows for a beat before releasing the gate. Tracked and
  // cleared on unmount so the callback can't fire into a torn-down tree — this
  // one resolves the price-verification gate, which is not a callback to leave
  // pointing at a component that no longer exists.
  const doneTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(doneTimer.current), []);

  async function submit() {
    if (rating < 1) return;
    if (captchaConfigured() && !captchaToken) {
      setError(t(locale, "form_err_captcha"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await submitReview(
        lead.refNumber, lead.phone, rating, text.trim(), "", captchaToken, lead.trackingToken,
        { leadId: lead.id, owned: Boolean(lead.accountOwned) },
      );
      setDone(true);
      doneTimer.current = window.setTimeout(onDone, 1200);
    } catch {
      setError(t(locale, "lead_review_error"));
      setCaptchaToken(null);
      setCaptchaReset((n) => n + 1);
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-3xl p-10 text-center">
        <div className="w-14 h-14 rounded-full bg-success-container flex items-center justify-center mx-auto mb-4">
          <Icon name="check_circle" className="text-title text-on-success-container" style={{ fontVariationSettings: "'FILL' 1" }} />
        </div>
        <p className="font-bold text-subhead text-on-surface">{t(locale, "lead_review_thanks")}</p>
      </div>
    );
  }

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-3xl p-6 sm:p-8 text-center">
      <h2 className="font-black text-title text-on-surface mb-1">{t(locale, "lead_review_title")}</h2>
      <p className="text-label text-outline mb-5">{lead.companyName}</p>

      <div className="flex justify-center mb-2">
        <StarRatingInput value={rating} onChange={setRating} />
      </div>
      <p className="text-label text-outline mb-5 h-[18px]">{t(locale, RATING_LABEL_KEYS[rating])}</p>

      <div className="text-start">
        <label className="block text-label font-bold text-on-surface mb-1.5">
          {t(locale, "lead_review_text_label")} <span className="text-outline font-normal">{t(locale, "completion_optional")}</span>
        </label>
        <textarea
          className="field-input w-full resize-none" rows={4} maxLength={2000}
          value={text} onChange={(e) => setText(e.target.value)}
          placeholder={t(locale, "lead_review_text_ph")}
        />
      </div>

      {error && <p className="text-label text-error font-medium mt-3">{error}</p>}

      <div className="mt-4">
        <Captcha onToken={setCaptchaToken} resetSignal={captchaReset} />
      </div>

      <button
        type="button" onClick={submit} disabled={busy || rating < 1}
        className="w-full mt-5 bg-primary text-on-primary rounded-xl py-3.5 font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {busy ? t(locale, "lead_review_submitting") : t(locale, "lead_review_submit")}
      </button>
      <button
        type="button" onClick={onDone} disabled={busy}
        className="w-full mt-2 py-3 font-medium text-label text-outline hover:text-primary transition-colors disabled:opacity-60"
      >
        {t(locale, "verify_review_skip")}
      </button>
    </div>
  );
}
