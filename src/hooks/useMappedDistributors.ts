import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe, isManagerRole, type AppRole } from "@/hooks/useAuth";

export type MappedDistributor = { id: string; name: string; city: string | null };

/**
 * Distributors the signed-in user may book/sell against.
 * - Manager roles (manager / ASE / ASM / business manager): only distributors
 *   assigned to them or to anyone in their reporting downline.
 * - Distributor role: their own firm.
 * - Everyone else: all distributors visible to them.
 */
export function useMappedDistributors(enabled = true) {
  const { data: me, roles } = useMe();
  const userId = me?.profile?.id ?? null;
  const ownDistributor = me?.profile?.distributor_id ?? null;
  const managerScoped = roles.some((r) => isManagerRole(r as AppRole));
  const isDistributor = me?.role === "distributor";

  return useQuery({
    queryKey: ["mapped-distributors", userId, managerScoped, isDistributor, ownDistributor],
    enabled: enabled && !!userId,
    queryFn: async (): Promise<MappedDistributor[]> => {
      const { data: all, error } = await supabase
        .from("distributors")
        .select("id, name, city")
        .order("name");
      if (error) throw error;
      const list = (all ?? []) as MappedDistributor[];

      if (isDistributor && ownDistributor) return list.filter((d) => d.id === ownDistributor);
      if (!managerScoped) return list;

      const [{ data: profiles }, { data: assignments }] = await Promise.all([
        supabase.from("profiles").select("id, reports_to, distributor_id"),
        supabase.from("manager_assignments").select("manager_id, distributor_id"),
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
        if (a.distributor_id && a.manager_id && downline.has(a.manager_id)) ids.add(a.distributor_id);
      });
      (profiles ?? []).forEach((p) => {
        if (p.distributor_id && downline.has(p.id)) ids.add(p.distributor_id);
      });

      return list.filter((d) => ids.has(d.id));
    },
  });
}
