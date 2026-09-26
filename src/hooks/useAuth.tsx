import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AppRole =
  | "super_admin"
  | "depot"
  | "csa"
  | "distributor"
  | "manager"
  | "business_manager"
  | "asm"
  | "ase"
  | "salesman"
  | "hr"
  | "office"
  | "office_manager"
  | "ba";

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, user: session?.user ?? null as User | null, loading };
}

const ACTIVE_ROLE_KEY = "poppik.activeRole";

export function readActiveRole(userId?: string | null) {
  if (typeof window === "undefined" || !userId) return null;
  try {
    return window.localStorage.getItem(`${ACTIVE_ROLE_KEY}.${userId}`);
  } catch {
    return null;
  }
}

export function writeActiveRole(userId: string, role: string) {
  try {
    window.localStorage.setItem(`${ACTIVE_ROLE_KEY}.${userId}`, role);
  } catch {
    /* ignore */
  }
}

export function useMe() {
  const { session, loading } = useSession();
  const userId = session?.user.id;
  const [activeRole, setActive] = useState<string | null>(() => {
    if (typeof window === "undefined" || !userId) return null;
    return readActiveRole(userId);
  });

  useEffect(() => {
    setActive(readActiveRole(userId));
  }, [userId]);

  const query = useQuery({
    queryKey: ["me", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", userId!).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", userId!),
      ]);
      const list = (roles ?? []).map((r) => r.role as AppRole);
      // Sales managers (manager / ASE / ASM / business manager) also work the
      // field, so they always get the Field Sales dashboard as an extra role.
      if (list.some((r) => MANAGER_ROLES.includes(r)) && !list.includes("salesman")) {
        list.push("salesman");
      }
      const role = (list[0] ?? "salesman") as AppRole;
      return { profile, role, roles: list, email: session?.user.email ?? "" };
    },
  });

  const roles = query.data?.roles ?? [];
  const effectiveRole =
    activeRole && roles.includes(activeRole as AppRole)
      ? (activeRole as AppRole)
      : query.data?.role;


  const switchRole = (role: AppRole) => {
    if (!userId) return;
    writeActiveRole(userId, role);
    setActive(role);
  };

  return {
    ...query,
    data: query.data ? { ...query.data, role: effectiveRole as AppRole } : query.data,
    roles,
    switchRole,
    sessionLoading: loading,
    userId,
  };
}


export const roleHome: Record<AppRole, string> = {
  super_admin: "/admin",
  depot: "/depot",
  csa: "/csa",
  distributor: "/distributor",
  manager: "/manager",
  business_manager: "/manager",
  asm: "/manager",
  ase: "/manager",
  salesman: "/salesman",
  hr: "/hr",
  office: "/office",
  office_manager: "/office-manager",
  ba: "/ba",
};

export const roleLabel: Record<AppRole, string> = {
  super_admin: "Super Admin",
  depot: "Master Depot Admin",
  csa: "CSA / Super Stockist",
  distributor: "Distributor",
  manager: "Sales Manager",
  business_manager: "Business Manager",
  asm: "ASM (Area Sales Manager)",
  ase: "ASE (Area Sales Executive)",
  salesman: "Field Sales",
  hr: "HR / Payroll",
  office: "Office Employee",
  office_manager: "Office Manager",
  ba: "Beauty Advisor (BA)",
};

export const MANAGER_ROLES: AppRole[] = ["manager", "business_manager", "asm", "ase", "office_manager"];

export const isManagerRole = (role?: string | null) =>
  MANAGER_ROLES.includes(role as AppRole);
