import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useReportFilters } from "@/components/sfa/ReportFilterBar";
import { supabase } from "@/integrations/supabase/client";
import { Shell, StatCard, Section } from "@/components/sfa/Shell";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { compactInr, inr } from "@/lib/sfa";
import { CompanyDirectory } from "@/components/sfa/CompanyDirectory";
import { PartyManager } from "@/components/sfa/PartyManager";
import { RetailerMapping } from "@/components/sfa/RetailerMapping";
import { ProductManager } from "@/components/sfa/ProductManager";
import { CompanyOrders } from "@/components/sfa/CompanyOrders";

import { MarginBudget } from "@/components/sfa/MarginBudget";
import { useMe, roleHome } from "@/hooks/useAuth";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Company Control Tower — POPPiK SFA" },
      { name: "description", content: "Primary and secondary sales, field team attendance, network and inventory in one admin dashboard." },
      { property: "og:title", content: "Company Control Tower — POPPiK SFA" },
      { property: "og:description", content: "Live view of sales, collections, field force and supply chain." },
    ],
  }),
  component: AdminRoute,
});

function AdminRoute() {
  const { data: me, isLoading, sessionLoading } = useMe();
  if (isLoading || sessionLoading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading your workspace…
      </div>
    );
  }
  if (me.role !== "super_admin") {
    return <Navigate to={roleHome[me.role]} replace />;
  }
  return <AdminPage />;
}

function AdminPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const openReport = (card: string) => navigate({ to: "/admin-report/$card", params: { card } });
  const [notes, setNotes] = useState<Record<string, string>>({});

  const { data: adjustments } = useQuery({
    queryKey: ["admin-stock-adjustments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("stock_adjustments")
        .select("*, products(name, sku)")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const review = useMutation({
    mutationFn: async ({ id, approve }: { id: string; approve: boolean }) => {
      const { error } = await supabase.rpc("review_stock_adjustment", {
        _id: id,
        _approve: approve,
        _note: notes[id]?.trim() ?? "",
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Adjustment approved and stock updated" : "Adjustment rejected");
      qc.invalidateQueries({ queryKey: ["admin-stock-adjustments"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pendingAdjust = (adjustments ?? []).filter((a) => a.status === "pending");

  const { data: claims } = useQuery({
    queryKey: ["admin-claims"],
    queryFn: async () => {
      const { data } = await supabase
        .from("claims")
        .select("*, retailers(name, city), distributors(name)")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const [claimAmounts, setClaimAmounts] = useState<Record<string, string>>({});

  const reviewClaim = useMutation({
    mutationFn: async ({ id, approve, fallback }: { id: string; approve: boolean; fallback: number }) => {
      const typed = Number(claimAmounts[id] ?? "");
      const { error } = await supabase.rpc("review_claim", {
        _id: id,
        _approve: approve,
        _amount: approve ? (Number.isFinite(typed) && typed > 0 ? typed : fallback) : 0,
        _note: notes[id]?.trim() ?? "",
      });
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.approve ? "Claim approved" : "Claim rejected");
      qc.invalidateQueries({ queryKey: ["admin-claims"] });
      qc.invalidateQueries({ queryKey: ["my-claims"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const openClaimInvoice = async (path: string) => {
    const { data, error } = await supabase.storage.from("claim-invoices").createSignedUrl(path, 300);
    if (error || !data) {
      toast.error(error?.message ?? "Could not open invoice");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const pendingClaims = (claims ?? []).filter((c) => c.status === "pending");

  const { data } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: async () => {
      const [orders, invoices, collections, csas, distributors, retailers, profiles, attendance, stock, leaves] =
        await Promise.all([
          (supabase.from("orders") as any).select(
            "id, kind, status, total_amount, created_at, order_no, salesman_id, retailers(name, city, area, pincode), distributors(name, city, state)",
          ),
          supabase.from("invoices").select("net_amount"),
          supabase.from("collections").select("amount"),
          supabase.from("csas").select("id, name, city"),
          supabase.from("distributors").select("id, name, city, state, outstanding"),
          supabase.from("retailers").select("id, name, city, outstanding"),
          supabase.from("profiles").select("id, full_name, designation"),
          supabase.from("attendance").select("user_id, punch_in, punch_out, work_date"),
          supabase.from("distributor_stock").select("distributor_id, physical_qty, reserved_qty, products(name, ptr)"),
          supabase.from("leaves").select("id, status"),
        ]);
      return {
        orders: orders.data ?? [],
        invoices: invoices.data ?? [],
        collections: collections.data ?? [],
        csas: csas.data ?? [],
        distributors: distributors.data ?? [],
        retailers: retailers.data ?? [],
        profiles: profiles.data ?? [],
        attendance: attendance.data ?? [],
        stock: stock.data ?? [],
        leaves: leaves.data ?? [],
      };
    },
  });

  const orders = data?.orders ?? [];
  const primary = orders.filter((o: any) => o.kind === "primary").reduce((s: number, o: any) => s + Number(o.total_amount), 0);
  const secondary = orders.filter((o: any) => o.kind === "secondary").reduce((s: number, o: any) => s + Number(o.total_amount), 0);
  const collection = (data?.collections ?? []).reduce((s, c) => s + Number(c.amount), 0);
  const today = new Date().toISOString().slice(0, 10);
  const present = (data?.attendance ?? []).filter((a) => a.work_date === today && a.punch_in).length;
  const lowStock = (data?.stock ?? []).filter((s) => s.physical_qty - s.reserved_qty <= 10).length;

  const byState = (data?.distributors ?? []).reduce<Record<string, number>>((acc, d) => {
    acc[d.state ?? "Other"] = (acc[d.state ?? "Other"] ?? 0) + Number(d.outstanding);
    return acc;
  }, {});

  const nameOf = (id: string | null | undefined) =>
    (data?.profiles ?? []).find((p) => p.id === id)?.full_name ?? null;

  const orderRows = useMemo(
    () =>
      orders.map((o: any) => {
        const r = o.retailers as { name: string; city?: string | null; area?: string | null; pincode?: string | null } | null;
        const d = o.distributors as { name: string; city?: string | null } | null;
        return {
          key: o.id,
          label: o.order_no,
          sub: `${o.kind} • ${r?.name ?? d?.name ?? "Distributor order"}`,
          value: inr(o.total_amount),
          status: o.status,
          city: r?.city ?? d?.city ?? null,
          area: r?.area ?? null,
          pincode: r?.pincode ?? null,
          salesman: nameOf(o.salesman_id),
        };
      }),
    [orders, data?.profiles],
  );
  const orderFilters = useReportFilters(orderRows, "admin-orders");

  const distRows = useMemo(
    () =>
      (data?.distributors ?? []).map((d) => ({
        key: d.id,
        label: d.name,
        sub: `${d.city ?? "—"}, ${d.state ?? "—"}`,
        value: inr(d.outstanding),
        city: d.city,
      })),
    [data?.distributors],
  );
  const distFilters = useReportFilters(distRows, "admin-distributors");

  const stockValueByDist = useMemo(() => {
    const map: Record<string, number> = {};
    for (const s of (data?.stock ?? []) as any[]) {
      const id = s.distributor_id as string | null;
      if (!id) continue;
      const ptr = Number((s.products as { ptr?: number } | null)?.ptr ?? 0);
      map[id] = (map[id] ?? 0) + Number(s.physical_qty ?? 0) * ptr;
    }
    return map;
  }, [data?.stock]);


  return (
    <Shell
      title="Company Control Tower"
      subtitle="Sales • Supply chain • Field force"
      nav={[
        { to: "/admin", label: "Control Tower" },
        { to: "/reports", label: "Reports" },
        { to: "/live-map", label: "Live Map" },
        { to: "/hr", label: "HR & Payroll" },
      ]}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard label="Primary Sales" value={compactInr(primary)} tone="primary" onClick={() => openReport("primary-sales")} />
        <StatCard label="Secondary Sales" value={compactInr(secondary)} tone="success" onClick={() => openReport("secondary-sales")} />
        <StatCard label="Collection" value={compactInr(collection)} tone="warning" onClick={() => openReport("collection")} />
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="CSA" value={String(data?.csas.length ?? 0)} onClick={() => openReport("csas")} />
        <StatCard label="Distributors" value={String(data?.distributors.length ?? 0)} onClick={() => openReport("distributors")} />
        <StatCard label="Retailers" value={String(data?.retailers.length ?? 0)} onClick={() => openReport("retailers")} />
        <StatCard label="Employees" value={String(data?.profiles.length ?? 0)} onClick={() => openReport("employees")} />
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Team Present" value={String(present)} tone="success" onClick={() => openReport("team-present")} />
        <StatCard label="Pending Orders" value={String(orders.filter((o: any) => o.status === "pending").length)} tone="warning" onClick={() => openReport("pending-orders")} />
        <StatCard label="Low Stock SKUs" value={String(lowStock)} tone="danger" onClick={() => openReport("low-stock")} />
        <StatCard label="Leave Requests" value={String((data?.leaves ?? []).filter((l) => l.status === "pending").length)} onClick={() => openReport("leave-requests")} />
      </div>

      <Tabs defaultValue="orders" className="mt-6">
        <TabsList>
          <TabsTrigger value="orders">Orders</TabsTrigger>
          <TabsTrigger value="network">Network</TabsTrigger>
          <TabsTrigger value="geo">State-wise</TabsTrigger>
          <TabsTrigger value="adjust">
            Stock Adjustments{pendingAdjust.length ? ` (${pendingAdjust.length})` : ""}
          </TabsTrigger>
          <TabsTrigger value="claims">Claims{pendingClaims.length ? ` (${pendingClaims.length})` : ""}</TabsTrigger>
          <TabsTrigger value="margin">Margin Budget</TabsTrigger>
          <TabsTrigger value="products">Products</TabsTrigger>
          <TabsTrigger value="depotorders">Depot Orders</TabsTrigger>
          <TabsTrigger value="parties">Distributors &amp; CSA</TabsTrigger>
          <TabsTrigger value="outlets">Retail Outlets</TabsTrigger>
          <TabsTrigger value="directory">Directory</TabsTrigger>
        </TabsList>

        <TabsContent value="margin">
          <MarginBudget title="Channel margin budget (all parties)" />
        </TabsContent>

        <TabsContent value="products">
          <ProductManager />
        </TabsContent>

        <TabsContent value="depotorders">
          <CompanyOrders />
        </TabsContent>


        <TabsContent value="parties">
          <PartyManager />
        </TabsContent>

        <TabsContent value="outlets">
          <RetailerMapping />
        </TabsContent>

        <TabsContent value="directory">
          <CompanyDirectory />
        </TabsContent>


        <TabsContent value="orders">
          <Section title={`All Orders — ${orderFilters.filtered.length} records`}>
            <div className="space-y-3 p-3">
              {orderFilters.bar}
              <PagedRows
                rows={orderFilters.filtered as PagedRow[]}
                render={(r) => (
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{r.label}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{r.sub}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <span className="tabular-nums">{r.value}</span>
                      <Badge variant="secondary">{r.status}</Badge>
                    </div>
                  </div>
                )}
              />
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="network">
          <Section title={`Distributors — ${distFilters.filtered.length} records`}>
            <div className="space-y-3 p-3">
              {distFilters.bar}
              <PagedRows
                rows={distFilters.filtered}
                render={(r) => (
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/distributor-network/$id", params: { id: r.key } })}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{r.label}</p>
                      <p className="text-[11px] text-muted-foreground">{r.sub}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="tabular-nums text-destructive">{r.value}</p>
                      <p className="text-[11px] text-muted-foreground">
                        Stock {compactInr(stockValueByDist[r.key] ?? 0)}
                      </p>
                    </div>
                  </button>
                )}
              />
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="geo">
          <Section title="Outstanding by State">
            <div className="divide-y divide-border/60">
              {Object.entries(byState).map(([state, value]) => (
                <div key={state} className="flex items-center justify-between p-3 text-sm">
                  <span>{state}</span>
                  <span className="tabular-nums">{compactInr(value)}</span>
                </div>
              ))}
            </div>
          </Section>
        </TabsContent>
        <TabsContent value="adjust">
          <Section title="Stock Adjustment Requests">
            <div className="divide-y divide-border/60">
              {(adjustments ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No adjustment requests.</p>
              ) : (
                (adjustments ?? []).map((a) => (
                  <div key={a.id} className="space-y-2 p-3 text-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {(a.products as { name: string } | null)?.name ?? "Product"}{" "}
                          <span className="text-muted-foreground">({a.scope})</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          {a.current_qty} → {a.new_qty} ({a.delta > 0 ? "+" : ""}
                          {a.delta}) • {new Date(a.created_at).toLocaleString()}
                        </p>
                        <p className="text-[11px] text-muted-foreground">Remark: {a.reason}</p>
                        {a.review_note ? (
                          <p className="text-[11px] text-muted-foreground">Admin note: {a.review_note}</p>
                        ) : null}
                      </div>
                      <Badge
                        variant={
                          a.status === "approved" ? "default" : a.status === "rejected" ? "destructive" : "secondary"
                        }
                      >
                        {a.status}
                      </Badge>
                    </div>
                    {a.status === "pending" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        <Input
                          className="h-8 max-w-xs"
                          placeholder="Approval note (optional)"
                          value={notes[a.id] ?? ""}
                          onChange={(e) => setNotes((n) => ({ ...n, [a.id]: e.target.value }))}
                        />
                        <Button
                          size="sm"
                          disabled={review.isPending}
                          onClick={() => review.mutate({ id: a.id, approve: true })}
                        >
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={review.isPending}
                          onClick={() => review.mutate({ id: a.id, approve: false })}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="claims">
          <Section title="Margin & Display Claims">
            <div className="divide-y divide-border/60">
              {(claims ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No claims submitted.</p>
              ) : (
                (claims ?? []).map((c) => {
                  const total = Number(c.claim_amount ?? 0);
                  return (
                    <div key={c.id} className="space-y-2 p-3 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium">
                            {(c.retailers as { name: string } | null)?.name ?? "Retailer"}{" "}
                            <span className="text-muted-foreground">
                              ({(c.distributors as { name: string } | null)?.name ?? "—"})
                            </span>
                          </p>
                          <p className="text-[11px] text-muted-foreground">
                            Extra margin {inr(c.extra_margin)} • Display {inr(c.display_amount)}
                            {c.invoice_no ? ` • ${c.invoice_no}` : ""} • {new Date(c.created_at).toLocaleString()}
                          </p>
                          {c.notes ? <p className="text-[11px] text-muted-foreground">Remark: {c.notes}</p> : null}
                          {c.status === "approved" ? (
                            <p className="text-[11px] text-muted-foreground">Approved: {inr(c.approved_amount ?? 0)}</p>
                          ) : null}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <span className="tabular-nums font-semibold">{inr(total)}</span>
                          <Badge
                            variant={
                              c.status === "approved" ? "default" : c.status === "rejected" ? "destructive" : "secondary"
                            }
                          >
                            {c.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {c.invoice_path ? (
                          <Button size="sm" variant="outline" onClick={() => openClaimInvoice(c.invoice_path!)}>
                            View invoice
                          </Button>
                        ) : null}
                        {c.status === "pending" ? (
                          <>
                            <Input
                              className="h-8 w-36"
                              type="number"
                              placeholder={`Amount ${total}`}
                              value={claimAmounts[c.id] ?? ""}
                              onChange={(e) => setClaimAmounts((n) => ({ ...n, [c.id]: e.target.value }))}
                            />
                            <Input
                              className="h-8 max-w-xs"
                              placeholder="Approval note (optional)"
                              value={notes[c.id] ?? ""}
                              onChange={(e) => setNotes((n) => ({ ...n, [c.id]: e.target.value }))}
                            />
                            <Button
                              size="sm"
                              disabled={reviewClaim.isPending}
                              onClick={() => reviewClaim.mutate({ id: c.id, approve: true, fallback: total })}
                            >
                              Approve
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={reviewClaim.isPending}
                              onClick={() => reviewClaim.mutate({ id: c.id, approve: false, fallback: total })}
                            >
                              Reject
                            </Button>
                          </>
                        ) : null}
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

const TAB_PAGE_SIZE = 15;

type PagedRow = { key: string; label: string; sub: string; value: string; status?: string };

function PagedRows<T extends PagedRow>({ rows, render }: { rows: T[]; render: (row: T) => React.ReactNode }) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [rows.length]);
  const totalPages = Math.max(1, Math.ceil(rows.length / TAB_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = rows.slice((safePage - 1) * TAB_PAGE_SIZE, safePage * TAB_PAGE_SIZE);

  if (rows.length === 0) {
    return <p className="p-2 text-sm text-muted-foreground">No records found.</p>;
  }
  return (
    <div>
      <div className="divide-y divide-border/60 rounded-xl border border-border/60">
        {paged.map((r) => (
          <div key={r.key} className="p-3 text-sm">
            {render(r)}
          </div>
        ))}
      </div>
      {totalPages > 1 ? (
        <div className="flex items-center justify-between pt-3">
          <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
            <ChevronLeft className="mr-1 size-4" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {safePage} of {totalPages}
          </span>
          <Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next <ChevronRight className="ml-1 size-4" />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
