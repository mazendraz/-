import { useOutletContext } from "react-router-dom";

interface LayoutContext {
  openSearch: () => void;
}

/** Access the global search overlay opener from any page inside RootLayout. */
export function useSearchOverlay(): () => void {
  const ctx = useOutletContext<LayoutContext>();
  return ctx?.openSearch ?? (() => {});
}
