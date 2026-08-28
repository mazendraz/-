#!/usr/bin/env node
/**
 * Auto-corrects the LAN IP baked into mobile/client/.env before every dev
 * start — see the "predev" hook in package.json.
 *
 * ── Why this exists ──────────────────────────────────────────────────────
 * EXPO_PUBLIC_API_URL and EXPO_PUBLIC_ASSET_URL are baked into the JS bundle
 * at build time (that's what the EXPO_PUBLIC_ prefix means), so they can't be
 * a relative path or "localhost" — Expo Go/the app runs on a PHONE, which
 * can't resolve the dev machine's loopback address, so a real LAN IP has to
 * be hardcoded in .env. Windows Wi-Fi renews that IP on nearly every
 * reconnect/sleep-wake, and when it does, .env silently goes stale: nothing
 * errors, the app just can't reach the API or load any image, and the fix
 * (found the hard way, twice, in one week) was always "notice the app is
 * dead, find the new IP by hand, edit .env, restart Expo". This automates
 * that loop away — every `npm start`/`npm run web` re-derives the IP fresh.
 *
 * Deliberately NOT solved by pointing at a stable hostname (mDNS/.local):
 * that trades one class of intermittent failure (stale IP) for another
 * (mDNS resolution flaking on this network), and is harder to debug when it
 * does. A LAN IP re-synced on every start is simpler and fully within this
 * script's control.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const ENV_PATH = path.join(__dirname, "..", ".env");

/** Best-guess "the" LAN IP: first non-internal IPv4 on a private range,
 *  preferring Wi-Fi/Ethernet-sounding interfaces over VPN/virtual adapters
 *  (Docker, WSL, Hyper-V, VPN clients all create their own private-range
 *  interfaces that are never reachable from a phone on the same Wi-Fi). */
function detectLanIp() {
  const nets = os.networkInterfaces();
  const candidates = [];
  for (const [name, addrs] of Object.entries(nets)) {
    for (const addr of addrs ?? []) {
      if (addr.family !== "IPv4" || addr.internal) continue;
      if (!/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(addr.address)) continue;
      candidates.push({ name, address: addr.address });
    }
  }
  if (candidates.length === 0) return null;

  const looksVirtual = /vethernet|virtual|docker|wsl|vpn|loopback|hyper-v/i;
  const real = candidates.filter((c) => !looksVirtual.test(c.name));
  return (real[0] ?? candidates[0]).address;
}

function main() {
  if (!fs.existsSync(ENV_PATH)) {
    console.log("[sync-lan-ip] no .env yet — skipping (copy .env.example first).");
    return;
  }

  const ip = detectLanIp();
  if (!ip) {
    console.log("[sync-lan-ip] couldn't detect a LAN IP — leaving .env untouched.");
    return;
  }

  let env = fs.readFileSync(ENV_PATH, "utf8");
  let changed = false;

  // Only rewrites the HOST portion of each URL — preserves whatever port/path
  // the developer already has (e.g. a non-default API port), and skips lines
  // that aren't pointed at a LAN IP at all (already "" or a real domain).
  for (const key of ["EXPO_PUBLIC_API_URL", "EXPO_PUBLIC_ASSET_URL"]) {
    const re = new RegExp(`^(${key}=")(https?://)(\\d{1,3}(?:\\.\\d{1,3}){3})(:\\d+)?([^"]*)(")`, "m");
    const match = env.match(re);
    if (!match) continue;
    const [, pre, scheme, oldIp, port, rest, post] = match;
    if (oldIp === ip) continue;
    env = env.replace(re, `${pre}${scheme}${ip}${port ?? ""}${rest}${post}`);
    console.log(`[sync-lan-ip] ${key}: ${oldIp} -> ${ip}`);
    changed = true;
  }

  if (changed) {
    fs.writeFileSync(ENV_PATH, env);
    console.log("[sync-lan-ip] .env updated. If Metro was already running, restart it to pick this up.");
  } else {
    console.log(`[sync-lan-ip] .env already matches current LAN IP (${ip}).`);
  }
}

main();
