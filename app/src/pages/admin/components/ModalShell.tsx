export function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-start sm:items-center justify-center p-0 sm:p-4 bg-on-background/45 backdrop-blur-sm">
      <div className={`bg-surface-container-lowest w-full ${wide ? "max-w-2xl" : "max-w-md"} sm:rounded-2xl shadow-2xl max-h-screen sm:max-h-[92vh] overflow-y-auto`}>
        <div className="flex items-center justify-between p-5 border-b border-outline-variant/20 sticky top-0 bg-surface-container-lowest z-10">
          <h2 className="font-bold text-[18px] text-on-surface">{title}</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-container transition-colors"><span className="material-symbols-outlined text-outline">close</span></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function LField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[13px] font-bold text-on-surface mb-1.5">{label}{required && <span className="text-error ml-0.5">*</span>}</label>
      {children}
    </div>
  );
}
