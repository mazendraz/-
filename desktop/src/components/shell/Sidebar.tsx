// Ported 1:1 in visual language from
// stitch_al_asima_command_center/executive_overview/code.html's <nav> — same
// colors, spacing, icons, active/hover states. The mockup's groups are flat
// links; here a group with children expands inline instead (see NAV in
// lib/navConfig.ts) rather than the mockup gaining sub-items it never had.
import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { NAV } from "@/lib/navConfig";
import { useAuth } from "@/lib/auth";

export function Sidebar() {
  const { user, can, logout } = useAuth();
  const location = useLocation();
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(NAV.filter((g) => g.children?.some((c) => location.pathname.startsWith(c.path))).map((g) => g.label)),
  );

  const visible = NAV.filter((group) => can(group.permission));

  function toggle(label: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <nav className="fixed left-0 top-0 h-screen w-64 flex flex-col py-gutter bg-surface-container-lowest border-r border-outline-variant z-50">
      <div className="px-gutter mb-8">
        <h1 className="font-headline-sm text-headline-sm font-bold tracking-tight text-primary">AL ASIMA</h1>
        <p className="font-body-sm text-body-sm text-on-surface-variant">Business Control Center</p>
      </div>

      <ul className="flex-1 px-4 space-y-2 overflow-y-auto">
        {visible.map((group) => {
          const isLeaf = Boolean(group.path);
          const isActive = isLeaf
            ? location.pathname === group.path
            : group.children?.some((c) => location.pathname.startsWith(c.path));
          const isOpen = expanded.has(group.label);

          return (
            <li key={group.label}>
              {isLeaf ? (
                <Link
                  to={group.path!}
                  className={navItemClass(Boolean(isActive))}
                >
                  <span className="material-symbols-outlined">{group.icon}</span>
                  <span className="font-body-md text-body-md">{group.label}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => toggle(group.label)}
                  aria-expanded={isOpen}
                  className={`w-full ${navItemClass(Boolean(isActive))} justify-between`}
                >
                  <span className="flex items-center space-x-3">
                    <span className="material-symbols-outlined">{group.icon}</span>
                    <span className="font-body-md text-body-md">{group.label}</span>
                  </span>
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                    {isOpen ? "expand_less" : "expand_more"}
                  </span>
                </button>
              )}

              {!isLeaf && isOpen && (
                <ul className="mt-1 ml-4 pl-4 border-l border-outline-variant space-y-1">
                  {group.children!.map((leaf) => {
                    const active = location.pathname.startsWith(leaf.path);
                    return (
                      <li key={leaf.path}>
                        <Link
                          to={leaf.path}
                          className={`flex items-center space-x-2 px-3 py-2 rounded-md font-body-sm text-body-sm transition-colors ${
                            active
                              ? "text-primary font-semibold bg-surface-container-high"
                              : "text-on-surface-variant hover:bg-surface-container"
                          }`}
                        >
                          <span className="material-symbols-outlined text-[18px]">{leaf.icon}</span>
                          <span>{leaf.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <div className="px-4 mt-auto pt-4">
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center justify-between px-4 py-3 rounded-lg text-on-surface-variant font-medium hover:bg-surface-container transition-colors"
        >
          <div className="flex items-center space-x-3">
            <span className="material-symbols-outlined">account_circle</span>
            <span className="font-body-md text-body-md truncate max-w-[120px]">{user?.name ?? "Account"}</span>
          </div>
          <span className="material-symbols-outlined text-[18px]">logout</span>
        </button>
      </div>
    </nav>
  );
}

function navItemClass(active: boolean): string {
  return [
    "flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors",
    active
      ? "text-primary font-bold bg-surface-container-high"
      : "text-on-surface-variant font-medium hover:bg-surface-container",
  ].join(" ");
}
