import { useRef, useState, useEffect } from "react";
import { clearAllLeads } from "../../lib/requests";
import { resetCatalog, exportCatalog, importCatalog } from "../../lib/catalog";
import { loadDemoLeads } from "../../lib/demo";
import {
  useSettings, updateSettings, type PlatformSettings,
  fetchEmailTemplates, saveEmailTemplates, type EmailTemplates,
  fetchLegalPagesAdmin, saveLegalPages, type LegalPages,
} from "../../lib/settings";
import { isApiConfigured } from "../../lib/api";
import NotificationToggle from "../../components/NotificationToggle";
import AdminChatNotifyToggle from "../../components/AdminChatNotifyToggle";
import TelegramConnect from "../../components/TelegramConnect";
import { LField } from "./components/ModalShell";
import { TagField, ImageUpload } from "./components/fields";
import { ConfirmAction } from "./components/confirm";
import { useLocale } from "../../context/LocaleContext";
import { t, tCount, type StringKey } from "../../lib/i18n";
import Icon from "../../components/Icon";

// ══════════════════════════════════════════════════════════════════════════
//  SETTINGS
// ══════════════════════════════════════════════════════════════════════════
export function SettingsTab({ leadCount }: { leadCount: number }) {
  const { locale } = useLocale();
  const [msg, setMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function flash(m: string) { setMsg(m); setTimeout(() => setMsg(""), 2500); }

  function doExport() {
    const blob = new Blob([exportCatalog()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `al-assemah-catalog-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    flash(t(locale, "admin_set_exported"));
  }

  function doImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    file.text().then((txt) => flash(t(locale, importCatalog(txt) ? "admin_set_imported" : "admin_set_import_failed")));
  }

  // These tools write to localStorage only — meaningful in demo mode, but in
  // production (API configured) the data comes from the real database, so they'd
  // be misleading (inject fake leads / appear to reset, then vanish on next sync).
  const demoMode = !isApiConfigured();

  return (
    <div className="max-w-2xl space-y-5">
      {msg && <div className="bg-green-50 border border-green-200 text-green-800 rounded-xl px-4 py-3 text-label font-bold">{msg}</div>}

      <SettingCard icon="notifications_active" title={t(locale, "admin_set_push_title")} desc={t(locale, "admin_set_push_desc")}>
        <NotificationToggle />
      </SettingCard>

      <SettingCard icon="forum" title={t(locale, "admin_set_chat_notify_card_title")} desc={t(locale, "admin_set_chat_notify_card_desc")}>
        <AdminChatNotifyToggle />
      </SettingCard>

      {/* Self-service Telegram link for THIS admin account — renders nothing when
          the server has no bot configured (see TelegramConnect), so no wrapping
          SettingCard/title here that would be left with an empty body. */}
      <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom empty:hidden">
        <TelegramConnect scope="admin" />
      </div>

      {demoMode ? (
        <>
          {/* Demo data */}
          <SettingCard icon="science" title={t(locale, "admin_set_demo_title")} desc={t(locale, "admin_set_demo_desc")}>
            <button onClick={() => flash(`${t(locale, "admin_set_demo_added_a")} ${loadDemoLeads()} ${t(locale, "admin_set_demo_added_b")}`)} className="bg-primary text-on-primary px-4 py-2.5 rounded-xl font-bold text-label hover:bg-primary-container transition-colors touch-press">{t(locale, "admin_set_demo_load")}</button>
            <ConfirmAction label={`${t(locale, "admin_set_clear_all")} ${leadCount} ${tCount(locale, "noun_lead", leadCount)}`} onConfirm={() => { clearAllLeads(); flash(t(locale, "admin_set_leads_cleared")); }} danger />
          </SettingCard>

          {/* Catalog backup */}
          <SettingCard icon="backup" title={t(locale, "admin_set_backup_title")} desc={t(locale, "admin_set_backup_desc")}>
            <button onClick={doExport} className="bg-surface-container px-4 py-2.5 rounded-xl font-bold text-label text-on-surface hover:bg-surface-container-high transition-colors">{t(locale, "admin_set_export_json")}</button>
            <button onClick={() => fileRef.current?.click()} className="bg-surface-container px-4 py-2.5 rounded-xl font-bold text-label text-on-surface hover:bg-surface-container-high transition-colors">{t(locale, "admin_set_import_json")}</button>
            <input ref={fileRef} type="file" accept="application/json" hidden onChange={doImport} />
          </SettingCard>

          {/* Reset */}
          <SettingCard icon="restart_alt" title={t(locale, "admin_set_reset_title")} desc={t(locale, "admin_set_reset_desc")}>
            <ConfirmAction label={t(locale, "admin_set_reset_action")} onConfirm={() => { resetCatalog(); flash(t(locale, "admin_set_reset_done")); }} danger />
          </SettingCard>
        </>
      ) : (
        <SettingsPanel onSaved={flash} />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
//  Unified, tabbed platform settings (General / Branding / Email / Legal).
//  Each backing endpoint keeps its own form state; a single sticky "Save
//  Changes" persists every dirty section at once and switching tabs preserves
//  unsaved edits.
// ══════════════════════════════════════════════════════════════════════════
export type SettingsSubTab = "general" | "branding" | "email" | "legal";

export const SETTINGS_TABS: { id: SettingsSubTab; labelKey: StringKey }[] = [
  { id: "general", labelKey: "admin_set_tab_general" },
  { id: "branding", labelKey: "admin_set_tab_branding" },
  { id: "email", labelKey: "admin_set_tab_email" },
  { id: "legal", labelKey: "admin_set_tab_legal" },
];

// Newline-string ⇄ chip-list helpers for the Districts / Budgets tag inputs.
export const linesToTags = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);
export const tagsToLines = (t: string[]) => t.join("\n");

export const EMAIL_TOKENS = [
  "{{company}}", "{{refNumber}}", "{{service}}", "{{customer}}", "{{phone}}",
  "{{district}}", "{{budget}}", "{{details}}", "{{receivedAt}}",
];

export function SettingsPanel({ onSaved }: { onSaved: (msg: string) => void }) {
  const { locale } = useLocale();
  const [active, setActive] = useState<SettingsSubTab>("general");

  // General + Branding share the platform-settings endpoint.
  const current = useSettings();
  const [platform, setPlatform] = useState<PlatformSettings>(current);
  const [platformDirty, setPlatformDirty] = useState(false);
  const currentKey = JSON.stringify(current);
  useEffect(() => {
    if (!platformDirty) setPlatform(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentKey]);
  const setP = (k: keyof PlatformSettings, v: string) => { setPlatform((f) => ({ ...f, [k]: v })); setPlatformDirty(true); };

  // Email templates + Legal pages load lazily from their admin endpoints.
  const [email, setEmail] = useState<EmailTemplates | null>(null);
  const [emailDirty, setEmailDirty] = useState(false);
  const setE = (k: keyof EmailTemplates, v: string) => { setEmail((f) => (f ? { ...f, [k]: v } : f)); setEmailDirty(true); };

  const [legal, setLegal] = useState<LegalPages | null>(null);
  const [legalDirty, setLegalDirty] = useState(false);
  const setL = (k: keyof LegalPages, v: string) => { setLegal((f) => (f ? { ...f, [k]: v } : f)); setLegalDirty(true); };

  const [saving, setSaving] = useState(false);
  // The translation KEY, resolved at render. Calling t() inside a mount effect
  // captured the language current at mount, so an error raised before a language
  // switch stayed in the old one.
  const [errorKey, setErrorKey] = useState<StringKey | null>(null);
  const error = errorKey ? t(locale, errorKey) : "";

  useEffect(() => {
    let on = true;
    fetchEmailTemplates()
      .then((tpl) => { if (on) setEmail(tpl); })
      .catch(() => { if (on) setErrorKey("admin_set_email_load_error"); });
    fetchLegalPagesAdmin()
      .then((p) => { if (on) setLegal(p); })
      .catch(() => { if (on) setErrorKey("admin_set_legal_load_error"); });
    return () => { on = false; };
  }, []);

  const anyDirty = platformDirty || emailDirty || legalDirty;
  const tabDirty = (id: SettingsSubTab) =>
    id === "email" ? emailDirty : id === "legal" ? legalDirty : platformDirty;

  async function saveAll() {
    setSaving(true);
    setErrorKey(null);
    try {
      if (platformDirty) { await updateSettings(platform); setPlatformDirty(false); }
      if (emailDirty && email) { setEmail(await saveEmailTemplates(email)); setEmailDirty(false); }
      if (legalDirty && legal) { setLegal(await saveLegalPages(legal)); setLegalDirty(false); }
      onSaved(t(locale, "admin_set_saved"));
    } catch {
      setErrorKey("admin_set_save_error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-surface-container-lowest rounded-2xl shadow-bloom">
      {/* Tabbed navigation */}
      <div className="flex gap-1 px-2 sm:px-4 border-b border-outline-variant/20 overflow-x-auto">
        {SETTINGS_TABS.map((tab) => {
          const on = active === tab.id;
          return (
            <button key={tab.id} onClick={() => setActive(tab.id)}
              className={`relative px-3 sm:px-4 py-3 text-label font-bold whitespace-nowrap border-b-2 -mb-px transition-colors ${
                on ? "border-primary text-primary" : "border-transparent text-outline hover:text-on-surface"
              }`}>
              {t(locale, tab.labelKey)}
              {tabDirty(tab.id) && <span className="ms-1.5 inline-block w-1.5 h-1.5 rounded-full bg-secondary align-middle" />}
            </button>
          );
        })}
      </div>

      <div className="p-5 space-y-4">
        {active === "general" && <GeneralSettings form={platform} setP={setP} />}
        {active === "branding" && <BrandingSettings form={platform} setP={setP} />}
        {active === "email" && <EmailSettings email={email} setE={setE} />}
        {active === "legal" && <LegalSettings legal={legal} setL={setL} />}
        {error && <p className="text-label text-error font-bold">{error}</p>}
      </div>

      {/* Sticky save bar — always reachable, bottom-right of the container. */}
      <div className="sticky bottom-0 flex items-center justify-end gap-3 px-5 py-3 rounded-b-2xl bg-surface-container-lowest/95 backdrop-blur border-t border-outline-variant/20">
        {anyDirty && <span className="me-auto text-caption font-bold text-secondary">{t(locale, "admin_set_unsaved")}</span>}
        <button onClick={saveAll} disabled={saving || !anyDirty}
          className="bg-primary text-on-primary px-6 py-2.5 rounded-xl font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2">
          {saving && <Icon name="progress_activity" className="text-subhead animate-spin" />}
          {t(locale, saving ? "admin_saving" : "admin_save_changes")}
        </button>
      </div>
    </div>
  );
}

export function SettingsHeading({ title, desc }: { title: string; desc: React.ReactNode }) {
  return (
    <div>
      <h3 className="font-bold text-body text-on-surface">{title}</h3>
      <p className="text-label text-outline leading-relaxed mt-0.5">{desc}</p>
    </div>
  );
}

// Stable (module-scope) text field — avoids the remount/focus-loss bug you get
// from defining a field component inside a parent's render.
export function TextField({ label, value, onChange, type = "text", placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <LField label={label}>
      <input className="field-input" type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </LField>
  );
}

export function GeneralSettings({ form, setP }: { form: PlatformSettings; setP: (k: keyof PlatformSettings, v: string) => void }) {
  const { locale } = useLocale();
  return (
    <div className="space-y-4">
      <SettingsHeading title={t(locale, "admin_set_platform")} desc={t(locale, "admin_set_platform_desc")} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField label={t(locale, "admin_set_site_name")} value={form.site_name} onChange={(v) => setP("site_name", v)} placeholder="Al Assema" />
        <TextField label={t(locale, "admin_set_support_email")} type="email" value={form.support_email} onChange={(v) => setP("support_email", v)} placeholder={t(locale, "admin_set_support_email_ph")} />
        <TextField label={t(locale, "admin_set_public_phone")} value={form.public_phone} onChange={(v) => setP("public_phone", v)} placeholder={t(locale, "admin_ce_phone_ph")} />
        <TextField label={t(locale, "admin_set_address")} value={form.address} onChange={(v) => setP("address", v)} placeholder={t(locale, "admin_set_address_ph")} />
        <TextField label={t(locale, "admin_set_facebook")} value={form.social_facebook} onChange={(v) => setP("social_facebook", v)} placeholder="https://facebook.com/…" />
        <TextField label={t(locale, "admin_set_instagram")} value={form.social_instagram} onChange={(v) => setP("social_instagram", v)} placeholder="https://instagram.com/…" />
        <TextField label={t(locale, "admin_set_twitter")} value={form.social_twitter} onChange={(v) => setP("social_twitter", v)} placeholder="https://x.com/…" />
        <TextField label={t(locale, "admin_set_linkedin")} value={form.social_linkedin} onChange={(v) => setP("social_linkedin", v)} placeholder="https://linkedin.com/…" />
      </div>

      {/* Request-form option lists as removable chips; blank = built-in defaults. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-outline-variant/15">
        <TagField label={t(locale, "admin_set_districts")} tags={linesToTags(form.districts)} onChange={(v) => setP("districts", tagsToLines(v))} placeholder={t(locale, "admin_set_districts_ph")} />
        <TagField label={t(locale, "admin_set_budgets")} tags={linesToTags(form.budgets)} onChange={(v) => setP("budgets", tagsToLines(v))} placeholder={t(locale, "admin_set_budgets_ph")} />
      </div>

      {/* Homepage hero copy, per locale — blank uses the built-in translations. */}
      <div className="pt-2 border-t border-outline-variant/15 space-y-4">
        <p className="text-caption font-bold text-outline">{t(locale, "admin_set_hero")}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <TextField label={t(locale, "admin_set_hero_title_en")} value={form.hero_title_en} onChange={(v) => setP("hero_title_en", v)} />
          <TextField label={t(locale, "admin_set_hero_title_ar")} value={form.hero_title_ar} onChange={(v) => setP("hero_title_ar", v)} />
          <TextField label={t(locale, "admin_set_hero_sub_en")} value={form.hero_subtitle_en} onChange={(v) => setP("hero_subtitle_en", v)} />
          <TextField label={t(locale, "admin_set_hero_sub_ar")} value={form.hero_subtitle_ar} onChange={(v) => setP("hero_subtitle_ar", v)} />
        </div>
      </div>
    </div>
  );
}

export function BrandingSettings({ form, setP }: { form: PlatformSettings; setP: (k: keyof PlatformSettings, v: string) => void }) {
  const { locale } = useLocale();
  const scale = Number(form.logo_scale) || 100;
  return (
    <div className="space-y-4">
      <SettingsHeading title={t(locale, "admin_set_branding")} desc={t(locale, "admin_set_branding_desc")} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <ImageUpload label={t(locale, "admin_ce_logo")} value={form.logo_url} onChange={(v) => setP("logo_url", v)} shape="logo" maxDim={256} bucket="logos" />
        <ImageUpload label={t(locale, "admin_set_favicon")} value={form.favicon_url} onChange={(v) => setP("favicon_url", v)} shape="logo" maxDim={64} bucket="logos" />
      </div>
      <ImageUpload label={t(locale, "admin_set_hero_image")} value={form.hero_image_url} onChange={(v) => setP("hero_image_url", v)} shape="wide" maxDim={2000} bucket="covers" />
      <LField label={`${t(locale, "admin_set_logo_size")} — ${scale}%`}>
        <div className="flex items-center gap-3">
          <input type="range" min={50} max={200} step={5} value={scale}
            onChange={(e) => setP("logo_scale", e.target.value === "100" ? "" : e.target.value)}
            className="flex-1 accent-primary" />
          <button type="button" onClick={() => setP("logo_scale", "")}
            className="text-caption font-bold text-outline hover:text-on-surface transition-colors shrink-0">{t(locale, "admin_reset")}</button>
        </div>
      </LField>
    </div>
  );
}

// Highlights {{tokens}} inside a textarea using a mirrored backdrop layer (a
// textarea can't style its own substrings). Backdrop + textarea share identical
// metrics so the highlight sits exactly behind the real, visible text.
export function highlightTokens(value: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const re = /\{\{[^}]+\}\}/g;
  let last = 0; let m: RegExpExecArray | null; let i = 0;
  while ((m = re.exec(value)) !== null) {
    if (m.index > last) nodes.push(<span key={`t${i}`}>{value.slice(last, m.index)}</span>);
    nodes.push(<mark key={`m${i}`} className="rounded-[3px]" style={{ background: "rgba(0,85,120,0.16)", color: "transparent" }}>{m[0]}</mark>);
    last = m.index + m[0].length; i++;
  }
  // Trailing newline keeps the backdrop's last line in sync with the textarea.
  nodes.push(<span key="end">{value.slice(last) + "\n"}</span>);
  return nodes;
}

export function HighlightTextarea({ value, onChange, onFocus, rows = 4, placeholder }: {
  value: string; onChange: (v: string) => void; onFocus?: React.FocusEventHandler<HTMLTextAreaElement>; rows?: number; placeholder?: string;
}) {
  const back = useRef<HTMLDivElement>(null);
  const shared: React.CSSProperties = { padding: "14px 16px", fontSize: 16, fontFamily: '"Inter", sans-serif', lineHeight: 1.5 };
  return (
    <div className="relative">
      <div ref={back} aria-hidden
        className="absolute inset-0 overflow-hidden whitespace-pre-wrap break-words rounded-[14px] pointer-events-none"
        style={{ ...shared, border: "1.5px solid transparent", color: "transparent" }}>
        {highlightTokens(value)}
      </div>
      <textarea value={value} onChange={(e) => onChange(e.target.value)} onFocus={onFocus} rows={rows} placeholder={placeholder}
        onScroll={(e) => { if (back.current) back.current.scrollTop = e.currentTarget.scrollTop; }}
        className="field-input resize-y relative" style={{ ...shared, background: "transparent" }} />
    </div>
  );
}

export function EmailSettings({ email, setE }: { email: EmailTemplates | null; setE: (k: keyof EmailTemplates, v: string) => void }) {
  const { locale } = useLocale();
  // Track the last-focused field so a token chip inserts at its caret. The chip
  // buttons use onMouseDown→preventDefault so clicking them doesn't blur/clear it.
  const focused = useRef<{ el: HTMLInputElement | HTMLTextAreaElement; key: keyof EmailTemplates } | null>(null);
  const track = (key: keyof EmailTemplates) => (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    focused.current = { el: e.currentTarget, key };
  };
  function insertToken(tok: string) {
    const f = focused.current;
    if (!f || !email) return;
    const el = f.el;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    const cur = email[f.key];
    setE(f.key, cur.slice(0, start) + tok + cur.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      const p = start + tok.length;
      try { el.setSelectionRange(p, p); } catch { /* inputs without range support */ }
    });
  }

  if (!email) return <p className="text-label text-outline">{t(locale, "admin_loading")}</p>;
  return (
    <div className="space-y-4">
      <SettingsHeading title={t(locale, "admin_set_email_title")} desc={t(locale, "admin_set_email_desc")} />

      {/* Tokens toolbar */}
      <div className="bg-surface-container/50 rounded-xl p-3 border border-outline-variant/15">
        <p className="text-caption font-bold text-outline mb-2">{t(locale, "admin_set_insert_token")}</p>
        <div className="flex flex-wrap gap-1.5">
          {EMAIL_TOKENS.map((tok) => (
            <button key={tok} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertToken(tok)}
              className="font-mono text-caption bg-primary/8 text-primary px-2.5 py-1 rounded-full font-bold hover:bg-primary/15 transition-colors touch-press">
              {tok}
            </button>
          ))}
        </div>
      </div>

      <p className="text-caption font-bold text-outline pt-2 border-t border-outline-variant/15">{t(locale, "admin_set_provider_email")}</p>
      <LField label={t(locale, "admin_set_subject")}><input className="field-input" value={email.providerSubject} onFocus={track("providerSubject")} onChange={(e) => setE("providerSubject", e.target.value)} placeholder={t(locale, "admin_set_provider_subject_ph")} /></LField>
      <LField label={t(locale, "admin_set_body")}><HighlightTextarea value={email.providerBody} onChange={(v) => setE("providerBody", v)} onFocus={track("providerBody")} rows={5} placeholder={t(locale, "admin_set_blank_default")} /></LField>

      <p className="text-caption font-bold text-outline pt-2 border-t border-outline-variant/15">{t(locale, "admin_set_admin_email")}</p>
      <LField label={t(locale, "admin_set_subject")}><input className="field-input" value={email.adminSubject} onFocus={track("adminSubject")} onChange={(e) => setE("adminSubject", e.target.value)} placeholder={t(locale, "admin_set_admin_subject_ph")} /></LField>
      <LField label={t(locale, "admin_set_body")}><HighlightTextarea value={email.adminBody} onChange={(v) => setE("adminBody", v)} onFocus={track("adminBody")} rows={4} placeholder={t(locale, "admin_set_blank_default_admin")} /></LField>
    </div>
  );
}

export function LegalSettings({ legal, setL }: { legal: LegalPages | null; setL: (k: keyof LegalPages, v: string) => void }) {
  const { locale } = useLocale();
  const focused = useRef<{ el: HTMLTextAreaElement; key: keyof LegalPages } | null>(null);
  const track = (key: keyof LegalPages) => (e: React.FocusEvent<HTMLTextAreaElement>) => {
    focused.current = { el: e.currentTarget, key };
  };
  function wrap(before: string, after: string) {
    const f = focused.current;
    if (!f || !legal) return;
    const el = f.el;
    const s = el.selectionStart ?? 0;
    const e2 = el.selectionEnd ?? s;
    const cur = legal[f.key];
    const sel = cur.slice(s, e2) || t(locale, "admin_set_md_word");
    setL(f.key, cur.slice(0, s) + before + sel + after + cur.slice(e2));
    requestAnimationFrame(() => { el.focus(); const p1 = s + before.length; el.setSelectionRange(p1, p1 + sel.length); });
  }
  function listPrefix(ordered: boolean) {
    const f = focused.current;
    if (!f || !legal) return;
    const el = f.el;
    const s = el.selectionStart ?? 0;
    const e2 = el.selectionEnd ?? s;
    const cur = legal[f.key];
    const lineStart = cur.lastIndexOf("\n", s - 1) + 1;
    const nl = cur.indexOf("\n", e2);
    const lineEnd = nl === -1 ? cur.length : nl;
    const out = cur.slice(lineStart, lineEnd).split("\n").map((ln, i) => (ordered ? `${i + 1}. ` : "- ") + ln).join("\n");
    setL(f.key, cur.slice(0, lineStart) + out + cur.slice(lineEnd));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(lineStart, lineStart + out.length); });
  }

  const toolbar = (
    <div className="flex items-center gap-0.5 mb-1.5">
      {([
        { icon: "format_bold", title: t(locale, "admin_set_bold"), fn: () => wrap("**", "**") },
        { icon: "format_italic", title: t(locale, "admin_set_italic"), fn: () => wrap("*", "*") },
        { icon: "format_list_bulleted", title: t(locale, "admin_set_ul"), fn: () => listPrefix(false) },
        { icon: "format_list_numbered", title: t(locale, "admin_set_ol"), fn: () => listPrefix(true) },
      ] as const).map((b) => (
        <button key={b.icon} type="button" title={b.title} onMouseDown={(e) => e.preventDefault()} onClick={b.fn}
          className="p-1.5 rounded-lg text-on-surface-variant hover:bg-surface-container hover:text-on-surface transition-colors">
          <span className="material-symbols-outlined text-subhead" aria-hidden="true" translate="no">{b.icon}</span>
        </button>
      ))}
      <span className="text-caption text-outline ms-1.5">{t(locale, "admin_set_markdown")}</span>
    </div>
  );

  if (!legal) return <p className="text-label text-outline">{t(locale, "admin_loading")}</p>;
  return (
    <div className="space-y-4">
      <SettingsHeading title={t(locale, "admin_set_legal_title")} desc={<>{t(locale, "admin_set_legal_desc_a")} <code>/terms</code> {t(locale, "admin_set_legal_desc_and")} <code>/privacy</code> {t(locale, "admin_set_legal_desc_b")}</>} />
      <LField label={t(locale, "admin_set_terms")}>
        {toolbar}
        <textarea className="field-input resize-y font-mono text-label" rows={8} value={legal.terms} onFocus={track("terms")} onChange={(e) => setL("terms", e.target.value)} placeholder={t(locale, "admin_set_md_ph")} />
      </LField>
      <LField label={t(locale, "admin_set_privacy")}>
        {toolbar}
        <textarea className="field-input resize-y font-mono text-label" rows={8} value={legal.privacy} onFocus={track("privacy")} onChange={(e) => setL("privacy", e.target.value)} placeholder={t(locale, "admin_set_md_ph")} />
      </LField>
    </div>
  );
}

export function SettingCard({ icon, title, desc, children }: { icon: string; title: string; desc: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-bloom">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <span className="material-symbols-outlined text-primary text-title" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no">{icon}</span>
        </div>
        <div>
          <h3 className="font-bold text-body text-on-surface">{title}</h3>
          <p className="text-label text-outline leading-relaxed mt-0.5">{desc}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">{children}</div>
    </div>
  );
}
