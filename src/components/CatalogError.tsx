import { retryHydration } from "../lib/catalog";

/**
 * Shown when the catalog can't be loaded from the backend and there is nothing
 * cached to fall back to (API mode only). Offers a retry that re-runs hydration.
 */
export default function CatalogError({ message }: { message?: string }) {
  return (
    <div className="bg-surface-container-lowest rounded-2xl shadow-bloom p-12 text-center max-w-lg mx-auto">
      <div className="w-16 h-16 rounded-full bg-error/8 flex items-center justify-center mx-auto mb-4">
        <span className="material-symbols-outlined text-error text-[34px]">cloud_off</span>
      </div>
      <h2 className="font-bold text-[18px] text-on-surface mb-1.5">Couldn't load companies</h2>
      <p className="text-[14px] text-outline mb-6 leading-relaxed">
        {message ?? "We couldn't reach the server. Please check your connection and try again."}
      </p>
      <button
        onClick={() => retryHydration()}
        className="inline-flex items-center gap-2 bg-primary text-on-primary px-5 py-2.5 rounded-xl font-bold text-[14px] hover:bg-primary-container transition-colors touch-press btn-press"
      >
        <span className="material-symbols-outlined text-[18px]">refresh</span> Try again
      </button>
    </div>
  );
}
