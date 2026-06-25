import { describe, expect, it } from "vitest";
import { LeadStatus } from "@/generated/prisma/enums";
import {
  leadStatusFromLabel,
  leadStatusToLabel,
  serializeCategory,
  serializeCompany,
  serializeLead,
  toEpochMs,
  type CompanyWithRelations,
  type LeadWithCompany,
} from "@/lib/utils/serialize";
import type { ApiLeadStatus } from "@/lib/apiTypes";

describe("toEpochMs", () => {
  it("converts a Date to epoch milliseconds (number)", () => {
    const d = new Date("2026-06-21T10:00:00.000Z");
    expect(toEpochMs(d)).toBe(d.getTime());
    expect(typeof toEpochMs(d)).toBe("number");
  });
});

describe("lead status mapping", () => {
  const pairs: Array<[LeadStatus, ApiLeadStatus]> = [
    [LeadStatus.NEW, "New"],
    [LeadStatus.CONTACTED, "Contacted"],
    [LeadStatus.IN_PROGRESS, "In Progress"],
    [LeadStatus.COMPLETED, "Completed"],
    [LeadStatus.CANCELLED, "Cancelled"],
  ];

  it("maps enum → label and back for every status", () => {
    for (const [status, label] of pairs) {
      expect(leadStatusToLabel(status)).toBe(label);
      expect(leadStatusFromLabel(label)).toBe(status);
    }
  });
});

describe("serializeLead", () => {
  it("derives company fields, maps name/status, and emits epoch createdAt", () => {
    const createdAt = new Date("2026-06-21T09:30:00.000Z");
    const row: LeadWithCompany = {
      id: "lead-1",
      refNumber: "AA-20260621-7F3K",
      companyId: "co-1",
      service: "Full Interior Design",
      customerName: "Mona Adel",
      phone: "01012345678",
      district: "R7 District",
      budget: "EGP 150,000 – 500,000",
      description: "Need a full fit-out",
      status: LeadStatus.NEW,
      createdAt,
      updatedAt: createdAt,
      company: { slug: "aura-interiors", name: "Aura Interiors" },
    } as LeadWithCompany;

    expect(serializeLead(row)).toEqual({
      id: "lead-1",
      refNumber: "AA-20260621-7F3K",
      companySlug: "aura-interiors",
      companyName: "Aura Interiors",
      service: "Full Interior Design",
      name: "Mona Adel",
      phone: "01012345678",
      district: "R7 District",
      budget: "EGP 150,000 – 500,000",
      description: "Need a full fit-out",
      status: "New",
      createdAt: createdAt.getTime(),
    });
  });
});

describe("serializeCategory", () => {
  it("passes count through and coerces null cover to ''", () => {
    const cat = {
      id: "cat-1",
      slug: "interior-design",
      label: "Interior Design",
      description: "Designers & fit-out",
      icon: "chair",
      cover: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(serializeCategory(cat, 12)).toEqual({
      slug: "interior-design",
      label: "Interior Design",
      description: "Designers & fit-out",
      icon: "chair",
      cover: "",
      count: 12,
    });
  });
});

describe("serializeCompany", () => {
  it("derives category/categoryLabel and maps nested projects/reviews", () => {
    const now = new Date();
    const company: CompanyWithRelations = {
      id: "co-1",
      categoryId: "cat-1",
      slug: "aura-interiors",
      name: "Aura Interiors",
      tagline: "Calm, considered interiors",
      about: "We design homes.",
      logo: "logo.png",
      cover: "cover.jpg",
      services: ["Interior Design", "Fit-out"],
      gallery: ["g1.jpg", "g2.jpg"],
      badges: ["Licensed"],
      phone: "0223456789",
      location: "New Cairo",
      yearsExperience: 8,
      responseTime: "within 2 hours",
      verifiedSince: "2021",
      completedProjects: 87,
      rating: 4.8,
      reviewCount: 2,
      featured: true,
      verified: true,
      status: "ACTIVE",
      email: null,
      whatsapp: null,
      createdAt: now,
      updatedAt: now,
      category: { slug: "interior-design", label: "Interior Design" },
      projects: [
        {
          id: "p1",
          companyId: "co-1",
          title: "Villa R7",
          img: "p1.jpg",
          description: "Full villa",
          year: "2024",
          sortOrder: 0,
          createdAt: now,
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
          createdAt: now,
        },
      ],
    } as CompanyWithRelations;

    const out = serializeCompany(company);
    expect(out.category).toBe("interior-design");
    expect(out.categoryLabel).toBe("Interior Design");
    expect(out.projects).toEqual([
      {
        title: "Villa R7",
        img: "p1.jpg",
        description: "Full villa",
        year: "2024",
      },
    ]);
    expect(out.reviews).toEqual([
      {
        author: "Sara",
        avatar: "S",
        rating: 5,
        text: "Great work",
        date: "March 2024",
        district: "R7 District",
      },
    ]);
    // internal fields (email/whatsapp/status) must not leak into the payload
    expect(out).not.toHaveProperty("email");
    expect(out).not.toHaveProperty("status");
  });
});
