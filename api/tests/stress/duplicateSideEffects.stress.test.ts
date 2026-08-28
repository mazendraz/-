// The blast radius of a duplicated order.
//
// leadDuplication.stress.test.ts establishes that concurrent identical submits
// create several Lead rows. This file measures what that costs OUTSIDE the leads
// table, because that is what turns a database curiosity into a customer-visible
// incident:
//
//   • the signed-in customer gets one "we received your order" notification per
//     duplicate, on their phone
//   • the provider gets one chat thread per duplicate, each looking like a
//     separate job to quote
//   • the CRM's request-count for that client is inflated, which feeds the
//     admin's Clients screen and the "requests per client" KPI
//
// The assertions are written against the CORRECT outcome (one order → one of
// each), so this file goes green the moment the underlying race is fixed and
// stays as the regression test for the side effects specifically.
//
// The fan-out runs through runAfterResponse, which in a test context falls back
// to detached fire-and-forget — so `settle()` below waits for it rather than
// asserting immediately. That wait is the reason these live in their own file
// instead of being extra assertions on the duplication tests.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import { hashPassword, signCustomerToken } from "@/lib/auth";
import { POST as leadsPOST } from "@/app/api/leads/route";
import { burst, createFixture, destroyFixture, leadPayload, makeTag, req, statusTally, type Fixture } from "./helpers";

const tag = makeTag("side");
let f: Fixture;
let customerId = "";
let customerToken = "";

beforeAll(async () => {
  f = await createFixture(tag);
  const customer = await prisma.customerUser.create({
    data: {
      email: `${tag}-cust@test.local`,
      name: "Side Effects Customer",
      passwordHash: await hashPassword("side-effects-pass-1"),
      emailVerified: true,
      isActive: true,
    },
  });
  customerId = customer.id;
  customerToken = await signCustomerToken({ sub: customer.id });
});

afterAll(async () => {
  await destroyFixture(f);
});

/**
 * Give the detached notification fan-out a chance to finish.
 *
 * Polled rather than a flat sleep: a fixed delay is either flaky or slow, and
 * this settles as soon as the row count stops moving.
 */
async function settle(timeoutMs = 4_000): Promise<void> {
  let previous = -1;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 250));
    const current = await prisma.notification.count({ where: { customerId } });
    if (current === previous) return;
    previous = current;
  }
}

describe("one order → one of everything downstream", () => {
  it("sends the customer exactly ONE order-received notification for a double-tap", async () => {
    const payload = leadPayload(f.companySlug);

    const results = await burst(2, () =>
      leadsPOST(req("/api/leads", { method: "POST", body: payload, token: customerToken, ip: "10.60.0.1" })),
    );
    const tally = await statusTally(results as PromiseSettledResult<Response>[]);
    await settle();

    const notifications = await prisma.notification.findMany({
      where: { customerId, type: "LEAD_CREATED" },
      select: { title: true, body: true },
    });
    const leads = await prisma.lead.count({ where: { companyId: f.companyId, phone: payload.phone as string } });

    expect(
      notifications.length,
      `double-tap → ${leads} leads and ${notifications.length} push notifications ` +
        `(statuses: ${JSON.stringify(tally)}); bodies: ${notifications.map((n) => n.body).join(" | ")}`,
    ).toBe(1);
  });

  it("opens exactly ONE provider chat thread for a double-tap", async () => {
    // Each duplicate lead brings its own Conversation, so the provider's inbox
    // shows N separate threads for one customer asking once.
    const payload = leadPayload(f.companySlug);

    await burst(2, () => leadsPOST(req("/api/leads", { method: "POST", body: payload, token: customerToken, ip: "10.60.0.2" })));
    await settle();

    const leadIds = (
      await prisma.lead.findMany({ where: { companyId: f.companyId, phone: payload.phone as string }, select: { id: true } })
    ).map((l) => l.id);
    const threads = await prisma.conversation.count({ where: { leadId: { in: leadIds } } });

    expect(threads, `double-tap opened ${threads} chat threads across ${leadIds.length} leads`).toBe(1);
  });

  it("counts the customer's requests once per real order in the CRM", async () => {
    // Client.totalRequests drives the admin Clients table and the "requests per
    // client" KPI (clients.service.ts). Duplicates inflate both.
    const payload = leadPayload(f.companySlug);

    await burst(3, (i) =>
      leadsPOST(req("/api/leads", { method: "POST", body: payload, token: customerToken, ip: `10.60.1.${i + 1}` })),
    );
    await settle();

    const client = await prisma.client.findUnique({ where: { phone: payload.phone as string }, select: { id: true } });
    expect(client, "no Client row was created for the order").not.toBeNull();

    const counted = await prisma.lead.count({ where: { clientId: client!.id } });
    expect(counted, `one customer ordering once is recorded as ${counted} requests`).toBe(1);
  });
});
