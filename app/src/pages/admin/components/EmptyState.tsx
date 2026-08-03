// Re-exports the shared `<EmptyState>` (CMP-05) under its old admin-local name
// so the ~20 existing `import { EmptyState } from "./components/EmptyState"`
// call sites across the admin tabs don't all need touching. The real
// component now lives in `src/components/EmptyState.tsx` — used by public
// pages, admin, and the provider dashboard alike.
export { default as EmptyState } from "../../../components/EmptyState";
