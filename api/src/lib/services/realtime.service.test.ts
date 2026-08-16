// The in-process pub/sub behind the live endpoints.
//
// Two properties matter here and neither is about delivery. Isolation: an event
// published to one channel must never reach a subscriber on another, because
// the channels are per-customer and per-company. And cleanup: a listener that
// is not removed on disconnect leaks for the lifetime of the process, and this
// hub sees one subscription per open app.
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_CHANNEL,
  channelForCompany,
  channelForCustomer,
  publish,
  publishAll,
  subscribe,
  subscriberCount,
  type RealtimeEvent,
} from "@/lib/services/realtime.service";

const MESSAGE: RealtimeEvent = { type: "message", leadId: "l1", conversationId: "c1" };

// The hub is module state shared across tests — every subscription made must be
// released, or a later test sees the previous one's listener.
const cleanups: (() => void)[] = [];
function track(off: () => void) {
  cleanups.push(off);
  return off;
}

beforeEach(() => {
  cleanups.splice(0).forEach((off) => off());
  expect(subscriberCount()).toBe(0);
});

describe("isolation", () => {
  it("delivers only to the addressed channel", () => {
    const mine = vi.fn();
    const theirs = vi.fn();
    track(subscribe(channelForCustomer("me"), mine));
    track(subscribe(channelForCustomer("someone-else"), theirs));

    publish(channelForCustomer("me"), MESSAGE);

    expect(mine).toHaveBeenCalledWith(MESSAGE);
    expect(theirs).not.toHaveBeenCalled();
  });

  it("keeps customer and company channels apart even for the same id string", () => {
    // Both take a uuid; without the prefix a customer and a company sharing an
    // id would land on one channel.
    const customer = vi.fn();
    const company = vi.fn();
    track(subscribe(channelForCustomer("same-id"), customer));
    track(subscribe(channelForCompany("same-id"), company));

    publish(channelForCompany("same-id"), MESSAGE);

    expect(company).toHaveBeenCalledOnce();
    expect(customer).not.toHaveBeenCalled();
  });

  it("publishing to a channel with no listeners is a no-op", () => {
    expect(() => publish("nobody-here", MESSAGE)).not.toThrow();
  });
});

describe("fan-out", () => {
  it("reaches every listener on a channel", () => {
    // One person, two devices — both have to be told.
    const phone = vi.fn();
    const laptop = vi.fn();
    track(subscribe(channelForCustomer("me"), phone));
    track(subscribe(channelForCustomer("me"), laptop));

    publish(channelForCustomer("me"), MESSAGE);

    expect(phone).toHaveBeenCalledOnce();
    expect(laptop).toHaveBeenCalledOnce();
  });

  it("publishAll reaches both sides of a conversation", () => {
    const customer = vi.fn();
    const company = vi.fn();
    const admin = vi.fn();
    track(subscribe(channelForCustomer("me"), customer));
    track(subscribe(channelForCompany("co"), company));
    track(subscribe(ADMIN_CHANNEL, admin));

    publishAll([channelForCustomer("me"), channelForCompany("co"), ADMIN_CHANNEL], MESSAGE);

    expect(customer).toHaveBeenCalledOnce();
    expect(company).toHaveBeenCalledOnce();
    expect(admin).toHaveBeenCalledOnce();
  });

  it("delivers once when a channel is listed twice", () => {
    // An admin who also belongs to a company appears on two channels for one
    // event; a duplicate delivery would double every row the client appends.
    const listener = vi.fn();
    track(subscribe(ADMIN_CHANNEL, listener));

    publishAll([ADMIN_CHANNEL, ADMIN_CHANNEL], MESSAGE);

    expect(listener).toHaveBeenCalledOnce();
  });

  it("one failing listener does not stop the others", () => {
    // A connection that died mid-write must not be able to silence everyone
    // else on the channel.
    const broken = vi.fn(() => {
      throw new Error("connection gone");
    });
    const healthy = vi.fn();
    track(subscribe(channelForCompany("co"), broken));
    track(subscribe(channelForCompany("co"), healthy));

    expect(() => publish(channelForCompany("co"), MESSAGE)).not.toThrow();
    expect(healthy).toHaveBeenCalledOnce();
  });
});

describe("cleanup", () => {
  it("stops delivering once unsubscribed", () => {
    const listener = vi.fn();
    const off = subscribe(channelForCustomer("me"), listener);
    off();

    publish(channelForCustomer("me"), MESSAGE);
    expect(listener).not.toHaveBeenCalled();
  });

  it("leaves nothing behind — the count returns to zero", () => {
    // The leak that matters: one subscription per open app, for the lifetime of
    // the process.
    const offs = [
      subscribe(channelForCustomer("a"), vi.fn()),
      subscribe(channelForCustomer("b"), vi.fn()),
      subscribe(channelForCompany("c"), vi.fn()),
    ];
    expect(subscriberCount()).toBe(3);

    offs.forEach((off) => off());
    expect(subscriberCount()).toBe(0);
  });

  it("unsubscribing twice is harmless", () => {
    const off = subscribe(channelForCustomer("me"), vi.fn());
    off();
    expect(() => off()).not.toThrow();
    expect(subscriberCount()).toBe(0);
  });

  it("removes one listener without disturbing the other on the same channel", () => {
    const stays = vi.fn();
    const goes = vi.fn();
    track(subscribe(channelForCustomer("me"), stays));
    const off = subscribe(channelForCustomer("me"), goes);
    off();

    publish(channelForCustomer("me"), MESSAGE);
    expect(stays).toHaveBeenCalledOnce();
    expect(goes).not.toHaveBeenCalled();
  });
});
