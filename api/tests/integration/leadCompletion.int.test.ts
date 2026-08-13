// Service Completion & Final Price Verification.
//
// This feature decides what a customer is told they owe, so the properties that
// matter are the ones that keep the number honest and single-valued:
//
//   • a completion is recorded exactly once (leadId is UNIQUE)
//   • a provider can only complete their OWN company's lead
//   • the public verify endpoint is gated by ref + tracking token, and a wrong
//     token is indistinguishable from a wrong ref (both 404 — never confirm
//     which refNumbers exist)
//   • verification resolves exactly once, and a CONFIRMED amount is always the
//     provider's own total, never a number the client supplied
//   • a provider cannot reach COMPLETED without going through the form — the
//     backstop for the browser-side guard in LeadRows.tsx / LeadModal
//
// The last one is why this file exists: before it, PATCH /api/leads/[id] with
// {status:"Completed"} moved a lead to COMPLETED with no LeadCompletion row, no
// final amount, and the client's mandatory verification gate never firing.
import { NextRequest } from "next/server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signToken } from "@/lib/auth";

import { POST as completePOST } from "@/app/api/provider/leads/[id]/complete/route";
import { POST as verifyPOST } from "@/app/api/leads/verify/route";
import { PATCH as leadPATCH } from "@/app/api/leads/[id]/route";

const tag = `lc-${Date.now()}`;

let categoryId = "";
let companyId = "";
let otherCompanyId = "";
let providerToken = "";
let otherProviderToken = "";
let adminToken = "";

/** Each test gets its own lead: a completion is one-shot per lead by design. */
async function makeLead(service = "Completion fixture") {
  return prisma.lead.create({
    data: {
      companyId,
      refNumber: `AA-${tag}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
      trackingToken: `tok-${Math.random().toString(36).slice(2, 18)}`,
      customerName: "Test Customer",
      phone: "+201012345678",
      district: "R7",
      service,
      budget: "",
      description: "d",
      status: "NEW",
    },
  });
}

function jsonReq(url: string, body: unknown, token?: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json", "x-forwarded-for": "10.55.55.55" });
  if (token) headers.set("authorization", `Bearer ${token}`);
  return new NextRequest(`http://localhost${url}`, { method: "POST", headers, body: JSON.stringify(body) });
}

function patchReq(url: string, body: unknown, token: string): NextRequest {
  const headers = new Headers({ "content-type": "application/json", "x-forwarded-for": "10.55.55.55" });
  headers.set("authorization", `Bearer ${token}`);
  return new NextRequest(`http://localhost${url}`, { method: "PATCH", headers, body: JSON.stringify(body) });
}

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function mkCompany(suffix: string, name: string) {
  const company = await prisma.company.create({
    data: {
      categories: { create: [{ categoryId, isPrimary: true }] },
      slug: `${tag}-${suffix}`, name, tagline: "t", about: "a",
      logo: "/l.jpg", cover: "/c.jpg", services: [], gallery: [], badges: [],
      phone: "+201000000000", location: "NC", yearsExperience: 1,
      responseTime: "1h", verifiedSince: "2024", status: "ACTIVE",
    },
  });
  return company.id;
}

beforeAll(async () => {
  const category = await prisma.category.create({
    data: { slug: `${tag}-cat`, label: "Completion", description: "d", icon: "home" },
  });
  categoryId = category.id;

  companyId = await mkCompany("co", "Completion Co");
  otherCompanyId = await mkCompany("other", "Other Co");

  const passwordHash = await hashPassword("completion-test-pass");
  const provider = await prisma.user.create({
    data: { email: `${tag}-provider@test.local`, passwordHash, role: "PROVIDER", companyId, isActive: true, name: "P" },
  });
  const otherProvider = await prisma.user.create({
    data: { email: `${tag}-other@test.local`, passwordHash, role: "PROVIDER", companyId: otherCompanyId, isActive: true, name: "O" },
  });
  const admin = await prisma.user.create({
    data: { email: `${tag}-admin@test.local`, passwordHash, role: "ADMIN", isActive: true, name: "A" },
  });

  providerToken = await signToken({ sub: provider.id, role: "PROVIDER", companyId });
  otherProviderToken = await signToken({ sub: otherProvider.id, role: "PROVIDER", companyId: otherCompanyId });
  adminToken = await signToken({ sub: admin.id, role: "ADMIN", companyId: null });
});

afterAll(async () => {
  await prisma.leadCompletion.deleteMany({ where: { lead: { companyId: { in: [companyId, otherCompanyId] } } } });
  await prisma.review.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.lead.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.companyCategory.deleteMany({ where: { companyId: { in: [companyId, otherCompanyId] } } });
  await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
  await prisma.category.deleteMany({ where: { id: categoryId } });
});

describe("POST /api/provider/leads/[id]/complete", () => {
  it("records the completion, flips the lead to COMPLETED, and totals the additional work", async () => {
    const lead = await makeLead();
    const res = await completePOST(
      jsonReq(`/api/provider/leads/${lead.id}/complete`, {
        providerAmount: 45_000,
        additionalWork: { description: "Extra ceiling work", amount: 5_000 },
        notes: "done on site",
      }, providerToken),
      ctx(lead.id),
    );
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.status).toBe("Completed");
    expect(body.completion.providerAmount).toBe(45_000);
    expect(body.completion.additionalWorkAmount).toBe(5_000);
    // finalTotal is derived, never client-supplied.
    expect(body.completion.finalTotal).toBe(50_000);
    expect(body.completion.verificationStatus).toBe("PENDING");
    expect(body.completion.clientAmount).toBeNull();
  });

  it("omits additional work when the provider answered 'no'", async () => {
    const lead = await makeLead();
    const res = await completePOST(
      jsonReq(`/api/provider/leads/${lead.id}/complete`, { providerAmount: 1_000, additionalWork: null }, providerToken),
      ctx(lead.id),
    );
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.completion.additionalWorkAmount).toBeNull();
    expect(body.completion.finalTotal).toBe(1_000);
  });

  it("is one-shot — a second completion is a 409, not a silent overwrite", async () => {
    const lead = await makeLead();
    const first = await completePOST(
      jsonReq(`/api/provider/leads/${lead.id}/complete`, { providerAmount: 900, additionalWork: null }, providerToken),
      ctx(lead.id),
    );
    expect(first.status).toBe(201);

    const second = await completePOST(
      jsonReq(`/api/provider/leads/${lead.id}/complete`, { providerAmount: 1, additionalWork: null }, providerToken),
      ctx(lead.id),
    );
    expect(second.status).toBe(409);

    // The original amount survived the rejected attempt.
    const stored = await prisma.leadCompletion.findUnique({ where: { leadId: lead.id } });
    expect(stored?.providerAmount).toBe(900);
  });

  it("refuses a lead belonging to another company", async () => {
    const lead = await makeLead();
    const res = await completePOST(
      jsonReq(`/api/provider/leads/${lead.id}/complete`, { providerAmount: 10, additionalWork: null }, otherProviderToken),
      ctx(lead.id),
    );
    expect(res.status).toBe(403);
    expect(await prisma.leadCompletion.findUnique({ where: { leadId: lead.id } })).toBeNull();
  });

  it("rejects a negative amount", async () => {
    const lead = await makeLead();
    const res = await completePOST(
      jsonReq(`/api/provider/leads/${lead.id}/complete`, { providerAmount: -1, additionalWork: null }, providerToken),
      ctx(lead.id),
    );
    expect(res.status).toBe(400);
  });
});

describe("PATCH /api/leads/[id] — completion backstop", () => {
  it("blocks a provider from reaching COMPLETED without a completion record", async () => {
    const lead = await makeLead();
    const res = await leadPATCH(patchReq(`/api/leads/${lead.id}`, { status: "Completed" }, providerToken), ctx(lead.id));
    expect(res.status).toBe(409);

    const after = await prisma.lead.findUnique({ where: { id: lead.id }, select: { status: true } });
    expect(after?.status).toBe("NEW");
  });

  it("still lets a provider set every other status", async () => {
    const lead = await makeLead();
    const res = await leadPATCH(patchReq(`/api/leads/${lead.id}`, { status: "Contacted" }, providerToken), ctx(lead.id));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("Contacted");
  });

  it("lets a provider set COMPLETED once the completion exists", async () => {
    const lead = await makeLead();
    await completePOST(
      jsonReq(`/api/provider/leads/${lead.id}/complete`, { providerAmount: 500, additionalWork: null }, providerToken),
      ctx(lead.id),
    );
    // Move away and back again — a completed lead must stay manageable.
    await leadPATCH(patchReq(`/api/leads/${lead.id}`, { status: "In Progress" }, providerToken), ctx(lead.id));
    const res = await leadPATCH(patchReq(`/api/leads/${lead.id}`, { status: "Completed" }, providerToken), ctx(lead.id));
    expect(res.status).toBe(200);
  });

  it("does not take the direct set away from admins", async () => {
    const lead = await makeLead();
    const res = await leadPATCH(patchReq(`/api/leads/${lead.id}`, { status: "Completed" }, adminToken), ctx(lead.id));
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("Completed");
  });
});

describe("POST /api/leads/verify", () => {
  /** A lead already completed by the provider, ready for the client to verify. */
  async function completed(providerAmount = 45_000, extra = 5_000) {
    const lead = await makeLead();
    await completePOST(
      jsonReq(`/api/provider/leads/${lead.id}/complete`, {
        providerAmount,
        additionalWork: extra ? { description: "extra", amount: extra } : null,
      }, providerToken),
      ctx(lead.id),
    );
    return lead;
  }

  it("confirms the provider's own total — never a number the client sent", async () => {
    const lead = await completed();
    const res = await verifyPOST(
      // A client-supplied amount on the confirm path must be ignored outright.
      jsonReq("/api/leads/verify", { ref: lead.refNumber, token: lead.trackingToken, decision: "confirmed", clientAmount: 1 }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completion.verificationStatus).toBe("CONFIRMED");
    expect(body.completion.clientAmount).toBe(50_000);
    expect(body.completion.discrepancyNote).toBeNull();
    expect(body.completion.verifiedAt).not.toBeNull();
  });

  it("records a discrepancy with the client's amount and note", async () => {
    const lead = await completed();
    const res = await verifyPOST(
      jsonReq("/api/leads/verify", {
        ref: lead.refNumber, token: lead.trackingToken,
        decision: "discrepancy", clientAmount: 30_000, note: "I paid 30000",
      }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.completion.verificationStatus).toBe("DISCREPANCY");
    expect(body.completion.clientAmount).toBe(30_000);
    expect(body.completion.discrepancyNote).toBe("I paid 30000");
    // The provider's reported total is preserved alongside the dispute — the
    // admin arbitrating needs both numbers, not just the surviving one.
    expect(body.completion.finalTotal).toBe(50_000);
  });

  it("requires clientAmount when reporting a different amount", async () => {
    const lead = await completed();
    const res = await verifyPOST(
      jsonReq("/api/leads/verify", { ref: lead.refNumber, token: lead.trackingToken, decision: "discrepancy" }),
    );
    expect(res.status).toBe(400);
  });

  it("resolves exactly once", async () => {
    const lead = await completed();
    const first = await verifyPOST(
      jsonReq("/api/leads/verify", { ref: lead.refNumber, token: lead.trackingToken, decision: "confirmed" }),
    );
    expect(first.status).toBe(200);

    const second = await verifyPOST(
      jsonReq("/api/leads/verify", {
        ref: lead.refNumber, token: lead.trackingToken, decision: "discrepancy", clientAmount: 1,
      }),
    );
    expect(second.status).toBe(409);

    const stored = await prisma.leadCompletion.findUnique({ where: { leadId: lead.id } });
    expect(stored?.verificationStatus).toBe("CONFIRMED");
    expect(stored?.clientAmount).toBe(50_000);
  });

  it("409s when the provider has not completed the lead yet", async () => {
    const lead = await makeLead();
    const res = await verifyPOST(
      jsonReq("/api/leads/verify", { ref: lead.refNumber, token: lead.trackingToken, decision: "confirmed" }),
    );
    expect(res.status).toBe(409);
  });

  it("gives the SAME 404 for a wrong token and an unknown ref", async () => {
    const lead = await completed();

    const wrongToken = await verifyPOST(
      jsonReq("/api/leads/verify", { ref: lead.refNumber, token: "not-the-token", decision: "confirmed" }),
    );
    const unknownRef = await verifyPOST(
      jsonReq("/api/leads/verify", { ref: `AA-${tag}-NOPE`, token: "not-the-token", decision: "confirmed" }),
    );

    expect(wrongToken.status).toBe(404);
    expect(unknownRef.status).toBe(404);
    // Identical bodies too — a differing message would leak which refs exist.
    expect(await wrongToken.json()).toEqual(await unknownRef.json());

    // …and the rejected attempt left the completion untouched.
    const stored = await prisma.leadCompletion.findUnique({ where: { leadId: lead.id } });
    expect(stored?.verificationStatus).toBe("PENDING");
  });

  it("refuses the phone fallback for a token-bearing lead", async () => {
    const lead = await completed();
    const res = await verifyPOST(
      // Correct phone, no token: accepted only for legacy leads that predate the
      // trackingToken column, which this lead is not.
      jsonReq("/api/leads/verify", { ref: lead.refNumber, phone: "+201012345678", decision: "confirmed" }),
    );
    expect(res.status).toBe(404);
  });

  it("requires at least one secret", async () => {
    const lead = await completed();
    const res = await verifyPOST(
      jsonReq("/api/leads/verify", { ref: lead.refNumber, decision: "confirmed" }),
    );
    expect(res.status).toBe(400);
  });
});
