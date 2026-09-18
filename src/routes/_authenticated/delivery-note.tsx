import { useEffect, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Shell, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/sfa";

export const Route = createFileRoute("/_authenticated/delivery-note")({
  head: () => ({
    meta: [
      { title: "Dispatch / LR Entry — POPPiK SFA" },
      { name: "description", content: "CSA dispatch entry with transporter name, LR number and transporter mobile for distributor deliveries." },
      { property: "og:title", content: "Dispatch / LR Entry — POPPiK SFA" },
      { property: "og:description", content: "Record LR details against a distributor order before the stock is received and activated." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    order: typeof s['order'] === "string" ? (s['order'] as string) : undefined,
  }),
  component: DeliveryNotePage,
});

function DeliveryNotePage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { order } = Route.useSearch();

  const [orderId, setOrderId] = useState(order ?? "");
  const [transporter, setTransporter] = useState("");
  const [lrNo, setLrNo] = useState("");
  const [mobile, setMobile] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [dispatchDate, setDispatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [remarks, setRemarks] = useState("");

  const { data } = useQuery({
    queryKey: ["delivery-note-orders"],
    queryFn: async () => {
      const [orders, deliveries] = await Promise.all([
        supabase
          .from("orders")
          .select("id, order_no, total_amount, status, distributor_id, csa_id, created_at, distributors(name, city)")
          .eq("kind", "primary")
          .in("status", ["dispatched", "invoiced", "accepted"])
          .order("created_at", { ascending: false }),
        supabase.from("deliveries").select("order_id, status"),
      ]);
      const done = new Set((deliveries.data ?? []).filter((d) => d.status !== "rejected").map((d) => d.order_id));
      return (orders.data ?? []).filter((o) => !done.has(o.id));
    },
  });

  useEffect(() => {
    if (!orderId && data && data.length > 0) setOrderId(data[0]!.id);
  }, [data, orderId]);

  const selected = (data ?? []).find((o) => o.id === orderId);

  const save = useMutation({
    mutationFn: async () => {
      if (!selected) throw new Error("Select an order to dispatch");
      if (!transporter.trim()) throw new Error("Transporter name is required");
      if (!lrNo.trim()) throw new Error("LR number is required");
      if (!/^\d{10}$/.test(mobile.trim())) throw new Error("Enter a valid 10-digit transporter mobile number");
      const { error } = await supabase.from("deliveries").insert({
        order_id: selected.id,
        distributor_id: selected.distributor_id!,
        csa_id: selected.csa_id,
        transporter_name: transporter.trim(),
        lr_no: lrNo.trim(),
        transporter_mobile: mobile.trim(),
        vehicle_no: vehicle.trim() || null,
        dispatch_date: dispatchDate,
        remarks: remarks.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Delivery submitted. Distributor will confirm receipt to activate the stock.");
      qc.invalidateQueries({ queryKey: ["deliveries"] });
      qc.invalidateQueries({ queryKey: ["delivery-note-orders"] });
      void navigate({ to: "/csa" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell title="Dispatch / LR Entry" subtitle="Transporter and LR details against a distributor order">
      <Section title="Delivery details">
        <div className="space-y-4 p-4">
          <div>
            <Label>Distributor order</Label>
            <Select value={orderId} onValueChange={setOrderId}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select order" />
              </SelectTrigger>
              <SelectContent>
                {(data ?? []).map((o) => (
                  <SelectItem key={o.id} value={o.id}>
                    {o.order_no} • {(o.distributors as { name: string } | null)?.name} • {inr(o.total_amount)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(data ?? []).length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">No dispatched orders awaiting LR details.</p>
            ) : null}
          </div>

          {selected ? (
            <p className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
              Consignee: <span className="font-medium text-foreground">{(selected.distributors as { name: string; city: string | null } | null)?.name}</span>
              {(selected.distributors as { city: string | null } | null)?.city ? `, ${(selected.distributors as { city: string | null } | null)?.city}` : ""}
            </p>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="transporter">Transporter name</Label>
              <Input id="transporter" className="mt-1" value={transporter} onChange={(e) => setTransporter(e.target.value)} placeholder="e.g. VRL Logistics" />
            </div>
            <div>
              <Label htmlFor="lr">LR number</Label>
              <Input id="lr" className="mt-1" value={lrNo} onChange={(e) => setLrNo(e.target.value)} placeholder="e.g. LR-99231" />
            </div>
            <div>
              <Label htmlFor="mobile">Transporter mobile</Label>
              <Input id="mobile" inputMode="numeric" maxLength={10} className="mt-1" value={mobile} onChange={(e) => setMobile(e.target.value.replace(/\D/g, ""))} placeholder="10-digit number" />
            </div>
            <div>
              <Label htmlFor="vehicle">Vehicle number (optional)</Label>
              <Input id="vehicle" className="mt-1" value={vehicle} onChange={(e) => setVehicle(e.target.value.toUpperCase())} placeholder="MH 12 AB 1234" />
            </div>
            <div>
              <Label htmlFor="ddate">Dispatch date</Label>
              <Input id="ddate" type="date" className="mt-1" value={dispatchDate} onChange={(e) => setDispatchDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="remarks">Remarks (optional)</Label>
            <Textarea id="remarks" className="mt-1" rows={3} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Number of cartons, freight terms, etc." />
          </div>

          <div className="flex gap-2">
            <Button disabled={save.isPending || !selected} onClick={() => save.mutate()}>
              Submit delivery
            </Button>
            <Button variant="outline" onClick={() => void navigate({ to: "/csa" })}>
              Cancel
            </Button>
          </div>
        </div>
      </Section>
    </Shell>
  );
}
