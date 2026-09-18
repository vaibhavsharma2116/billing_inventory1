import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "@/components/sfa/Shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/sfa";

type Props = {
  /** "csa" shows all deliveries read-only, "distributor" can accept/reject */
  mode: "csa" | "distributor";
  distributorId?: string | null;
  action?: React.ReactNode;
};

const TONE: Record<string, "default" | "secondary" | "destructive"> = {
  in_transit: "default",
  received: "secondary",
  rejected: "destructive",
};

const LABEL: Record<string, string> = {
  in_transit: "In transit",
  received: "Received",
  rejected: "Rejected",
};

export function DeliveryList({ mode, distributorId, action }: Props) {
  const qc = useQueryClient();
  const [note, setNote] = useState<Record<string, string>>({});

  const { data: deliveries } = useQuery({
    queryKey: ["deliveries", mode, distributorId ?? "all"],
    queryFn: async () => {
      let q = supabase
        .from("deliveries")
        .select("*, distributors(name, city), csas(name, city), orders(order_no, total_amount)")
        .order("created_at", { ascending: false })
        .limit(200);
      if (mode === "distributor" && distributorId) q = q.eq("distributor_id", distributorId);
      const { data } = await q;
      return data ?? [];
    },
  });

  const receive = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await supabase.rpc("receive_delivery", {
        _id: id,
        _accept: accept,
        _note: note[id]?.trim() ?? "",
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(
        v.accept ? "Delivery received — stock released from reserve and ready for sale" : "Delivery rejected — reserved stock reversed",
      );
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      qc.invalidateQueries({ queryKey: ["distributor-panel"] });
      qc.invalidateQueries({ queryKey: ["csa-panel"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = deliveries ?? [];
  const inTransit = rows.filter((d) => d.status === "in_transit");

  return (
    <Section
      title={mode === "csa" ? "Dispatches to distributors" : "Incoming deliveries"}
      action={action}
    >
      {mode === "distributor" && inTransit.length > 0 ? (
        <p className="border-b border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground">
          {inTransit.length} consignment(s) in transit. Stock stays reserved until you accept the delivery.
        </p>
      ) : null}
      <div className="divide-y divide-border/60">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No deliveries yet.</p>
        ) : (
          rows.map((d) => {
            const ord = d.orders as { order_no: string; total_amount: number } | null;
            return (
              <div key={d.id} className="space-y-2 p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      LR {d.lr_no} • {d.transporter_name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {ord?.order_no ?? "Order"} • {(d.distributors as { name: string } | null)?.name}
                      {ord ? ` • ${inr(ord.total_amount)}` : ""}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Mobile {d.transporter_mobile ?? "—"}
                      {d.vehicle_no ? ` • Vehicle ${d.vehicle_no}` : ""} • Dispatched {d.dispatch_date}
                    </p>
                    {d.remarks ? <p className="text-[11px] text-muted-foreground">Remark: {d.remarks}</p> : null}
                    {d.receive_note ? <p className="text-[11px] text-muted-foreground">Receipt note: {d.receive_note}</p> : null}
                  </div>
                  <Badge variant={TONE[d.status] ?? "secondary"}>{LABEL[d.status] ?? d.status}</Badge>
                </div>

                {mode === "distributor" && d.status === "in_transit" ? (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      className="h-9 sm:flex-1"
                      placeholder="Receipt note (shortage, damage, etc.)"
                      value={note[d.id] ?? ""}
                      onChange={(e) => setNote((p) => ({ ...p, [d.id]: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" disabled={receive.isPending} onClick={() => receive.mutate({ id: d.id, accept: true })}>
                        Accept stock
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={receive.isPending}
                        onClick={() => receive.mutate({ id: d.id, accept: false })}
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </Section>
  );
}
