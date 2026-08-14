// Business Control Center — Global Search. Backs Header.tsx's search box
// (disabled since Stage "Step 13" per its own comment). Five small, capped
// prisma queries — one per category — run in parallel; nothing here builds a
// search index or duplicates a list screen's own filtering logic, it's a
// jump-to-record finder, not a second Reports/Ledger.
import { prisma } from "@/lib/prisma";
import type { ApiSearchCategory, ApiSearchResult } from "@/lib/apiTypes";

const RESULTS_PER_CATEGORY = 5;
const MIN_QUERY_LENGTH = 2;

function contains(q: string) {
  return { contains: q, mode: "insensitive" as const };
}

async function searchClients(q: string): Promise<ApiSearchResult[]> {
  const rows = await prisma.client.findMany({
    where: { OR: [{ name: contains(q) }, { phone: contains(q) }] },
    select: { id: true, name: true, phone: true },
    take: RESULTS_PER_CATEGORY,
  });
  return rows.map((r) => ({ category: "client", id: r.id, title: r.name, subtitle: r.phone, path: "/business/clients" }));
}

async function searchProviders(q: string): Promise<ApiSearchResult[]> {
  const rows = await prisma.company.findMany({
    where: { name: contains(q) },
    select: { id: true, name: true, categories: { where: { isPrimary: true }, take: 1, select: { category: { select: { label: true } } } } },
    take: RESULTS_PER_CATEGORY,
  });
  return rows.map((r) => ({
    category: "provider",
    id: r.id,
    title: r.name,
    subtitle: r.categories[0]?.category.label ?? "Provider",
    path: "/business/providers",
  }));
}

async function searchRequests(q: string): Promise<ApiSearchResult[]> {
  const rows = await prisma.lead.findMany({
    where: { OR: [{ refNumber: contains(q) }, { service: contains(q) }, { customerName: contains(q) }, { phone: contains(q) }] },
    select: { id: true, refNumber: true, service: true, customerName: true },
    take: RESULTS_PER_CATEGORY,
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    category: "request",
    id: r.id,
    title: r.refNumber,
    subtitle: `${r.service} — ${r.customerName}`,
    path: "/operations/requests",
  }));
}

async function searchServices(q: string): Promise<ApiSearchResult[]> {
  const rows = await prisma.offering.findMany({
    where: { name: contains(q) },
    select: { id: true, name: true, company: { select: { name: true } } },
    take: RESULTS_PER_CATEGORY,
  });
  return rows.map((r) => ({ category: "service", id: r.id, title: r.name, subtitle: r.company.name, path: "/business/services" }));
}

async function searchTransactions(q: string): Promise<ApiSearchResult[]> {
  const rows = await prisma.transaction.findMany({
    where: {
      OR: [
        { note: contains(q) },
        { company: { name: contains(q) } },
        { lead: { refNumber: contains(q) } },
      ],
    },
    select: { id: true, type: true, amount: true, note: true, company: { select: { name: true } }, lead: { select: { refNumber: true } } },
    take: RESULTS_PER_CATEGORY,
    orderBy: { occurredAt: "desc" },
  });
  return rows.map((r) => ({
    category: "transaction",
    id: r.id,
    title: `${r.type.replace("_", " ")} — ${r.amount} EGP`,
    subtitle: r.note ?? r.company?.name ?? r.lead?.refNumber ?? "—",
    path: "/finance/transactions",
  }));
}

const SEARCHERS: Record<ApiSearchCategory, (q: string) => Promise<ApiSearchResult[]>> = {
  client: searchClients,
  provider: searchProviders,
  request: searchRequests,
  service: searchServices,
  transaction: searchTransactions,
};

/**
 * Admin: cross-entity search. `categories` is decided by the ROUTE from the
 * caller's own desktopPermissions (see admin/search/route.ts) — this
 * function itself has no permission awareness, same division of
 * responsibility as every other service in this codebase.
 */
export async function globalSearch(query: string, categories: ApiSearchCategory[]): Promise<ApiSearchResult[]> {
  const q = query.trim();
  if (q.length < MIN_QUERY_LENGTH || categories.length === 0) return [];

  const resultSets = await Promise.all(categories.map((c) => SEARCHERS[c](q)));
  return resultSets.flat();
}
