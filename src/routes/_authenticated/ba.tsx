import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, Boxes, CalendarDays, Download, MapPin, PackagePlus, ShoppingBag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { LeaveApply } from "@/components/sfa/LeaveApply";
import { Shell, StatCard, Section } from "@/components/sfa/Shell";
import { usePager } from "@/components/sfa/Pager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inr } from "@/lib/sfa";
import { downloadReportPdf } from "@/lib/report-pdf";
import { getPosition, useLocationTracking } from "@/hooks/useLocationTracking";

export const Route = createFileRoute("/_authenticated/ba")({
  head: () => ({
    meta: [
      { title: "Beauty Advisor Counter — POPPiK SFA" },
      { name: "description", content: "Store check-in with GPS, daily sales entry, purchase stock-in and opening stock for beauty advisors." },
      { property: "og:title", content: "Beauty Advisor Counter — POPPiK SFA" },
      { property: "og:description", content: "GPS check-in, mandatory daily sales entry and counter stock management." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BaPage,
});

const today = () => new Date().toISOString().slice(0, 10);

function BaPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const userId = me?.profile?.id;
  const retailerId = (me?.profile as { retailer_id?: string | null } | undefined)?.retailer_id ?? null;

  const [saleProduct, setSaleProduct] = useState("");
  const [saleQty, setSaleQty] = useState("1");
  const [saleRate, setSaleRate] = useState("");
  const [saleNote, setSaleNote] = useState("");

  const [inProduct, setInProduct] = useState("");
  const [inQty, setInQty] = useState("");
  const [inRef, setInRef] = useState("");
  const [inKind, setInKind] = useState<"purchase" | "opening">("purchase");
  const [saleSearch, setSaleSearch] = useState("");
  const [inSearch, setInSearch] = useState("");

  const { data } = useQuery({
    queryKey: ["ba-day", userId, retailerId],
    enabled: !!userId,
    queryFn: async () => {
      const monthStart = today().slice(0, 8) + "01";
      const [attendance, products, stock, sales, moves, outlet, target] = await Promise.all([
        supabase.from("attendance").select("*").eq("user_id", userId!).eq("work_date", today()).maybeSingle(),
        supabase.from("products").select("id, name, sku, mrp").order("name"),
        supabase.from("ba_stock").select("id, product_id, qty, products(name, sku)").eq("ba_id", userId!),
        supabase
          .from("ba_sales")
          .select("id, qty, rate, amount, notes, created_at, products(name)")
          .eq("ba_id", userId!)
          .eq("sale_date", today())
          .order("created_at", { ascending: false }),
        supabase
          .from("ba_stock_moves")
          .select("id, kind, qty, reference, created_at, products(name)")
          .eq("ba_id", userId!)
          .order("created_at", { ascending: false })
          .limit(15),
        retailerId
          ? supabase.from("retailers").select("name, city, address").eq("id", retailerId).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase
          .from("targets")
          .select("daily_target_amount")
          .eq("user_id", userId!)
          .eq("period_month", monthStart)
          .maybeSingle(),
      ]);
      return {
        attendance: attendance.data,
        products: products.data ?? [],
        stock: stock.data ?? [],
        sales: sales.data ?? [],
        moves: moves.data ?? [],
        outlet: outlet.data as { name: string; city: string | null; address: string | null } | null,
        dailyTarget: Number(target.data?.daily_target_amount ?? 0),
      };
    },
  });

  const products = data?.products ?? [];
  const stock = data?.stock ?? [];
  const sales = data?.sales ?? [];
  const salesValue = sales.reduce((s, r) => s + Number(r.amount), 0);
  const salesUnits = sales.reduce((s, r) => s + Number(r.qty), 0);
  const outlet = data?.outlet ?? null;
  const dailyTarget = Number(data?.dailyTarget ?? 0);
  const dailyAchievement = dailyTarget > 0 ? Math.min(100, Math.round((salesValue / dailyTarget) * 100)) : 0;
  const stockUnits = stock.reduce((s, r) => s + Number(r.qty), 0);
  const checkedIn = !!data?.attendance?.punch_in && !data?.attendance?.punch_out;
  const { last: livePoint, error: gpsError } = useLocationTracking(checkedIn, userId);

  const qtyOf = (productId: string) => Number(stock.find((s) => s.product_id === productId)?.qty ?? 0);

  const { paged: pagedStock, bar: stockBar } = usePager(stock, 5);
  const { paged: pagedMoves, bar: movesBar } = usePager(data?.moves ?? [], 5);

  const downloadStockStatement = () => {
    downloadReportPdf({
      fileName: `counter-stock-statement-${today()}.pdf`,
      title: "Counter Stock Statement",
      ...(outlet
        ? { subtitle: `${outlet.name}${outlet.city ? ` • ${outlet.city}` : ""}` }
        : {}),
      meta: [
        `Date: ${new Date().toLocaleDateString("en-IN")}`,
        `BA: ${me?.profile?.full_name || "-"}`,
        `Total units: ${stockUnits}`,
      ],
      tables: [
        {
          title: "Counter Stock",
          head: ["Product", "SKU", "Qty"],
          rows: stock.map((s) => [
            (s.products as { name: string } | null)?.name ?? "-",
            (s.products as { sku: string } | null)?.sku ?? "-",
            s.qty,
          ]),
        },
      ],
    });
  };


  const attend = useMutation({
    mutationFn: async (kind: "in" | "out") => {
      if (kind === "out" && sales.length === 0) {
        throw new Error("Please enter today's sales before check-out. Daily sales entry is mandatory.");
      }
      let pos: GeolocationPosition;
      try {
        pos = await getPosition();
      } catch (e) {
        throw new Error(
          `${(e as Error).message}. Please turn GPS on and allow location access to ${kind === "in" ? "check in" : "check out"}.`,
        );
      }
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (kind === "in") {
        const { error } = await supabase.from("attendance").upsert(
          { user_id: userId!, work_date: today(), punch_in: new Date().toISOString(), ...coords },
          { onConflict: "user_id,work_date" },
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("attendance")
          .update({ punch_out: new Date().toISOString(), ...coords })
          .eq("user_id", userId!)
          .eq("work_date", today());
        if (error) throw error;
      }
      await supabase.from("location_pings").insert({ user_id: userId!, work_date: today(), ...coords });
    },
    onSuccess: (_d, kind) => {
      toast.success(kind === "in" ? "Checked in at store" : "Checked out — have a good day!");
      qc.invalidateQueries({ queryKey: ["ba-day"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const applyStock = async (productId: string, nextQty: number) => {
    const existing = stock.find((s) => s.product_id === productId);
    if (existing) {
      const { error } = await supabase.from("ba_stock").update({ qty: nextQty }).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase
        .from("ba_stock")
        .insert({ ba_id: userId!, retailer_id: retailerId, product_id: productId, qty: nextQty });
      if (error) throw error;
    }
  };

  const addSale = useMutation({
    mutationFn: async () => {
      if (!checkedIn) throw new Error("Check in at the store before entering sales.");
      if (!saleProduct) throw new Error("Select a product");
      const qty = Number(saleQty);
      const rate = Number(saleRate || 0);
      if (!qty || qty <= 0) throw new Error("Enter a valid quantity");
      const available = qtyOf(saleProduct);
      if (qty > available) throw new Error(`Only ${available} pcs available in counter stock`);
      const { error } = await supabase.from("ba_sales").insert({
        ba_id: userId!,
        retailer_id: retailerId,
        product_id: saleProduct,
        sale_date: today(),
        qty,
        rate,
        amount: qty * rate,
        notes: saleNote || null,
      });
      if (error) throw error;
      await supabase.from("ba_stock_moves").insert({
        ba_id: userId!,
        retailer_id: retailerId,
        product_id: saleProduct,
        kind: "sale",
        qty: -qty,
        notes: saleNote || null,
      });
      await applyStock(saleProduct, available - qty);
    },
    onSuccess: () => {
      toast.success("Sale recorded");
      setSaleQty("1");
      setSaleNote("");
      qc.invalidateQueries({ queryKey: ["ba-day"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addStock = useMutation({
    mutationFn: async () => {
      if (!inProduct) throw new Error("Select a product");
      const qty = Number(inQty);
      if (!qty || qty <= 0) throw new Error("Enter a valid quantity");
      const current = qtyOf(inProduct);
      const next = inKind === "opening" ? qty : current + qty;
      const { error } = await supabase.from("ba_stock_moves").insert({
        ba_id: userId!,
        retailer_id: retailerId,
        product_id: inProduct,
        kind: inKind,
        qty: inKind === "opening" ? qty - current : qty,
        reference: inRef || null,
      });
      if (error) throw error;
      await applyStock(inProduct, next);
    },
    onSuccess: () => {
      toast.success(inKind === "opening" ? "Opening stock saved" : "Stock added to counter");
      setInQty("");
      setInRef("");
      qc.invalidateQueries({ queryKey: ["ba-day"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const greeting = new Date().getHours() < 12 ? "Good Morning" : new Date().getHours() < 17 ? "Good Afternoon" : "Good Evening";

  return (
    <Shell
      mobile
      title={`${greeting}, ${me?.profile?.full_name || "Beauty Advisor"}`}
      subtitle={`${outlet ? `${outlet.name}${outlet.city ? ` • ${outlet.city}` : ""} — ` : ""}${new Date().toDateString()}`}
      nav={[
        { to: "/ba", label: "Counter", icon: CalendarDays },
        { to: "/order-booking", label: "Book Order", icon: ShoppingBag },
        { to: "/ba-report", label: "Reports", icon: BarChart3 },
      ]}
    >
      <div className="rounded-2xl bg-[image:var(--gradient-brand)] p-5 text-primary-foreground shadow-[var(--shadow-lift)]">
        <p className="text-xs uppercase tracking-[0.2em] opacity-70">
          {outlet ? outlet.name : "Today's Counter Sale"}
        </p>
        {outlet ? <p className="text-[11px] opacity-70">Assigned outlet • Today's counter sale</p> : null}
        <p className="text-3xl font-semibold">{inr(salesValue)}</p>
        <p className="mt-1 text-sm opacity-80">
          {salesUnits} pcs sold • {sales.length} entries
        </p>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span>
            Daily target {dailyTarget > 0 ? inr(dailyTarget) : "not assigned"}
          </span>
          {dailyTarget > 0 ? <span>{dailyAchievement}% achieved</span> : null}
        </div>
        {dailyTarget > 0 ? (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-primary-foreground/20">
            <div className="h-full rounded-full bg-primary-foreground" style={{ width: `${dailyAchievement}%` }} />
          </div>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={attend.isPending || !!data?.attendance?.punch_out}
            onClick={() => attend.mutate(checkedIn ? "out" : "in")}
          >
            {data?.attendance?.punch_out
              ? "Day closed"
              : checkedIn
                ? "Check Out (GPS)"
                : "Check In at Store (GPS)"}
          </Button>
        </div>
        {checkedIn && sales.length === 0 ? (
          <p className="mt-2 text-xs opacity-90">Daily sales entry is mandatory before check-out.</p>
        ) : null}
      </div>

      {checkedIn && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-xs">
          <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${gpsError ? "text-destructive" : "text-primary"}`} />
          <div className="min-w-0">
            <p className="font-medium">{gpsError ? "GPS signal lost" : "Store location tracking on"}</p>
            <p className="break-words text-muted-foreground">
              {gpsError
                ? `${gpsError}. Keep GPS on until check-out.`
                : livePoint
                  ? `${livePoint.lat.toFixed(5)}, ${livePoint.lng.toFixed(5)} · updated ${new Date(livePoint.at).toLocaleTimeString()}`
                  : "Acquiring GPS position…"}
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-3 gap-3">
        <StatCard label="Sale Value" value={inr(salesValue)} tone="primary" />
        <StatCard label="Units Sold" value={String(salesUnits)} tone="success" />
        <StatCard label="Counter Stock" value={String(stockUnits)} tone="warning" />
      </div>

      <Tabs defaultValue="sale" className="mt-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="sale">Daily Sale</TabsTrigger>
          <TabsTrigger value="stock">Stock In</TabsTrigger>
        </TabsList>

        <TabsContent value="sale" className="mt-3 space-y-3">
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Select
                value={saleProduct}
                onValueChange={(v) => {
                  setSaleProduct(v);
                  const p = products.find((x) => x.id === v);
                  setSaleRate(String(p?.mrp ?? ""));
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input
                      autoFocus
                      value={saleSearch}
                      onChange={(e) => setSaleSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      placeholder="Search product…"
                      className="h-9"
                    />
                  </div>
                  {products
                    .filter((p) => {
                      const q = saleSearch.trim().toLowerCase();
                      return !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
                    })
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {qtyOf(p.id)} pcs
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Quantity</Label>
                <Input type="number" min="1" value={saleQty} onChange={(e) => setSaleQty(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Rate (₹)</Label>
                <Input type="number" min="0" value={saleRate} onChange={(e) => setSaleRate(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Remark (optional)</Label>
              <Textarea rows={2} value={saleNote} onChange={(e) => setSaleNote(e.target.value)} />
            </div>
            <Button className="w-full" disabled={addSale.isPending} onClick={() => addSale.mutate()}>
              <ShoppingBag className="size-4" /> Record Sale
            </Button>
          </div>

          <Section title="Today's Sales Entries">
            <div className="divide-y divide-border/60">
              {sales.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No sales entered yet today.</p>
              ) : (
                sales.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{(s.products as { name: string } | null)?.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {s.qty} pcs × {inr(s.rate)}
                        {s.notes ? ` • ${s.notes}` : ""}
                      </p>
                    </div>
                    <span className="shrink-0 tabular-nums font-semibold">{inr(s.amount)}</span>
                  </div>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="stock" className="mt-3 space-y-3">
          <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
            <div className="space-y-1.5">
              <Label>Entry type</Label>
              <Select value={inKind} onValueChange={(v) => setInKind(v as "purchase" | "opening")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="purchase">Purchase / Stock In</SelectItem>
                  <SelectItem value="opening">Opening Stock (set balance)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Product</Label>
              <Select value={inProduct} onValueChange={setInProduct}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  <div className="p-2">
                    <Input
                      autoFocus
                      value={inSearch}
                      onChange={(e) => setInSearch(e.target.value)}
                      onKeyDown={(e) => e.stopPropagation()}
                      placeholder="Search product…"
                      className="h-9"
                    />
                  </div>
                  {products
                    .filter((p) => {
                      const q = inSearch.trim().toLowerCase();
                      return !q || p.name.toLowerCase().includes(q) || (p.sku ?? "").toLowerCase().includes(q);
                    })
                    .map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} · {qtyOf(p.id)} pcs
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{inKind === "opening" ? "Opening qty" : "Received qty"}</Label>
                <Input type="number" min="1" value={inQty} onChange={(e) => setInQty(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Invoice / Ref</Label>
                <Input value={inRef} onChange={(e) => setInRef(e.target.value)} placeholder="INV-1024" />
              </div>
            </div>
            <Button className="w-full" disabled={addStock.isPending} onClick={() => addStock.mutate()}>
              <PackagePlus className="size-4" /> {inKind === "opening" ? "Save Opening Stock" : "Add Stock"}
            </Button>
          </div>

          <Section
            title="Counter Stock"
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={downloadStockStatement}>
                  <Download className="mr-1 size-3.5" /> Statement
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/opening-stock">Opening stock</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to="/stock-adjust">Adjust stock</Link>
                </Button>
              </div>
            }
          >
            <div className="divide-y divide-border/60">
              {stock.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No stock yet. Add opening stock to start.</p>
              ) : (
                pagedStock.map((s) => (
                  <div key={s.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{(s.products as { name: string } | null)?.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {(s.products as { sku: string } | null)?.sku}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 font-semibold ${Number(s.qty) === 0 ? "text-destructive" : Number(s.qty) <= 5 ? "text-warning" : "text-success"}`}
                    >
                      {s.qty} pcs
                    </span>
                  </div>
                ))
              )}
            </div>
            {stockBar}
          </Section>

          <Section title="Recent Stock Movements">
            <div className="divide-y divide-border/60">
              {(data?.moves ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No movements yet.</p>
              ) : (
                pagedMoves.map((m) => (
                  <div key={m.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{(m.products as { name: string } | null)?.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(m.created_at).toLocaleString()}
                        {m.reference ? ` • ${m.reference}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="secondary">{m.kind}</Badge>
                      <span className={`tabular-nums ${m.qty < 0 ? "text-destructive" : "text-success"}`}>
                        {m.qty > 0 ? `+${m.qty}` : m.qty}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
            {movesBar}
          </Section>
        </TabsContent>
      </Tabs>

      <div className="mt-4 flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-xs text-muted-foreground">
        <Boxes className="size-4 shrink-0 text-primary" />
        Sales entries reduce counter stock automatically; purchases and opening stock increase it.
      </div>
      <LeaveApply userId={userId} />
    </Shell>
  );
}
