import MenuModal from "./MenuModal";
import { closeAppMenu, useAppMenuOpen } from "../lib/appMenu";

/**
 * The single mounted instance of the hamburger menu, rendered once by
 * app/_layout.tsx and driven by lib/appMenu.ts's store.
 *
 * A thin wrapper on purpose: <MenuModal> stays a plain visible/onClose
 * component with no knowledge of the store, so it is still testable and
 * still renderable on its own; this is the one place that binds it to the
 * app-wide state. Screens open it through <MenuButton>, never by mounting
 * another copy — which is what app/company/[slug].tsx used to do, and why the
 * menu existed on exactly one screen.
 */
export default function AppMenu() {
  const open = useAppMenuOpen();
  return <MenuModal visible={open} onClose={closeAppMenu} />;
}
