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
import { useMe } from "@/hooks/useAuth";

const MODES = ["Cash", "UPI", "Cheque", "NEFT/RTGS"];

export const Route = createFileRoute("/_authenticated/payment-out")({
  head: () => ({
    meta: [
      { title: "Payment Out — POPPiK SFA" },
      { name: "description", content: "Record outgoing payments with approval-based settlement." },
      { property: "og:title", content: "Payment Out — POPPiK SFA" },
      { property: "og:description", content: "Record payments with approval-based outstanding settlement." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PaymentOutPage,
});

function PaymentOutPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const role = me?.role;
  const isCsa = role === "csa";
  const myDistributorId = (me?.profile?.distributor_id as string | null) ?? null;
  const myCsaId = (me?.profile?.csa_id as string | null) ?? null;

  const [distributorId, setDistributorId] = useState("");
  const [csaId, setCsaId] = useState("");
  const [depotId, setDepotId] = useState("");
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("Cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  // Query parties for Distributor flow
  const { data: distData } = useQuery({
    queryKey: ["payment-out-dist-parties"],
    enabled: !isCsa,
    queryFn: async () => {
      const [distributors, csas] = await Promise.all([
        supabase.from("distributors").select("id, name, city, outstanding, csa_id").order("name"),
        supabase.from("csas").select("id, name, city").order("name"),
      ]);
      return { distributors: distributors.data ?? [], csas: csas.data ?? [] };
    },
  });

  // Query parties for CSA flow (Depots and CSA profile)
  const { data: csaData } = useQuery({
    queryKey: ["payment-out-csa-parties", myCsaId],
    enabled: isCsa,
    queryFn: async () => {
      const [depots, csaInfo, invoices, collections] = await Promise.all([
        supabase.from("depots").select("id, name, city, state").order("name"),
        myCsaId
          ? supabase.from("csas").select("id, name, city, depot_id, depots(id, name, city)").eq("id", myCsaId).maybeSingle()
          : Promise.resolve({ data: null }),
        myCsaId
          ? supabase
              .from("invoices")
              .select("net_amount, orders!inner(csa_id, kind)")
              .eq("orders.csa_id", myCsaId)
              .eq("orders.kind", "depot")
          : Promise.resolve({ data: [] }),
        myCsaId
          ? (supabase
              .from("collections")
              .select("amount")
              .eq("csa_id" as any, myCsaId)
              .eq("status", "approved") as any)
          : Promise.resolve({ data: [] }),
      ]);

      const totalBilled = (invoices.data ?? []).reduce((s: number, i: any) => s + Number(i.net_amount || 0), 0);
      const totalPaid = ((collections.data as any[]) ?? []).reduce((s: number, c: any) => s + Number(c.amount || 0), 0);
      const balance = Math.max(0, totalBilled - totalPaid);

      return {
        depots: depots.data ?? [],
        csa: csaInfo.data ?? null,
        balance,
        totalBilled,
        totalPaid,
      };
    },
  });

  useEffect(() => {
    if (isCsa) {
      if (myCsaId) setCsaId(myCsaId);
      if (csaData?.csa?.depot_id) {
        setDepotId(csaData.csa.depot_id);
      } else if (csaData?.depots && csaData.depots.length > 0 && !depotId && csaData.depots[0]) {
        setDepotId(csaData.depots[0].id);
      }
    } else if (distData) {
      if (myDistributorId) {
        setDistributorId(myDistributorId);
        const d = distData.distributors.find((x) => x.id === myDistributorId);
        if (d?.csa_id) setCsaId(d.csa_id);
      }
    }
  }, [csaData, distData, isCsa, myCsaId, myDistributorId, depotId]);

  const selectedDistributor = (distData?.distributors ?? []).find((d) => d.id === distributorId) ?? null;
  const selectedDepot = (csaData?.depots ?? []).find((d) => d.id === depotId) ?? null;

  const save = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!amt || amt <= 0) throw new Error("Please enter a valid amount");

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Please sign in again");

      if (isCsa) {
        // CSA paying Master Depot -> save into collections with csa_id and status 'pending'
        const targetCsa = myCsaId || csaId;
        if (!targetCsa) throw new Error("CSA profile not found. Please log in again.");

        const { error } = await supabase.from("collections").insert({
          csa_id: targetCsa,
          salesman_id: uid,
          amount: amt,
          mode,
          reference: reference.trim() || null,
          status: "pending",
        } as any);

        if (error) throw error;
        return { isCsa: true, amt };
      } else {
        // Distributor paying CSA -> save into csa_payments
        if (!distributorId) throw new Error("Please select a distributor");
        if (!csaId) throw new Error("Please select a CSA");

        const { error } = await supabase
          .from("csa_payments")
          .insert({
            distributor_id: distributorId,
            csa_id: csaId,
            amount: amt,
            mode,
            reference: reference.trim() || null,
            notes: notes.trim() || null,
            created_by: uid,
            created_role: "distributor",
          });
        if (error) throw error;
        return { isCsa: false, amt };
      }
    },
    onSuccess: ({ isCsa, amt }) => {
      if (isCsa) {
        toast.success(`Payment of ${inr(amt)} sent to Master Depot for approval`);
        qc.invalidateQueries({ queryKey: ["csa-outgoing-payments"] });
        qc.invalidateQueries({ queryKey: ["csa-panel"] });
        qc.invalidateQueries({ queryKey: ["payment-out-csa-parties"] });
        navigate({ to: "/csa" });
      } else {
        toast.success("Payment sent to CSA for approval");
        qc.invalidateQueries({ queryKey: ["payment-out-dist-parties"] });
        qc.invalidateQueries({ queryKey: ["distributor-panel"] });
        navigate({ to: "/distributor" });
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell
      title={isCsa ? "Payment Out to Master Depot" : "Payment Out to CSA"}
      subtitle={
        isCsa
          ? "Record payment sent to Master Depot (Company). Ledger and balance will adjust once Depot approves."
          : "Send a payment entry to your CSA. Outstanding reduces once the CSA approves it."
      }
    >
      <Section title="Payment details">
        <div className="grid gap-4 p-4 md:grid-cols-2">
          {isCsa ? (
            <>
              <div>
                <Label>Master Depot / Company</Label>
                {csaData?.csa?.depots?.name ? (
                  <Input value={`${csaData.csa.depots.name}${csaData.csa.depots.city ? ` • ${csaData.csa.depots.city}` : ""}`} readOnly />
                ) : (
                  <Select value={depotId} onValueChange={setDepotId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select Master Depot" />
                    </SelectTrigger>
                    <SelectContent>
                      {(csaData?.depots ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} {d.city ? `• ${d.city}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {csaData ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Current balance payable: <span className="font-semibold text-foreground">{inr(csaData.balance)}</span>
                  </p>
                ) : null}
              </div>

              <div>
                <Label>CSA / Super Stockist (Self)</Label>
                <Input value={csaData?.csa?.name ?? me?.profile?.full_name ?? "CSA"} readOnly />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label>Distributor</Label>
                {myDistributorId ? (
                  <Input value={selectedDistributor?.name ?? ""} readOnly />
                ) : (
                  <Select value={distributorId} onValueChange={setDistributorId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select distributor" />
                    </SelectTrigger>
                    <SelectContent>
                      {(distData?.distributors ?? []).map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name} {d.city ? `• ${d.city}` : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {selectedDistributor ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Outstanding {inr(selectedDistributor.outstanding)}
                  </p>
                ) : null}
              </div>

              <div>
                <Label>CSA / Super Stockist</Label>
                <Select value={csaId} onValueChange={setCsaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select CSA" />
                  </SelectTrigger>
                  <SelectContent>
                    {(distData?.csas ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name} {c.city ? `• ${c.city}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div>
            <Label htmlFor="amount">Amount (₹)</Label>
            <Input id="amount" type="number" min={1} placeholder="Enter amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          <div>
            <Label>Payment Mode</Label>
            <Select value={mode} onValueChange={setMode}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="reference">Reference / UTR / Cheque no.</Label>
            <Input id="reference" placeholder="e.g. UTR12345678" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="notes">Remark (optional)</Label>
            <Textarea id="notes" rows={2} placeholder="Optional payment note" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-2 md:col-span-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Sending…" : isCsa ? "Send for Depot approval" : "Send for CSA approval"}
            </Button>
            <Button variant="outline" onClick={() => navigate({ to: isCsa ? "/csa" : "/distributor" })}>
              Cancel
            </Button>
          </div>
        </div>
      </Section>
    </Shell>
  );
}
