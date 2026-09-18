import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { Shell, StatCard, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr } from "@/lib/sfa";

export const Route = createFileRoute("/_authenticated/claims")({
  head: () => ({
    meta: [
      { title: "Margin & Display Claims — POPPiK SFA" },
      {
        name: "description",
        content: "Raise retailer-wise extra margin and display claims with an invoice copy and track admin approval status.",
      },
      { property: "og:title", content: "Margin & Display Claims — POPPiK SFA" },
      { property: "og:description", content: "Submit claims with invoice proof and see approved claim amounts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ClaimsPage,
});

function ClaimsPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const userId = me?.profile?.id;
  const myDistributorId = (me?.profile?.distributor_id as string | null) ?? null;

  const [retailerId, setRetailerId] = useState("");
  const [margin, setMargin] = useState("");
  const [display, setDisplay] = useState("");
  const [invoiceNo, setInvoiceNo] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const { data: retailers } = useQuery({
    queryKey: ["claim-retailers", myDistributorId],
    queryFn: async () => {
      let q = supabase.from("retailers").select("id, name, city, distributor_id").order("name");
      if (myDistributorId) q = q.eq("distributor_id", myDistributorId);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: claims } = useQuery({
    queryKey: ["my-claims", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("claims")
        .select("*, retailers(name, city)")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not signed in");
      if (!retailerId) throw new Error("Please choose a retailer");
      const marginN = Number(margin || 0);
      const displayN = Number(display || 0);
      if (marginN + displayN <= 0) throw new Error("Enter extra margin or display amount");
      if (!file) throw new Error("Please upload the invoice copy (PDF)");

      const ext = file.name.split(".").pop() || "pdf";
      const path = `${userId}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("claim-invoices")
        .upload(path, file, { contentType: file.type || "application/pdf" });
      if (upErr) throw upErr;

      const { error } = await supabase.from("claims").insert({
        created_by: userId,
        retailer_id: retailerId,
        distributor_id: myDistributorId,
        extra_margin: marginN,
        display_amount: displayN,
        invoice_no: invoiceNo || null,
        notes: notes || null,
        invoice_path: path,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Claim submitted for admin approval");
      setRetailerId("");
      setMargin("");
      setDisplay("");
      setInvoiceNo("");
      setNotes("");
      setFile(null);
      qc.invalidateQueries({ queryKey: ["my-claims"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openInvoice = async (path: string) => {
    const { data, error } = await supabase.storage.from("claim-invoices").createSignedUrl(path, 300);
    if (error || !data) {
      toast.error(error?.message ?? "Could not open invoice");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const list = claims ?? [];
  const pending = list.filter((c) => c.status === "pending").reduce((s, c) => s + Number(c.claim_amount ?? 0), 0);
  const approved = list.filter((c) => c.status === "approved").reduce((s, c) => s + Number(c.approved_amount ?? 0), 0);
  const rejected = list.filter((c) => c.status === "rejected").length;

  return (
    <Shell title="Claims" subtitle="Extra margin & display claims with invoice proof">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Pending Claims" value={inr(pending)} tone="warning" />
        <StatCard label="Approved by Company" value={inr(approved)} tone="success" />
        <StatCard label="Rejected" value={String(rejected)} tone="danger" />
      </div>

      <Section title="Raise a claim">
        <div className="grid gap-4 p-4 md:grid-cols-2">
          <div className="grid gap-2 md:col-span-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Retailer</Label>
            <Select value={retailerId} onValueChange={setRetailerId}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Choose retailer" />
              </SelectTrigger>
              <SelectContent>
                {(retailers ?? []).map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                    {r.city ? ` — ${r.city}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="margin" className="text-xs uppercase tracking-wider text-muted-foreground">
              Extra margin amount
            </Label>
            <Input id="margin" type="number" inputMode="decimal" value={margin} onChange={(e) => setMargin(e.target.value)} className="h-9" placeholder="0" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="display" className="text-xs uppercase tracking-wider text-muted-foreground">
              Display amount (if any)
            </Label>
            <Input id="display" type="number" inputMode="decimal" value={display} onChange={(e) => setDisplay(e.target.value)} className="h-9" placeholder="0" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="invno" className="text-xs uppercase tracking-wider text-muted-foreground">
              Invoice no. (optional)
            </Label>
            <Input id="invno" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} className="h-9" placeholder="INV-0001" />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="invfile" className="text-xs uppercase tracking-wider text-muted-foreground">
              Invoice copy (PDF)
            </Label>
            <Input
              id="invfile"
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="h-9"
            />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="cnotes" className="text-xs uppercase tracking-wider text-muted-foreground">
              Remarks
            </Label>
            <Textarea id="cnotes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Reason for claim…" />
          </div>

          <div className="flex items-center gap-3 md:col-span-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <FileUp className="mr-1 size-3.5" />}
              Submit claim
            </Button>
            <span className="text-sm text-muted-foreground">
              Claim total: <b className="tabular-nums">{inr(Number(margin || 0) + Number(display || 0))}</b>
            </span>
          </div>
        </div>
      </Section>

      <Section title={`My claims (${list.length})`}>
        <div className="divide-y divide-border/60">
          {list.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No claims raised yet.</p>
          ) : (
            list.map((c) => {
              const r = c.retailers as { name: string; city: string | null } | null;
              return (
                <div key={c.id} className="space-y-1 p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{r?.name ?? "Retailer"}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Margin {inr(c.extra_margin)} • Display {inr(c.display_amount)}
                        {c.invoice_no ? ` • ${c.invoice_no}` : ""} • {new Date(c.created_at).toLocaleDateString("en-IN")}
                      </p>
                      {c.status === "approved" ? (
                        <p className="text-[12px] font-medium text-emerald-600">
                          {inr(c.approved_amount ?? c.claim_amount)} claim approved by the company
                        </p>
                      ) : null}
                      {c.review_note ? <p className="text-[11px] text-muted-foreground">Admin note: {c.review_note}</p> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="tabular-nums font-semibold">{inr(c.claim_amount ?? 0)}</span>
                      <Badge variant={c.status === "approved" ? "default" : c.status === "rejected" ? "destructive" : "secondary"}>
                        {c.status}
                      </Badge>
                    </div>
                  </div>
                  {c.invoice_path ? (
                    <Button size="sm" variant="outline" onClick={() => openInvoice(c.invoice_path!)}>
                      View invoice
                    </Button>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      </Section>
    </Shell>
  );
}
