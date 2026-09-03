// The modal shell itself now lives in the shared `components/Modal.tsx`
// (CMP-06) — used by both admin and the public site. `LField` is an
// admin-only form-label wrapper, unrelated to the modal chrome, so it stays
// here rather than moving into a component every admin editor would need to
// re-import.
export function LField({ label, required, error, children }: {
  label: string;
  required?: boolean;
  /**
   * Why the last save refused this field. A rejected write names the field
   * (ApiErrorBody.details), and this is where that lands: on the field itself,
   * in red, instead of only as a sentence at the foot of a form with dozens of
   * inputs — most of which the admin never touched, since the editor sends the
   * whole record on every save.
   */
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className={`block text-label font-bold mb-1.5 ${error ? "text-error" : "text-on-surface"}`}>
        {label}{required && <span className="text-error ms-0.5">*</span>}
      </label>
      <div className={error ? "field-flag" : undefined}>{children}</div>
      {error && <p className="field-flag-msg text-caption">{error}</p>}
    </div>
  );
}
