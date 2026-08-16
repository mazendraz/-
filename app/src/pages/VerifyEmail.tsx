import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import Icon from "../components/Icon";
import Logo from "../components/Logo";
import { useLocale } from "../context/LocaleContext";
import { t } from "../lib/i18n";
import { usePageMeta } from "../hooks/usePageMeta";
import { verifyEmailToken } from "../lib/customerAuth";

/**
 * The landing page for the emailed confirmation link (/verify-email?token=…).
 *
 * Verifying signs them in, so a success here goes straight on to their requests
 * rather than asking for the password they set a minute ago — the link came out
 * of the inbox they are proving they control, which is the same evidence.
 */
export default function VerifyEmail() {
  const { locale } = useLocale();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [state, setState] = useState<"working" | "failed">("working");
  // Verification burns the token server-side. Under StrictMode the effect runs
  // twice in development, and the second call would consume nothing and report
  // failure over a success that already happened.
  const done = useRef(false);

  usePageMeta(t(locale, "verify_email_title"), t(locale, "signin_meta_desc"));

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    if (!token) {
      setState("failed");
      return;
    }

    verifyEmailToken(token)
      .then(() => navigate("/requests?welcome=1", { replace: true }))
      .catch(() => setState("failed"));
  }, [token, navigate]);

  return (
    <div className="min-h-screen bg-surface-container flex items-center justify-center p-4">
      <div className="w-full max-w-sm bg-surface-container-lowest rounded-3xl shadow-bloom p-8 text-center page-enter">
        <div className="flex justify-center mb-5">
          <Logo className="h-14 w-14 rounded-2xl object-contain" width={56} height={56} />
        </div>

        {state === "working" ? (
          <>
            <div className="w-8 h-8 rounded-full border-4 border-primary/20 border-t-primary animate-spin mx-auto mb-4" />
            <p className="text-label text-outline">{t(locale, "verify_email_working")}</p>
          </>
        ) : (
          <>
            <div className="w-14 h-14 rounded-2xl bg-error-container text-on-error-container flex items-center justify-center mx-auto mb-4">
              <Icon name="link_off" className="text-headline" />
            </div>
            <h1 className="font-display font-bold text-title text-on-surface mb-2">
              {t(locale, "verify_email_failed_title")}
            </h1>
            <p className="text-label text-outline leading-relaxed mb-6">
              {t(locale, "verify_email_failed_body")}
            </p>
            <Link
              to="/signin"
              className="block w-full bg-primary text-on-primary rounded-xl py-3 font-bold text-label hover:bg-primary-container transition-colors btn-press"
            >
              {t(locale, "verify_email_go_signin")}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
