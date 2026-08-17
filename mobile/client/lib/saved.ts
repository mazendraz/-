/**
 * Saved / shortlisted companies — the mobile counterpart of the website's
 * useSaved.ts.
 *
 * Still DEVICE-LOCAL, matching the website's CURRENT (not account-synced)
 * behavior exactly — see that file's comment for why: moving this server-side
 * is real, separate work (merging a device list into an account list on first
 * sign-in has its own rules to get right), deliberately not done yet on
 * either client. Building mobile's version as account-synced while the
 * website's still isn't would be a NEW inconsistency, not a fix for an old
 * one — so this mirrors the website's actual behavior today, not the nicer
 * behavior either of us might want later.
 *
 * AsyncStorage here is the direct RN analogue of the website's localStorage
 * call — same shape, different storage primitive.
 */
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "al-assema-saved";
const listeners = new Set<() => void>();

async function read(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

async function write(slugs: string[]): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(slugs));
  listeners.forEach((l) => l());
}

export async function isSaved(slug: string): Promise<boolean> {
  return (await read()).includes(slug);
}

export async function toggleSaved(slug: string): Promise<boolean> {
  const current = await read();
  const next = current.includes(slug)
    ? current.filter((s) => s !== slug)
    : [...current, slug];
  await write(next);
  return next.includes(slug);
}

/** Reactive saved-state for one company — for the heart toggle on a card/profile. */
export function useIsSaved(slug: string): { saved: boolean; toggle: () => void } {
  const [saved, setSaved] = useState(false);

  const sync = useCallback(() => {
    read().then((slugs) => setSaved(slugs.includes(slug)));
  }, [slug]);

  useEffect(() => {
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, [sync]);

  return { saved, toggle: () => toggleSaved(slug) };
}

/** The full saved list, reactive — for a Saved screen. */
export function useSavedSlugs(): string[] {
  const [slugs, setSlugs] = useState<string[]>([]);

  const sync = useCallback(() => {
    read().then(setSlugs);
  }, []);

  useEffect(() => {
    sync();
    listeners.add(sync);
    return () => {
      listeners.delete(sync);
    };
  }, [sync]);

  return slugs;
}
