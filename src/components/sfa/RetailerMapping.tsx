import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "@/components/sfa/Shell";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EditRetailerDialog } from "@/components/sfa/EditRetailerDialog";
import { usePager } from "@/components/sfa/Pager";

type Retailer = {
  id: string;
  name: string;
  city: string | null;
  retailer_type: string;
  distributor_id: string | null;
};

/** Map retail outlets (including BA shops created at signup) to a distributor. */
export function RetailerMapping() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [view, setView] = useState<"all" | "mapped" | "unmapped">("all");

  const { data } = useQuery({
    queryKey: ["retailer-mapping"],
    queryFn: async () => {
      const [retailers, distributors] = await Promise.all([
        supabase.from("retailers").select("id, name, city, retailer_type, distributor_id").order("name"),
        supabase.from("distributors").select("id, name, city").order("name"),
      ]);
      return {
        retailers: (retailers.data ?? []) as Retailer[],
        distributors: (distributors.data ?? []) as { id: string; name: string; city: string | null }[],
      };
    },
  });

  const save = useMutation({
    mutationFn: async ({ id, distributorId }: { id: string; distributorId: string | null }) => {
      const { error } = await supabase.from("retailers").update({ distributor_id: distributorId }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Retail outlet mapping updated");
      qc.invalidateQueries({ queryKey: ["retailer-mapping"] });
      qc.invalidateQueries({ queryKey: ["salesman-day"] });
      qc.invalidateQueries({ queryKey: ["booking-master"] });
      qc.invalidateQueries({ queryKey: ["admin-dash"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not update mapping"),
  });

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (data?.retailers ?? []).filter((r) => {
      if (view === "mapped" && !r.distributor_id) return false;
      if (view === "unmapped" && r.distributor_id) return false;
      if (!term) return true;
      return `${r.name} ${r.city ?? ""}`.toLowerCase().includes(term);
    });
  }, [data?.retailers, q, view]);

  const unmapped = (data?.retailers ?? []).filter((r) => !r.distributor_id).length;
  const { paged, bar } = usePager(rows);

  return (
    <Section
      title="Retail Outlets"
      action={<Badge variant={unmapped ? "destructive" : "secondary"}>{unmapped} unmapped</Badge>}
    >
      <div className="flex flex-col gap-2 border-b border-border/60 p-3 sm:flex-row">
        <Input placeholder="Search outlet or city" value={q} onChange={(e) => setQ(e.target.value)} className="h-9" />
        <Select value={view} onValueChange={(v) => setView(v as typeof view)}>
          <SelectTrigger className="h-9 sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All outlets</SelectItem>
            <SelectItem value="mapped">Mapped</SelectItem>
            <SelectItem value="unmapped">Not mapped</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="divide-y divide-border/60">
        {rows.length === 0 ? <p className="p-4 text-sm text-muted-foreground">No outlets found.</p> : null}
        {paged.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div className="min-w-0">
              <p className="truncate font-medium">{r.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {r.city ?? "—"} • {r.retailer_type?.toUpperCase()}
              </p>
            </div>
            <div className="flex items-center gap-2">
            <EditRetailerDialog retailerId={r.id} invalidateKeys={["retailer-mapping", "salesman-day", "booking-master", "admin-dash"]} />
            <Select
              value={r.distributor_id ?? "none"}
              onValueChange={(v) => save.mutate({ id: r.id, distributorId: v === "none" ? null : v })}
            >
              <SelectTrigger className="h-9 w-56 text-xs">
                <SelectValue placeholder="Map to distributor" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Not mapped</SelectItem>
                {(data?.distributors ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                    {d.city ? ` — ${d.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            </div>
          </div>
        ))}
      </div>
      {bar}
    </Section>
  );
}
