import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe, isManagerRole, type AppRole } from "@/hooks/useAuth";

export type MappedCsa = { id: string; name: string; city: string | null };

/**
 * CSAs the signed-in user may work against.
 * - Manager roles: CSAs assigned to them or anyone in their downline.
 * - CSA role: their own CSA.
 * - Everyone else: all visible CSAs.
 */
export function useMappedCsas(enabled = true) {
  const { data: me, roles } = useMe();
  const userId = me?.profile?.id ?? null;
  const ownCsa = me?.profile?.csa_id ?? null;
  const managerScoped = roles.some((r) => isManagerRole(r as AppRole));
  const isCsa = me?.role === "csa";

  return useQuery({
    queryKey: ["mapped-csas", userId, managerScoped, isCsa, ownCsa],
    enabled: enabled && !!userId,
    queryFn: async (): Promise<MappedCsa[]> => {
      const { data: all, error } = await supabase
        .from("csas")
        .select("id, name, city")
        .order("name");
      if (error) throw error;
      const list = (all ?? []) as MappedCsa[];

      if (isCsa && ownCsa) return list.filter((c) => c.id === ownCsa);
      if (!managerScoped) return list;

      const [{ data: profiles }, { data: assignments }] = await Promise.all([
        supabase.from("profiles").select("id, reports_to, csa_id"),
        supabase.from("manager_assignments").select("manager_id, csa_id"),
      ]);

      const downline = new Set<string>([userId!]);
      let grew = true;
      while (grew) {
        grew = false;
        (profiles ?? []).forEach((p) => {
          if (p.reports_to && downline.has(p.reports_to) && !downline.has(p.id)) {
            downline.add(p.id);
            grew = true;
          }
        });
      }

      const ids = new Set<string>();
      (assignments ?? []).forEach((a) => {
        if (a.csa_id && a.manager_id && downline.has(a.manager_id)) ids.add(a.csa_id);
      });
      (profiles ?? []).forEach((p) => {
        if (p.csa_id && downline.has(p.id)) ids.add(p.csa_id);
      });

      return list.filter((c) => ids.has(c.id));
    },
  });
}
