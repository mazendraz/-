import { useState } from "react";
import { useCategoriesWithCounts, type ServiceCategory } from "../../../lib/catalog";
import SearchInput from "../../../components/SearchInput";
import { CategoryEditor, CategoryCardActions } from "../CategoryEditor";
import { EmptyState } from "../components/EmptyState";
import { useLocale } from "../../../context/LocaleContext";
import { t, tCount } from "../../../lib/i18n";
import Icon from "../../../components/Icon";

export default function ServicesPage() {
  const { locale } = useLocale();
  const categories = useCategoriesWithCounts();
  const [categoryQuery, setCategoryQuery] = useState("");
  const [editingCategory, setEditingCategory] = useState<{ category: ServiceCategory | null } | null>(null);

  const catq = categoryQuery.trim().toLowerCase();
  const filteredCategories = categories.filter((c) => !catq || [c.label, c.description].some((v) => v.toLowerCase().includes(catq)));

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex-1 min-w-[200px]"><SearchInput value={categoryQuery} onChange={setCategoryQuery} placeholder={t(locale, "admin_categories_search")} /></div>
        {/* DM-17 pattern (missed in Phase 1's pass) — label is hidden below sm:. */}
        <button onClick={() => setEditingCategory({ category: null })} aria-label={t(locale, "admin_add_category")} className="flex items-center gap-1.5 bg-primary text-on-primary px-3 md:px-4 py-2 rounded-xl font-bold text-label hover:bg-primary-container transition-colors touch-press btn-press flex-shrink-0">
          <Icon name="add" className="text-subhead" /><span className="hidden sm:inline">{t(locale, "admin_add_category")}</span>
        </button>
      </div>
      <p className="text-label text-outline" role="status" aria-live="polite" aria-atomic="true">
        <span className="font-black text-on-surface">{filteredCategories.length}</span>
        {catq ? ` ${t(locale, "admin_cat_of")} ${categories.length}` : ""} {tCount(locale, "noun_category", filteredCategories.length)}
      </p>
      {filteredCategories.length === 0 ? (
        <div className="bg-surface-container-lowest rounded-2xl shadow-bloom"><EmptyState msg={t(locale, "admin_categories_none")} icon="search_off" /></div>
      ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCategories.map((cat) => (
          <div key={cat.slug} className="bg-surface-container-lowest rounded-2xl p-4 shadow-bloom">
            <div className="flex items-start gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-primary text-title" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true" translate="no">{cat.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-body text-on-surface truncate">{cat.label}</p>
                <p className="text-caption text-outline">{cat.count} {tCount(locale, "noun_company", cat.count)}</p>
              </div>
            </div>
            <p className="text-caption text-on-surface-variant mt-2 line-clamp-2">{cat.description}</p>
            <CategoryCardActions cat={cat} onEdit={() => setEditingCategory({ category: cat })} />
          </div>
        ))}
      </div>
      )}

      {editingCategory && (
        <CategoryEditor category={editingCategory.category} onClose={() => setEditingCategory(null)} />
      )}
    </div>
  );
}
