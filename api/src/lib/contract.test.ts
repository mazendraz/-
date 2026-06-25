// Contract snapshots — lock the exact JSON shapes the frontend consumes
// (ApiPage<T>, raw object, ApiErrorBody) and the serializer outputs. If any of
// these change, the snapshot diff is a deliberate review gate against apiTypes.ts.
import { describe, expect, it } from "vitest";
import { LeadStatus } from "@/generated/prisma/enums";
import { ok, page, fail } from "@/lib/utils/response";
import {
  serializeCompany,
  serializeLead,
  type CompanyWithRelations,
  type LeadWithCompany,
} from "@/lib/utils/serialize";

const company = {
  id: "co-1",
  categoryId: "cat-1",
  slug: "aura-interiors",
  name: "Aura Interiors",
  tagline: "Calm, considered interiors",
  about: "We design homes.",
  logo: "/img/logo.jpg",
  cover: "/img/cover.jpg",
  services: ["Interior Design", "Fit-out"],
  gallery: ["/img/g1.jpg"],
  badges: ["Licensed"],
  phone: "0223456789",
  location: "New Cairo",
  yearsExperience: 8,
  responseTime: "within 2 hours",
  verifiedSince: "2021",
  completedProjects: 87,
  rating: 4.8,
  reviewCount: 1,
  featured: true,
  verified: true,
  status: "ACTIVE",
  email: "hi@aura.test",
  whatsapp: "201000000000",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  category: { slug: "interior-design", label: "Interior Design" },
  projects: [
    {
      id: "p1",
      companyId: "co-1",
      title: "Villa R7",
      img: "/img/p1.jpg",
      description: "Full villa",
      year: "2024",
      sortOrder: 0,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
  reviews: [
    {
      id: "r1",
      companyId: "co-1",
      author: "Sara",
      avatar: "S",
      rating: 5,
      text: "Great work",
      date: "March 2024",
      district: "R7 District",
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    },
  ],
} as CompanyWithRelations;

const lead = {
  id: "lead-1",
  refNumber: "AA-20260101-7F3K",
  companyId: "co-1",
  service: "Full Interior Design",
  customerName: "Mona Adel",
  phone: "01012345678",
  district: "R7 District",
  budget: "EGP 150,000 – 500,000",
  description: "Need a full fit-out",
  status: LeadStatus.NEW,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  company: { slug: "aura-interiors", name: "Aura Interiors" },
} as LeadWithCompany;

describe("serializer contract shapes", () => {
  it("ApiCompany (raw profile)", () => {
    expect(serializeCompany(company)).toMatchSnapshot();
  });

  it("ApiLead (createdAt as epoch ms)", () => {
    expect(serializeLead(lead)).toMatchSnapshot();
  });
});

describe("response envelope contract shapes", () => {
  it("raw single item (ok)", async () => {
    const res = ok(serializeLead(lead), 201);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchSnapshot();
  });

  it("ApiPage<T> (page)", async () => {
    const res = page([serializeCompany(company)], {
      total: 1,
      page: 1,
      pageSize: 20,
    });
    expect(await res.json()).toMatchSnapshot();
  });

  it("ApiErrorBody (fail)", async () => {
    const res = fail("VALIDATION_ERROR", "Phone number is invalid", 400, {
      phone: ["Invalid Egyptian mobile number"],
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchSnapshot();
  });
});
