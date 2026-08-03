// The modal shell itself now lives in the shared `components/Modal.tsx`
// (CMP-06) — used by both admin and the public site. `LField` is an
// admin-only form-label wrapper, unrelated to the modal chrome, so it stays
// here rather than moving into a component every admin editor would need to
// re-import.
export function LField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-label font-bold text-on-surface mb-1.5">{label}{required && <span className="text-error ms-0.5">*</span>}</label>
      {children}
    </div>
  );
}
