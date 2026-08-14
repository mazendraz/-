// Ported 1:1 in visual language from the mockups' <header> TopNavBar. Both
// historically-inert elements are now wired up:
//   - Search → GET /admin/search (globalSearch.service.ts), debounced with
//     the same useDebouncedValue hook Operations' search box uses.
//   - Notifications → GET /admin/notifications (Phase 14), which reuses
//     desktopOverview.service.ts's recentActivity() feed rather than a new
//     Notification table — see that route's doc comment for why (a real
//     table needs a migration this environment can't run). Because there is
//     no persisted read state, "read" is tracked locally: the newest
//     `occurredAt` the user has opened the dropdown for is stashed in
//     localStorage (fine for a non-sensitive UI preference — unlike the auth
//     token, which deliberately avoids it; see secureToken.ts).
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { usePeriod, type PeriodTab } from "@/lib/dateRange";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { apiGet } from "@/lib/api";
import type {
  ApiNotification,
  ApiNotificationsResponse,
  ApiSearchCategory,
  ApiSearchResponse,
  ApiSearchResult,
} from "@/lib/apiTypes";

const TABS: { tab: PeriodTab; label: string }[] = [
  { tab: "today", label: "Today" },
  { tab: "week", label: "This Week" },
  { tab: "month", label: "This Month" },
  { tab: "custom", label: "Custom" },
];

export function Header() {
  const { user } = useAuth();
  const { tab, setTab, customDays, setCustomDays } = usePeriod();
  const [customOpen, setCustomOpen] = useState(false);

  const initial = (user?.name?.trim()[0] ?? "?").toUpperCase();

  return (
    <header className="fixed top-0 left-64 right-0 z-40 flex h-16 items-center justify-between border-b border-outline-variant bg-surface px-gutter">
      <div className="flex items-center space-x-6">
        <GlobalSearch />

        <nav className="flex h-full space-x-6">
          {TABS.map((t) => (
            <button
              key={t.tab}
              type="button"
              onClick={() => (t.tab === "custom" ? setCustomOpen((v) => !v) : setTab(t.tab))}
              className={`flex h-full items-center font-label-md text-label-md transition-colors ${
                tab === t.tab
                  ? "border-b-2 border-primary font-bold text-primary"
                  : "text-on-surface-variant hover:text-primary"
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        {customOpen && (
          <div className="flex items-center space-x-2 rounded-lg border border-outline-variant bg-surface-container-lowest px-3 py-1.5">
            <span className="font-body-sm text-body-sm text-on-surface-variant">Last</span>
            <input
              type="number"
              min={1}
              max={365}
              value={customDays}
              onChange={(e) => setCustomDays(Number(e.target.value) || 1)}
              onBlur={() => setTab("custom")}
              onKeyDown={(e) => e.key === "Enter" && setTab("custom")}
              className="w-14 rounded border border-outline-variant bg-transparent px-2 py-0.5 text-center font-mono-data text-mono-data"
            />
            <span className="font-body-sm text-body-sm text-on-surface-variant">days</span>
          </div>
        )}
      </div>

      <div className="flex items-center space-x-4">
        <NotificationBell />
        <Link
          to="/settings"
          className="rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
        >
          <span className="material-symbols-outlined">settings</span>
        </Link>
        <div className="flex h-8 w-8 items-center justify-center rounded-full border border-outline-variant bg-primary-container font-label-md text-label-md text-on-primary-container">
          {initial}
        </div>
      </div>
    </header>
  );
}

const CATEGORY_ICON: Record<ApiSearchCategory, string> = {
  client: "groups",
  provider: "storefront",
  request: "list_alt",
  service: "home_repair_service",
  transaction: "receipt_long",
};

const CATEGORY_LABEL: Record<ApiSearchCategory, string> = {
  client: "Clients",
  provider: "Providers",
  request: "Requests",
  service: "Services",
  transaction: "Transactions",
};

const MIN_QUERY_LENGTH = 2;

function GlobalSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<ApiSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debouncedQuery = useDebouncedValue(query, 350);

  useEffect(() => {
    const q = debouncedQuery.trim();
    if (q.length < MIN_QUERY_LENGTH) {
      // Setting loading/results synchronously on every debounced-query change
      // (not derived during render) is the same intentional, well-understood
      // exception useFetch.ts's own effect already documents — this is a
      // "fetch on dep change" effect, exactly the shape the rule expects to
      // flag defensively.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    apiGet<ApiSearchResponse>(`/admin/search?q=${encodeURIComponent(q)}`)
      .then((res) => {
        if (!cancelled) setResults(res.results);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery]);

  function goTo(result: ApiSearchResult) {
    setOpen(false);
    setQuery("");
    navigate(result.path);
  }

  const showDropdown = open && query.trim().length >= MIN_QUERY_LENGTH;
  const grouped = groupByCategory(results);

  return (
    <div className="relative">
      <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[18px]">
        search
      </span>
      <input
        type="text"
        placeholder="Search clients, providers, requests…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        className="w-64 rounded-lg border-none bg-surface-container-low py-2 pl-10 pr-4 font-body-sm text-body-sm text-on-surface placeholder:text-on-surface-variant/70 focus:ring-0"
      />

      {showDropdown && (
        <div className="absolute left-0 top-full z-50 mt-2 max-h-96 w-96 overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-lowest shadow-lift">
          {loading && <div className="p-4 font-body-sm text-body-sm text-on-surface-variant">Searching…</div>}
          {!loading && results.length === 0 && (
            <div className="p-4 font-body-sm text-body-sm text-on-surface-variant">No matches for &quot;{query}&quot;.</div>
          )}
          {!loading &&
            grouped.map(([category, items]) => (
              <div key={category} className="border-b border-surface-container-high last:border-0">
                <div className="bg-surface-container-low px-4 py-2 font-label-md text-label-md uppercase tracking-wider text-on-surface-variant">
                  {CATEGORY_LABEL[category]}
                </div>
                {items.map((r) => (
                  <button
                    key={`${r.category}-${r.id}`}
                    type="button"
                    // onMouseDown (not onClick) fires before the input's onBlur closes
                    // the dropdown, so the click still registers on this button.
                    onMouseDown={(e) => {
                      e.preventDefault();
                      goTo(r);
                    }}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-surface-bright"
                  >
                    <span className="material-symbols-outlined text-[18px] text-outline">{CATEGORY_ICON[r.category]}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-body-sm text-body-sm text-on-surface">{r.title}</p>
                      <p className="truncate font-body-sm text-body-sm text-on-surface-variant">{r.subtitle}</p>
                    </div>
                  </button>
                ))}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

function groupByCategory(results: ApiSearchResult[]): [ApiSearchCategory, ApiSearchResult[]][] {
  const order: ApiSearchCategory[] = ["client", "provider", "request", "service", "transaction"];
  const map = new Map<ApiSearchCategory, ApiSearchResult[]>();
  for (const r of results) {
    if (!map.has(r.category)) map.set(r.category, []);
    map.get(r.category)!.push(r);
  }
  return order.filter((c) => map.has(c)).map((c) => [c, map.get(c)!]);
}

const NOTIFICATIONS_SEEN_KEY = "al-asima-notifications-seen-until";
// No push/websocket transport exists — a small poll interval is the honest
// tradeoff for "the bell badge updates without a manual refresh" against
// the performance-discipline rule (one small GET, not a per-keystroke or
// per-render request).
const POLL_INTERVAL_MS = 60_000;

const NOTIFICATION_ICON: Record<ApiNotification["type"], string> = {
  new_request: "list_alt",
  service_completed: "task_alt",
  dispute_raised: "warning",
  commission_collected: "payments",
  new_client: "person_add",
};

function relativeTime(epochMs: number): string {
  const diffMs = Date.now() - epochMs;
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [seenUntil, setSeenUntil] = useState(() => Number(localStorage.getItem(NOTIFICATIONS_SEEN_KEY) ?? 0));

  useEffect(() => {
    let cancelled = false;
    function load() {
      apiGet<ApiNotificationsResponse>("/admin/notifications")
        .then((res) => {
          if (!cancelled) setNotifications(res.notifications);
        })
        .catch(() => {
          if (!cancelled) setNotifications([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const unreadCount = notifications.filter((n) => n.occurredAt > seenUntil).length;

  function handleOpen() {
    setOpen((v) => !v);
  }

  function markAllSeen() {
    const now = Date.now();
    localStorage.setItem(NOTIFICATIONS_SEEN_KEY, String(now));
    setSeenUntil(now);
  }

  function goTo(n: ApiNotification) {
    setOpen(false);
    navigate(n.path);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={handleOpen}
        onBlur={() => setOpen(false)}
        className="relative rounded-full p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-primary"
      >
        <span className="material-symbols-outlined">notifications</span>
        {unreadCount > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-error px-1 font-label-md text-[10px] leading-none text-on-error">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 max-h-96 w-96 overflow-y-auto rounded-lg border border-outline-variant bg-surface-container-lowest shadow-lift">
          <div className="flex items-center justify-between border-b border-outline-variant px-4 py-3">
            <span className="font-label-lg text-label-lg text-on-surface">Notifications</span>
            {unreadCount > 0 && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  markAllSeen();
                }}
                className="font-label-md text-label-md text-primary underline underline-offset-2"
              >
                Mark all as read
              </button>
            )}
          </div>
          {loading && <div className="p-4 font-body-sm text-body-sm text-on-surface-variant">Loading…</div>}
          {!loading && notifications.length === 0 && (
            <div className="p-4 font-body-sm text-body-sm text-on-surface-variant">Nothing recent.</div>
          )}
          {!loading &&
            notifications.map((n) => {
              const unread = n.occurredAt > seenUntil;
              return (
                <button
                  key={n.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    goTo(n);
                  }}
                  className={`flex w-full items-start gap-3 border-b border-surface-container-high px-4 py-3 text-left transition-colors last:border-0 hover:bg-surface-bright ${
                    unread ? "bg-primary/5" : ""
                  }`}
                >
                  <span className="material-symbols-outlined mt-0.5 text-[18px] text-outline">{NOTIFICATION_ICON[n.type]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-body-sm text-body-sm font-medium text-on-surface">{n.title}</p>
                    <p className="truncate font-body-sm text-body-sm text-on-surface-variant">{n.body}</p>
                    <p className="mt-0.5 font-body-sm text-body-sm text-on-surface-variant">{relativeTime(n.occurredAt)}</p>
                  </div>
                  {unread && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </button>
              );
            })}
        </div>
      )}
    </div>
  );
}
