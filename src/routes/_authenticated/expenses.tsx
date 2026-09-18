import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, CalendarDays, Camera, Loader2, Receipt, ShoppingCart } from "lucide-react";
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

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "TA / DA & Expense Claims — POPPiK SFA" },
      { name: "description", content: "Log daily travel allowance, dearness allowance, travel tickets and hotel bills with photo proof." },
      { property: "og:title", content: "TA / DA & Expense Claims — POPPiK SFA" },
      { property: "og:description", content: "Daily TA/DA entry plus ticket and hotel bill upload for field salesmen." },
    ],
  }),
  component: ExpensesPage,
});

const KINDS = [
  { value: "ta_da", label: "Daily TA / DA" },
  { value: "travel_ticket", label: "Travel Ticket" },
  { value: "hotel", label: "Hotel Booking" },
  { value: "other", label: "Other Expense" },
] as const;

const kindLabel = (k: string) => KINDS.find((x) => x.value === k)?.label ?? k;
const todayStr = () => new Date().toISOString().slice(0, 10);

function ExpensesPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const userId = me?.profile?.id;

  const [kind, setKind] = useState<string>("ta_da");
  const [date, setDate] = useState(todayStr());
  const [km, setKm] = useState("");
  const [ta, setTa] = useState("");
  const [da, setDa] = useState("");
  const [bill, setBill] = useState("");
  const [route, setRoute] = useState("");
  const [vendor, setVendor] = useState("");
  const [notes, setNotes] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const isBillKind = kind === "travel_ticket" || kind === "hotel" || kind === "other";

  const { data: rows } = useQuery({
    queryKey: ["my-expenses", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("user_id", userId!)
        .order("expense_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => {
    setKm("");
    setTa("");
    setDa("");
    setBill("");
    setRoute("");
    setVendor("");
    setNotes("");
    setFile(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not signed in");
      const taN = Number(ta || 0);
      const daN = Number(da || 0);
      const billN = Number(bill || 0);
      if (taN + daN + billN <= 0) throw new Error("Enter at least one amount");
      if (isBillKind && !file) throw new Error("Please attach a photo of the bill");

      let receipt_path: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${userId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("expense-receipts").upload(path, file, {
          contentType: file.type || "image/jpeg",
        });
        if (upErr) throw upErr;
        receipt_path = path;
      }

      const { error } = await supabase.from("expenses").insert({
        user_id: userId,
        expense_date: date,
        kind,
        distance_km: Number(km || 0),
        ta_amount: taN,
        da_amount: daN,
        bill_amount: billN,
        route: route || null,
        vendor: vendor || null,
        notes: notes || null,
        receipt_path,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense claim submitted");
      reset();
      qc.invalidateQueries({ queryKey: ["my-expenses"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openReceipt = async (path: string) => {
    const { data, error } = await supabase.storage.from("expense-receipts").createSignedUrl(path, 300);
    if (error || !data) {
      toast.error(error?.message ?? "Could not open receipt");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const list = rows ?? [];
  const month = new Date().toISOString().slice(0, 7);
  const monthRows = list.filter((r) => r.expense_date.startsWith(month));
  const monthTotal = monthRows.reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
  const pending = monthRows.filter((r) => r.status === "pending").reduce((s, r) => s + Number(r.total_amount ?? 0), 0);
  const approved = monthRows.filter((r) => r.status === "approved").reduce((s, r) => s + Number(r.total_amount ?? 0), 0);

  return (
    <Shell
      mobile
      title="TA / DA & Expenses"
      subtitle="Daily allowance and travel bill claims"
      nav={[
        { to: "/salesman", label: "Today", icon: CalendarDays },
        { to: "/order-booking", label: "Book Order", icon: ShoppingCart },
        { to: "/expenses", label: "Expenses", icon: Receipt },
        { to: "/my-report", label: "Reports", icon: BarChart3 },
      ]}
    >
      <div className="grid grid-cols-3 gap-3">
        <StatCard label="This Month" value={inr(monthTotal)} tone="primary" />
        <StatCard label="Pending" value={inr(pending)} tone="warning" />
        <StatCard label="Approved" value={inr(approved)} tone="success" />
      </div>

      <Section title="New Claim">
        <div className="space-y-3 p-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Expense type</Label>
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {kind === "ta_da" ? (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>Distance (km)</Label>
                  <Input inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>TA (₹)</Label>
                  <Input inputMode="decimal" value={ta} onChange={(e) => setTa(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>DA (₹)</Label>
                  <Input inputMode="decimal" value={da} onChange={(e) => setDa(e.target.value)} placeholder="0" />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Route / beat covered</Label>
                <Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder="e.g. Karol Bagh → Rohini" />
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Bill amount (₹)</Label>
                  <Input inputMode="decimal" value={bill} onChange={(e) => setBill(e.target.value)} placeholder="0" />
                </div>
                <div className="space-y-1.5">
                  <Label>{kind === "hotel" ? "Hotel name" : "Vendor / operator"}</Label>
                  <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder={kind === "hotel" ? "Hotel Grand" : "IRCTC / Airline"} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>{kind === "hotel" ? "City / stay details" : "From → To"}</Label>
                <Input value={route} onChange={(e) => setRoute(e.target.value)} placeholder={kind === "hotel" ? "Jaipur, 2 nights" : "Delhi → Jaipur"} />
              </div>
            </>
          )}

          <div className="space-y-1.5">
            <Label>Notes</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional remarks" />
          </div>

          <div className="space-y-1.5">
            <Label>
              Bill photo {isBillKind ? <span className="text-destructive">*</span> : <span className="text-muted-foreground">(optional)</span>}
            </Label>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 px-3 py-3 text-sm text-muted-foreground">
              <Camera className="size-4" />
              <span className="truncate">{file ? file.name : "Take photo or choose bill image"}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          <Button className="w-full" disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            Submit claim
          </Button>
        </div>
      </Section>

      <Section title="My Claims">
        <div className="divide-y divide-border/60">
          {list.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No expense claims yet.</p>
          ) : (
            list.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{kindLabel(r.kind)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {r.expense_date}
                    {r.route ? ` • ${r.route}` : ""}
                    {r.vendor ? ` • ${r.vendor}` : ""}
                    {Number(r.distance_km) > 0 ? ` • ${r.distance_km} km` : ""}
                  </p>
                  {r.receipt_path ? (
                    <button
                      className="mt-1 text-[11px] font-medium text-primary underline"
                      onClick={() => openReceipt(r.receipt_path!)}
                    >
                      View bill photo
                    </button>
                  ) : null}
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular-nums font-semibold">{inr(Number(r.total_amount ?? 0))}</p>
                  <Badge variant={r.status === "approved" ? "default" : r.status === "rejected" ? "destructive" : "secondary"}>
                    {r.status}
                  </Badge>
                </div>
              </div>
            ))
          )}
        </div>
      </Section>
    </Shell>
  );
}
