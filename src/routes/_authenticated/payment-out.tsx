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
      { title: "Payment Out to CSA — POPPiK SFA" },
      { name: "description", content: "Distributors pay their CSA and CSAs confirm the receipt to clear outstanding." },
      { property: "og:title", content: "Payment Out to CSA — POPPiK SFA" },
      { property: "og:description", content: "Record distributor payments to CSA with approval-based outstanding settlement." },
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
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("Cash");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");

  const { data } = useQuery({
    queryKey: ["payment-out-parties"],
    queryFn: async () => {
      const [distributors, csas] = await Promise.all([
        supabase.from("distributors").select("id, name, city, outstanding, csa_id").order("name"),
        supabase.from("csas").select("id, name, city").order("name"),
      ]);
      return { distributors: distributors.data ?? [], csas: csas.data ?? [] };
    },
  });

  useEffect(() => {
    if (!data) return;
    if (isCsa) {
      if (myCsaId) setCsaId(myCsaId);
    } else if (myDistributorId) {
      setDistributorId(myDistributorId);
      const d = data.distributors.find((x) => x.id === myDistributorId);
      if (d?.csa_id) setCsaId(d.csa_id);
    }
  }, [data, isCsa, myCsaId, myDistributorId]);

  const selectedDistributor = (data?.distributors ?? []).find((d) => d.id === distributorId) ?? null;

  const save = useMutation({
    mutationFn: async () => {
      const amt = Number(amount);
      if (!distributorId) throw new Error("Please select a distributor");
      if (!csaId) throw new Error("Please select a CSA");
      if (!amt || amt <= 0) throw new Error("Please enter a valid amount");

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Please sign in again");

      const { data: inserted, error } = await supabase
        .from("csa_payments")
        .insert({
          distributor_id: distributorId,
          csa_id: csaId,
          amount: amt,
          mode,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          created_by: uid,
          created_role: isCsa ? "csa" : "distributor",
        })
        .select("id")
        .single();
      if (error) throw error;

      // CSA-entered payments are self-approved immediately.
      if (isCsa && inserted) {
        const { error: rpcError } = await supabase.rpc("review_csa_payment", {
          _id: inserted.id,
          _approve: true,
          _note: "Entered by CSA",
        });
        if (rpcError) throw rpcError;
      }
      return isCsa;
    },
    onSuccess: (selfApproved) => {
      toast.success(selfApproved ? "Payment recorded and outstanding updated" : "Payment sent to CSA for approval");
      qc.invalidateQueries();
      navigate({ to: isCsa ? "/csa" : "/distributor" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell
      title={isCsa ? "Payment In from Distributor" : "Payment Out to CSA"}
      subtitle={
        isCsa
          ? "Manually record a payment received from a distributor. Outstanding updates instantly."
          : "Send a payment entry to your CSA. Outstanding reduces once the CSA approves it."
      }
    >
      <Section title="Payment details">
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div>
            <Label>Distributor</Label>
            {!isCsa && myDistributorId ? (
              <Input value={selectedDistributor?.name ?? ""} readOnly />
            ) : (
              <Select value={distributorId} onValueChange={setDistributorId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select distributor" />
                </SelectTrigger>
                <SelectContent>
                  {(data?.distributors ?? []).map((d) => (
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
            <Select value={csaId} onValueChange={setCsaId} disabled={isCsa && !!myCsaId}>
              <SelectTrigger>
                <SelectValue placeholder="Select CSA" />
              </SelectTrigger>
              <SelectContent>
                {(data?.csas ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name} {c.city ? `• ${c.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="amount">Amount</Label>
            <Input id="amount" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          <div>
            <Label>Mode</Label>
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
            <Input id="reference" value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>

          <div className="md:col-span-2">
            <Label htmlFor="notes">Remark (optional)</Label>
            <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <div className="flex gap-2 md:col-span-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : isCsa ? "Record payment" : "Send for CSA approval"}
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
