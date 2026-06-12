import { getCompanies } from "./catalog";
import { DISTRICTS, BUDGETS, addRawLeads, type Lead, type LeadStatus } from "./requests";

const NAMES = [
  "Mohamed Ahmed", "Sara Khaled", "Omar Hassan", "Layla Mostafa", "Ahmed Tarek",
  "Nour Adel", "Khaled Reda", "Dina Wael", "Youssef Samir", "Mariam Fouad",
  "Hassan Nabil", "Rania Sherif", "Tamer Galal", "Heba Ali", "Karim Sobhy",
  "Salma Ezzat", "Amr Fathy", "Yasmin Hany", "Sherif Bakr", "Mona Saleh",
];

const DESCRIPTIONS = [
  "Looking to fully finish a 180m² apartment in the New Capital.",
  "Need a complete smart-home system with CCTV and access control.",
  "Want a modern landscape design for my villa garden and pool.",
  "Interested in a full interior fit-out for a corporate office.",
  "Require custom furniture for a 3-bedroom penthouse.",
  "Planning a kitchen and bathroom renovation, premium finishes.",
  "Need a turnkey construction quote for a duplex.",
  "Looking for a consultation on a rooftop terrace design.",
];

// Weighted toward earlier funnel stages (realistic distribution)
const STATUS_POOL: LeadStatus[] = [
  "New", "New", "New", "New",
  "Contacted", "Contacted", "Contacted",
  "In Progress", "In Progress",
  "Completed", "Completed",
  "Cancelled",
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function refFor(ts: number): string {
  const d = new Date(ts);
  const date = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `AA-${date}-${rand}`;
}

function id(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : String(Date.now()) + Math.random().toString(16).slice(2);
}

/**
 * Inserts sample leads spread across the past ~28 days so the analytics
 * dashboards have realistic trends to display. Explicit admin action — never
 * runs automatically.
 */
export function loadDemoLeads(count = 48): number {
  const companies = getCompanies();
  if (companies.length === 0) return 0;

  const DAY = 86_400_000;
  const leads: Lead[] = [];
  for (let i = 0; i < count; i++) {
    const company = pick(companies);
    const service = company.services.length ? pick(company.services) : "General Inquiry";
    // Bias recent days slightly more than older ones
    const daysAgo = Math.floor(Math.pow(Math.random(), 1.5) * 28);
    const createdAt = Date.now() - daysAgo * DAY - Math.floor(Math.random() * DAY);
    leads.push({
      id: id(),
      refNumber: refFor(createdAt),
      companySlug: company.slug,
      companyName: company.name,
      service,
      name: pick(NAMES),
      phone: `+20 10${Math.floor(Math.random() * 9)} ${Math.floor(1000000 + Math.random() * 8999999)}`,
      district: pick(DISTRICTS),
      budget: pick(BUDGETS),
      description: pick(DESCRIPTIONS),
      status: pick(STATUS_POOL),
      createdAt,
    });
  }
  addRawLeads(leads);
  return leads.length;
}
