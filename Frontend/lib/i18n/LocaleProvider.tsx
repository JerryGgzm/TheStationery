"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { patchProfile } from "@/lib/api";
import { getSupabase } from "@/lib/supabase";

import {
  catalogs,
  type Locale,
  type MessageKey,
  type Messages,
} from "./messages";

const STORAGE_KEY = "stationery.locale";

type Vars = Record<string, string | number>;

type LocaleContextValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  t: (key: MessageKey, vars?: Vars) => string;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function detectInitial(): Locale {
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    /* private mode / blocked storage */
  }
  const nav = window.navigator?.language ?? "";
  return nav.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function format(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] === undefined ? `{${name}}` : String(vars[name]),
  );
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [ready, setReady] = useState(false);

  // Read persisted / browser preference only on the client to avoid hydration
  // mismatches with Next static export.
  useEffect(() => {
    setLocaleState(detectInitial());
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      /* ignore */
    }
  }, [locale, ready]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    // Best-effort sync to the profile when signed in.
    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (!data.session) return;
        return patchProfile({ language_code: next });
      })
      .catch(() => {
        /* offline / not signed in — local preference still applies */
      });
  }, []);

  const messages: Messages = catalogs[locale];

  const t = useCallback(
    (key: MessageKey, vars?: Vars) => format(messages[key], vars),
    [messages],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useLocale must be used within LocaleProvider");
  }
  return ctx;
}

/** Shorthand when a component only needs the translator. */
export function useT() {
  return useLocale().t;
}
