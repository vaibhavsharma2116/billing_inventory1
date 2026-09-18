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

const MODES = ["Cash", "UPI", "Cheque", "NEFT/RTGS"];

export const Route = createFileRoute("/_authenticated/payment-in")({
  validateSearch: (s: Record<string, unknown>) => ({
    retailer: typeof s["retailer"] === "string" ? (s["retailer"] as string) : "",
  }),
  head: () => ({
    meta: [
      { title: "Payment In — POPPiK SFA" },
      { name: "description", content: "Record a payment received from a retailer and reduce their outstanding." },
      { property: "og:title", content: "Payment In — POPPiK SFA" },
      { property: "og:description", content: "Record retailer collections and update outstanding balances." },
    ],
  }),
  component: PaymentInPage,
});

function PaymentInPage() {
  const { retailer } = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const qc = useQueryClient();
  const [party, setParty] = useState(retailer);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState("Cash");
  const [reference, setReference] = useState("");

  const { data: retailers } = useQuery({
    queryKey: ["payment-in-retailers"],
    queryFn: async () => {
      const { data } = await supabase.from("retailers").select("id, name, city, outstanding").order("name");
      return data ?? [];
    },
  });
  const locked = retailer ? (retailers ?? []).find((r) => r.id === retailer) : null;

  const save = useMutation({
    mutationFn: async () => {
      const target = retailer || party;
      const amt = Number(amount);
      if (!target) throw new Error("Please select a retailer");
      if (!amt || amt <= 0) throw new Error("Please enter a valid amount");

      const { data: auth } = await supabase.auth.getUser();
      const uid = auth.user?.id;
      if (!uid) throw new Error("Please sign in again");

      const { error } = await supabase.from("collections").insert({
        retailer_id: target,
        salesman_id: uid,
        amount: amt,
        mode,
        reference: reference || null,
        status: "pending",
      });
      if (error) throw error;
      return amt;
    },
    onSuccess: (amt) => {
      toast.success(`Payment of ${inr(amt)} sent for distributor approval. Outstanding will update after approval.`);
      for (const key of ["payment-in-retailers", "distributor-panel", "salesman-day", "booking-master"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
      router.history.back();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell title="Payment In" subtitle="Record a collection from a retailer">
      <Section title="Record Payment">
        <div className="grid gap-4 p-4">
          {locked ? (
            <div className="rounded-lg bg-muted/50 p-3 text-sm">
              <p className="font-medium">{locked.name}</p>
              <p className="text-[11px] text-muted-foreground">
                {locked.city ?? ""} • current due {inr(locked.outstanding)}
              </p>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label>Retailer</Label>
              <Select value={party} onValueChange={setParty}>
                <SelectTrigger>
                  <SelectValue placeholder="Select retailer" />
                </SelectTrigger>
                <SelectContent>
                  {(retailers ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name} — due {inr(r.outstanding)}
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
              {save.isPending ? "Saving…" : "Save Payment"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            This entry goes to the distributor for approval. The retailer's outstanding reduces only after approval.
          </p>
        </div>
      </Section>
    </Shell>
  );
}
