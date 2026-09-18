import { useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Warehouse } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { Shell, Section, StatCard } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { compactInr, inr } from "@/lib/sfa";
import { downloadInvoicePdf } from "@/lib/invoice-pdf";
import { toParty } from "@/lib/invoice-party";
import { DeliveryList } from "@/components/sfa/DeliveryList";

export const Route = createFileRoute("/_authenticated/depot")({
  head: () => ({
    meta: [
      { title: "Master Depot — POPPiK SFA" },
      { name: "description", content: "Master depot control: CSA purchase orders, depot stock, invoices and dispatch." },
      { property: "og:title", content: "Master Depot — POPPiK SFA" },
      { property: "og:description", content: "Approve CSA depot orders, invoice them and move stock down to super stockists." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: DepotPage,
});

function DepotPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: me, userId } = useMe();
  const profile = me?.profile as { depot_id?: string | null } | null | undefined;
  const myDepotId = profile?.depot_id ?? null;
  const [openCsa, setOpenCsa] = useState<string | null>(null);
  const [stockSearch, setStockSearch] = useState("");



  const { data } = useQuery({
    queryKey: ["depot-panel", myDepotId],
    queryFn: async () => {
      let orderQ = supabase
        .from("orders")
        .select("*, csas(*), depots(*), order_items(id, qty, free_qty, rate, amount, products(name))")
        .eq("kind", "depot")
        .order("created_at", { ascending: false });
      if (myDepotId) orderQ = orderQ.eq("depot_id", myDepotId);
      const [orders, stock, csas, depots, invoices, payouts] = await Promise.all([
        orderQ,
        myDepotId
          ? supabase.from("depot_stock").select("*, products(name, sku, pts)").eq("depot_id", myDepotId)
          : supabase.from("depot_stock").select("*, products(name, sku, pts)"),
        myDepotId
          ? supabase.from("csas").select("*").eq("depot_id", myDepotId).order("name")
          : supabase.from("csas").select("*").order("name"),
        supabase.from("depots").select("*").order("name"),
        supabase
          .from("invoices")
          .select("*, orders(order_no, kind, depot_id, csas(*), order_items(id, qty, free_qty, rate, amount, products(name)))")
          .order("created_at", { ascending: false }),
        supabase.from("expenses").select("*").order("expense_date", { ascending: false }).limit(200),
      ]);
      return {
        orders: orders.data ?? [],
        stock: stock.data ?? [],
        csas: csas.data ?? [],
        depots: depots.data ?? [],
        invoices: (invoices.data ?? []).filter((i) => {
          const o = i.orders as { kind: string; depot_id: string | null } | null;
          return o?.kind === "depot" && (!myDepotId || o.depot_id === myDepotId);
        }),
        payouts: payouts.data ?? [],
      };

    },
  });

  const orders = data?.orders ?? [];
  const pending = orders.filter((o) => o.status === "pending");
  const godownOrders = orders.filter((o) => (o.notes ?? "").startsWith("Godown sale"));
  const stockValue = (data?.stock ?? []).reduce(
    (s, r) => s + r.physical_qty * Number((r.products as { pts: number } | null)?.pts ?? 0),
    0,
  );
  const myDepot = (data?.depots ?? []).find((d) => d.id === myDepotId) ?? null;

  const filteredStock = (data?.stock ?? []).filter((s) => {
    const p = s.products as { name?: string; sku?: string } | null;
    const q = stockSearch.trim().toLowerCase();
    return !q || (p?.name ?? "").toLowerCase().includes(q) || (p?.sku ?? "").toLowerCase().includes(q);
  });

  const csaLedger = (data?.csas ?? []).map((c) => {

    const rows = (data?.invoices ?? []).filter(
      (i) => ((i.orders as { csas: { id?: string } | null } | null)?.csas as { id?: string } | null)?.id === c.id,
    );
    return {
      id: c.id,
      name: c.name,
      area: c.city ?? "—",
      billed: rows.reduce((s, i) => s + Number(i.net_amount), 0),
      bills: rows.length,
      billRows: rows.map((i) => ({
        id: i.id,
        invoiceNo: i.invoice_no,
        orderNo: (i.orders as { order_no: string } | null)?.order_no ?? "—",
        date: new Date(i.created_at).toLocaleDateString("en-IN"),
        amount: Number(i.net_amount),
      })),
    };
  });
  const payouts = data?.payouts ?? [];
  const payoutTotal = payouts.reduce((s, e) => s + Number(e.total_amount ?? 0), 0);



  if (me && !myDepotId) {
    return <DepotSetup depots={data?.depots ?? []} userId={userId} onDone={() => qc.invalidateQueries()} />;
  }

  return (
    <Shell title="Master Depot" subtitle={`${myDepot?.name ?? "Depot"} • CSA orders • stock • dispatch`}>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard
          label="Pending CSA Orders"
          value={String(pending.length)}
          tone="warning"
          onClick={() => navigate({ to: "/depot-report/$card", params: { card: "pending" } })}
        />
        <StatCard
          label="CSAs"
          value={String(data?.csas.length ?? 0)}
          onClick={() => navigate({ to: "/depot-report/$card", params: { card: "csas" } })}
        />
        <StatCard
          label="Depot Stock Value"
          value={compactInr(stockValue)}
          tone="success"
          onClick={() => navigate({ to: "/depot-report/$card", params: { card: "stockValue" } })}
        />
        <StatCard
          label="Depot Invoices"
          value={String(data?.invoices.length ?? 0)}
          tone="primary"
          onClick={() => navigate({ to: "/depot-report/$card", params: { card: "invoices" } })}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {(
          [
            ["orders", "All CSA orders"],
            ["billing", "Billing"],
            ["todayOrders", "Orders today"],
            ["lowStock", "Low stock"],
          ] as const
        ).map(([card, label]) => (
          <Button key={card} asChild size="sm" variant="outline">
            <Link to="/depot-report/$card" params={{ card }}>
              {label}
            </Link>
          </Button>
        ))}
        <Button asChild size="sm">
          <Link to="/company-purchase">Order from Company</Link>
        </Button>
        <Button asChild size="sm" variant="outline">
          <Link to="/business-reports" search={{ panel: "depot" }}>Analytics dashboard</Link>
        </Button>

      </div>

      <Tabs defaultValue="orders" className="mt-6">
        <TabsList>
          <TabsTrigger value="orders">CSA Orders{pending.length ? ` (${pending.length})` : ""}</TabsTrigger>
          <TabsTrigger value="godown">Godown Billing</TabsTrigger>
          <TabsTrigger value="stock">Depot Stock</TabsTrigger>
          <TabsTrigger value="invoices">Sales Invoices</TabsTrigger>
          <TabsTrigger value="delivery">Delivery Status</TabsTrigger>
          <TabsTrigger value="paymentin">Payment In</TabsTrigger>
          <TabsTrigger value="paymentout">Payment Out</TabsTrigger>
          <TabsTrigger value="ledger">Party Ledger</TabsTrigger>
        </TabsList>


        <TabsContent value="godown">
          <Section
            title="Godown Billing"
            action={
              <Button asChild size="sm">
                <Link to="/godown-sale">New godown bill</Link>
              </Button>
            }
          >
            <div className="divide-y divide-border/60">
              {godownOrders.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No manual godown bills yet.</p>
              ) : (
                godownOrders.map((o) => (
                  <div key={o.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {o.order_no} • {(o.csas as { name: string } | null)?.name ?? "CSA"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {(o.order_items ?? []).length} SKU • {new Date(o.created_at).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="font-semibold tabular-nums">{inr(o.total_amount)}</span>
                      <Badge variant="secondary">{o.status}</Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="delivery">
          <DeliveryList
            mode="csa"
            action={
              <Button asChild size="sm">
                <Link to="/delivery-note" search={{ order: undefined }}>Add LR / dispatch</Link>
              </Button>
            }
          />
        </TabsContent>

        <TabsContent value="paymentin">
          <Section title="Payment In — bills receivable from CSAs">
            <div className="divide-y divide-border/60">
              {(data?.invoices ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No CSA bills yet.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 bg-muted/40 p-3 text-sm">
                    <span className="font-medium">Total receivable</span>
                    <span className="font-semibold tabular-nums">
                      {inr((data?.invoices ?? []).reduce((s, i) => s + Number(i.net_amount), 0))}
                    </span>
                  </div>
                  {(data?.invoices ?? []).map((i) => {
                    const o = i.orders as { order_no: string; csas: { name: string } | null } | null;
                    return (
                      <div key={i.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{i.invoice_no}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {o?.csas?.name ?? "CSA"} • {o?.order_no ?? "—"} •{" "}
                            {new Date(i.created_at).toLocaleDateString("en-IN")}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold tabular-nums">{inr(i.net_amount)}</span>
                      </div>
                    );
                  })}
                </>
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="paymentout">
          <Section
            title="Payment Out — payouts booked by the depot"
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/expenses">Record payout</Link>
              </Button>
            }
          >
            <div className="divide-y divide-border/60">
              {payouts.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No outgoing payments booked yet.</p>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-3 bg-muted/40 p-3 text-sm">
                    <span className="font-medium">Total paid out</span>
                    <span className="font-semibold tabular-nums">{inr(payoutTotal)}</span>
                  </div>
                  {payouts.map((e) => (
                    <div key={e.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{e.kind}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {new Date(e.expense_date).toLocaleDateString("en-IN")} • {e.vendor || e.route || "—"} • {e.status}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">{inr(Number(e.total_amount ?? 0))}</span>
                    </div>
                  ))}
                </>
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="ledger">
          <Section
            title="CSA-wise ledger"
            action={
              <Button asChild size="sm" variant="outline">
                <Link to="/party-ledger">All parties</Link>
              </Button>
            }
          >
            <div className="divide-y divide-border/60">
              {csaLedger.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No CSA ledgers yet.</p>
              ) : (
                csaLedger.map((p) => (
                  <div key={p.id}>
                    <button
                      type="button"
                      onClick={() => setOpenCsa(openCsa === p.id ? null : p.id)}
                      className="flex w-full items-center justify-between gap-3 p-3 text-left text-sm transition-colors hover:bg-muted/50"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-medium">{p.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {p.area} • Billed {inr(p.billed)} • {p.bills} bill(s)
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold tabular-nums">{inr(p.billed)}</span>
                    </button>
                    {openCsa === p.id ? (
                      <div className="bg-muted/30 px-3 pb-3">
                        {p.billRows.length === 0 ? (
                          <p className="py-2 text-[12px] text-muted-foreground">No bills for this CSA yet.</p>
                        ) : (
                          p.billRows.map((b) => (
                            <div key={b.id} className="flex items-center justify-between gap-3 py-1.5 text-[12px]">
                              <span className="min-w-0 truncate">
                                {b.invoiceNo} • {b.orderNo} • {b.date}
                              </span>
                              <span className="shrink-0 tabular-nums">{inr(b.amount)}</span>
                            </div>
                          ))
                        )}
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Section>
        </TabsContent>



        <TabsContent value="orders">
          <Section title="Depot Orders from CSA">
            <div className="divide-y divide-border/60">
              {orders.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No CSA depot orders yet.</p>
              ) : (
                orders.map((o) => (
                  <Link
                    key={o.id}
                    to="/depot-order/$orderId"
                    params={{ orderId: o.id }}
                    className="flex items-center justify-between gap-3 p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {o.order_no} • {(o.csas as { name: string } | null)?.name ?? "CSA"}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {(o.order_items ?? []).length} SKU • {new Date(o.created_at).toLocaleDateString("en-IN")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums">{inr(o.total_amount)}</span>
                      <Badge variant={o.status === "pending" ? "default" : "secondary"}>{o.status}</Badge>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="stock">
          <Section
            title="Depot Warehouse Stock"
            action={
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link to="/opening-stock">Opening stock</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/godown-sale">Bill a CSA</Link>
                </Button>
              </div>

            }
          >
            <div className="space-y-3">
              <Input
                placeholder="Search product by name or SKU..."
                value={stockSearch}
                onChange={(e) => setStockSearch(e.target.value)}
                className="max-w-md"
              />
              <div className="divide-y divide-border/60 rounded-md border">
                {filteredStock.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    {stockSearch ? "No matching stock found." : "No depot stock yet — add opening stock first."}
                  </p>
                ) : (
                  filteredStock.map((s) => (
                    <div key={s.id} className="flex items-center justify-between p-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{(s.products as { name: string } | null)?.name}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {(s.products as { sku: string } | null)?.sku ?? "—"} • Batch: {s.batch_no ?? "—"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">{s.physical_qty - s.reserved_qty} pcs</p>
                        <p className="text-[11px] text-muted-foreground">Physical {s.physical_qty}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Section>
        </TabsContent>


        <TabsContent value="invoices">
          <Section title="Depot GST Invoices">
            <div className="divide-y divide-border/60">
              {(data?.invoices ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No depot invoices yet.</p>
              ) : (
                data!.invoices.map((i) => {
                  const ord = i.orders as {
                    order_no: string;
                    depot_id: string | null;
                    csas: Record<string, string | null> | null;
                    order_items:
                      | { id: string; qty: number; free_qty: number; rate: number; amount: number; products: { name: string } | null }[]
                      | null;
                  } | null;
                  return (
                    <div key={i.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                      <div>
                        <p className="font-medium">{i.invoice_no}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {ord?.order_no} • {ord?.csas?.['name']} • CGST {inr(i.cgst)} • SGST {inr(i.sgst)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold tabular-nums">{inr(i.net_amount)}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            downloadInvoicePdf({
                              invoiceNo: i.invoice_no,
                              date: i.created_at,
                              seller: toParty(
                                (data?.depots ?? []).find((d) => d.id === ord?.depot_id),
                                "Master Depot (Depot Sales)",
                                "Master Depot",
                              ),
                              buyer: toParty(ord?.csas, "CSA / Super Stockist", "CSA"),
                              orderNo: ord?.order_no ?? null,
                              lines: (ord?.order_items ?? []).map((it) => ({
                                name: it.products?.name ?? "Item",
                                qty: it.qty,
                                freeQty: it.free_qty,
                                rate: Number(it.rate),
                                amount: Number(it.amount),
                              })),
                              taxable: Number(i.taxable_value),
                              cgst: Number(i.cgst),
                              sgst: Number(i.sgst),
                              net: Number(i.net_amount),
                            }).catch((e: Error) => toast.error(e.message))
                          }
                        >
                          <Download className="mr-1 size-3.5" /> PDF
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </Shell>
  );
}

function DepotSetup({
  depots,
  userId,
  onDone,
}: {
  depots: { id: string; name: string; city: string | null }[];
  userId?: string | undefined;
  onDone: () => void;
}) {
  const [pick, setPick] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [gstin, setGstin] = useState("");

  const link = useMutation({
    mutationFn: async () => {
      if (!userId) throw new Error("Not signed in");
      let depotId = pick;
      if (!depotId) {
        if (!name.trim()) throw new Error("Enter the depot name");
        const { data, error } = await supabase
          .from("depots")
          .insert({ name: name.trim(), city: city.trim() || null, gstin: gstin.trim() || null })
          .select("id")
          .single();
        if (error) throw error;
        depotId = data.id;
      }
      const { error } = await supabase.from("profiles").update({ depot_id: depotId }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Depot linked to your login");
      onDone();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell title="Master Depot Setup" subtitle="Link your login to a depot to start">
      <Section title="Choose or create your depot">
        <div className="grid gap-3 p-4">
          {depots.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Existing depot</Label>
              <Select value={pick} onValueChange={setPick}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose depot" />
                </SelectTrigger>
                <SelectContent>
                  {depots.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      {d.city ? ` — ${d.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          {!pick ? (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>New depot name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="POPPiK Master Depot" />
              </div>
              <div className="space-y-1.5">
                <Label>City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>GSTIN</Label>
                <Input value={gstin} onChange={(e) => setGstin(e.target.value)} />
              </div>
            </div>
          ) : null}
          <Button disabled={link.isPending} onClick={() => link.mutate()}>
            <Warehouse className="mr-1 size-4" /> Save depot
          </Button>
        </div>
      </Section>
    </Shell>
  );
}
