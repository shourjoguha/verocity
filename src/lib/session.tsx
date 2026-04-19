/** Auth/session context: gate via global key + simple username pick. */
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sha256Hex } from "@/lib/crypto";
import { appConfig } from "@/config/app.config";

type AppUser = { id: string; display_name: string };

interface SessionCtx {
  unlocked: boolean;
  user: AppUser | null;
  unlock: (key: string) => Promise<boolean>;
  selectUser: (u: AppUser) => void;
  createUser: (name: string) => Promise<AppUser>;
  signOut: () => void;
  switchUser: () => void;
  loading: boolean;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = localStorage.getItem(appConfig.app.storageKeys.access);
    const usr = localStorage.getItem(appConfig.app.storageKeys.currentUser);
    if (u === "1") setUnlocked(true);
    if (usr) {
      try { setUser(JSON.parse(usr)); } catch { /* ignore */ }
    }
    setLoading(false);
  }, []);

  const unlock = useCallback(async (key: string) => {
    const hash = await sha256Hex(key);
    const { data, error } = await supabase.from("app_settings").select("access_key_hash").eq("id", 1).maybeSingle();
    if (error || !data) return false;
    const ok = data.access_key_hash === hash;
    if (ok) {
      localStorage.setItem(appConfig.app.storageKeys.access, "1");
      setUnlocked(true);
    }
    return ok;
  }, []);

  const selectUser = useCallback((u: AppUser) => {
    localStorage.setItem(appConfig.app.storageKeys.currentUser, JSON.stringify(u));
    setUser(u);
  }, []);

  const createUser = useCallback(async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("Name required");
    const { data: existing } = await supabase.from("app_users").select("*").eq("display_name", trimmed).maybeSingle();
    if (existing) {
      selectUser(existing as AppUser);
      return existing as AppUser;
    }
    const { data, error } = await supabase.from("app_users").insert({ display_name: trimmed }).select("*").single();
    if (error || !data) throw error ?? new Error("Could not create user");
    selectUser(data as AppUser);
    return data as AppUser;
  }, [selectUser]);

  const signOut = useCallback(() => {
    localStorage.removeItem(appConfig.app.storageKeys.access);
    localStorage.removeItem(appConfig.app.storageKeys.currentUser);
    setUnlocked(false);
    setUser(null);
  }, []);

  const switchUser = useCallback(() => {
    localStorage.removeItem(appConfig.app.storageKeys.currentUser);
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ unlocked, user, unlock, selectUser, createUser, signOut, switchUser, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSession() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useSession must be inside SessionProvider");
  return ctx;
}
