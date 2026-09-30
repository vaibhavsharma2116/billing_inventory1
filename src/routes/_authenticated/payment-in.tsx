import { useState } from "react";
import { createFileRoute, useNavigate, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Shell, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/sfa";
import { useMe } from "@/hooks/useAuth";

const MODES = ["Cash", "UPI", "Cheque", "NEFT/RTGS"];

export const Route = createFileRoute("/_authenticated/payment-in")({
  validateSearch: (s: Record<string, unknown>) => ({
    partyId: typeof s["retailer"] === "string" ? (s["retailer"] as string) : typeof s["partyId"] === "string" ? (s["partyId"] as string) : "",
  }),
  head: () => ({
    meta: [
      { title: "Payment In  POPPiK SFA" },
      { name: "description", content: "Record a payment received from a party." },
      { property: "og:title", content: "Payment In  POPPiK SFA" },
    ],
  }),
  component: PaymentInPage,
});

function PaymentInPage() {
  const { partyId } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const role = me?.role;

  const [party, setParty] = useState(partyId);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("Cash");
  const [reference, setReference] = useState("");

  const { data: partiesList } = useQuery({
    queryKey: ["payment-in-parties", role],
    queryFn: async () => {
      if (role === "depot") {
        const { data } = await supabase.from("csas").select("id, name, city").order("name");
        return (data ?? []).map(d => ({ ...d, outstanding: 0 }));
      } else if (role === "csa") {
        const { data } = await supabase.from("distributors").select("id, name, city, outstanding").order("name");
        return data ?? [];
      } else {
        const { data } = await supabase.from("retailers").select("id, name, city, outstanding").order("name");
        return data ?? [];
      }
    },
    enabled: !!role
  });
  
  const locked = partyId ? (partiesList ?? []).find((r) => r.id === partyId) : null;
  const partyLabel = role === "depot" ? "CSA" : role === "csa" ? "Distributor" : "Retailer";

  const save = useMutation({
    mutationFn: async () => {
      const target = partyId || party;
      const amt = Number(amount);
      if (!target) throw new Error(`Please select a ${partyLabel.toLowerCase()}`);
      if (!amt || amt <= 0) throw new Error("Please enter a valid amount");

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Please sign in again");

      const col = role === "depot" ? "csa_id" : role === "csa" ? "distributor_id" : "retailer_id";
      const status = (role === "depot" || role === "csa") ? "approved" : "pending";

      const { error } = await supabase.from("collections").insert({
        [col]: target,
        salesman_id: uid,
        amount: amt,
        mode,
        reference: reference || null,
        status,
      } as any);
      if (error) throw error;
      return { amt, status };
    },
    onSuccess: ({ amt, status }) => {
      if (status === "approved") {
        toast.success(`Payment of ${inr(amt)} recorded successfully and applied to ledger.`);
      } else {
        toast.success(`Payment of ${inr(amt)} sent for approval. Outstanding will update after approval.`);
      }
      for (const key of ["payment-in-parties", "distributor-panel", "salesman-day", "booking-master", "payment-in-history", "parties"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      router.history.back();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell title="Payment In" subtitle={`Record a collection from a ${partyLabel.toLowerCase()}`}>
      <Section title="Record Payment">
        <div className="grid gap-4 p-4">
          {locked ? (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium">{locked.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {locked.city ?? ""} {locked.outstanding > 0 ? `• current due ${inr(locked.outstanding)}` : ""}
              </p>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label>{partyLabel}</Label>
              <Select value={party} onValueChange={setParty}>
                <SelectTrigger>
                  <SelectValue placeholder={`Select ${partyLabel.toLowerCase()}`} />
                </SelectTrigger>
                <SelectContent>
                  {(partiesList ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} {r.outstanding > 0 ? `— due ${inr(r.outstanding)}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-1.5">
            <Label>Amount</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
            />
          </div>

          <div className="grid gap-1.5">
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

          <div className="grid gap-1.5">
            <Label>Reference (optional)</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="UPI ref / cheque no." />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={() => router.history.back()}>
              Cancel
            </Button>
            <Button className="flex-1" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? "Saving..." : "Save Payment"}
            </Button>
          </div>
          {role !== "depot" && role !== "csa" && (
            <p className="text-[11px] text-muted-foreground">
              This entry goes to the distributor for approval. The retailer's outstanding reduces only after approval.
            </p>
          )}
        </div>
      </Section>
    </Shell>
  );
}
