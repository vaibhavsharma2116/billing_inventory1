import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BarChart3, CalendarDays, MapPin, Pencil, Receipt, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { Shell, StatCard, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AddRetailerDialog } from "@/components/sfa/AddRetailerDialog";
import { EditRetailerDialog } from "@/components/sfa/EditRetailerDialog";
import { MarkVisitDialog } from "@/components/sfa/MarkVisitDialog";
import { DistributorVisitDialog } from "@/components/sfa/DistributorVisitDialog";
import { LeaveApply } from "@/components/sfa/LeaveApply";
import { inr, stockTone } from "@/lib/sfa";
import { useLocationTracking, tryGetPosition } from "@/hooks/useLocationTracking";
import { useMappedDistributors } from "@/hooks/useMappedDistributors";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/salesman")({
  head: () => ({
    meta: [
      { title: "Field Sales Dashboard — POPPiK SFA" },
      { name: "description", content: "Daily target, beat visits, order booking and live distributor stock for field salesmen." },
      { property: "og:title", content: "Field Sales Dashboard — POPPiK SFA" },
      { property: "og:description", content: "Punch in, run your beat, book orders against live distributor stock." },
    ],
  }),
  component: SalesmanPage,
});

const today = () => new Date().toISOString().slice(0, 10);

function SalesmanPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const userId = me?.profile?.id;

  const { data } = useQuery({
    queryKey: ["salesman-day", userId],
    enabled: !!userId,
    queryFn: async () => {
      const start = today() + "T00:00:00Z";
      const monthStart = today().slice(0, 8) + "01";
      const [attendance, visits, orders, collections, target, retailers, stock, monthOrders, monthVisits, distVisits, monthDistVisits] = await Promise.all([
        supabase.from("attendance").select("*").eq("user_id", userId!).eq("work_date", today()).maybeSingle(),
        supabase.from("visits").select("id, retailer_id, productive, notes, checked_in_at, retailers(name)").eq("salesman_id", userId!).gte("checked_in_at", start).order("checked_in_at", { ascending: false }),
        supabase.from("orders").select("id, total_amount, status, order_no, retailer_id").eq("salesman_id", userId!).gte("created_at", start),
        supabase.from("collections").select("amount").eq("salesman_id", userId!).eq("status", "approved").gte("created_at", start),
        supabase.from("targets").select("*").eq("user_id", userId!).eq("period_month", monthStart).maybeSingle(),
        supabase.from("retailers").select("id, name, city, outstanding, distributor_id, distributors(name)").order("name"),
        supabase
          .from("distributor_stock")
          .select("physical_qty, reserved_qty, updated_at, products(name, sku), distributors(name)")
          .limit(12),
        supabase.from("orders").select("total_amount").eq("salesman_id", userId!).gte("created_at", `${monthStart}T00:00:00Z`),
        supabase.from("visits").select("id").eq("salesman_id", userId!).gte("checked_in_at", `${monthStart}T00:00:00Z`),
        supabase
          .from("distributor_visits")
          .select("id, distributor_name, phone, address, notes, visited_at")
          .eq("salesman_id", userId!)
          .gte("visited_at", start)
          .order("visited_at", { ascending: false }),
        supabase.from("distributor_visits").select("id").eq("salesman_id", userId!).gte("visited_at", `${monthStart}T00:00:00Z`),
      ]);
      return {
        attendance: attendance.data,
        visits: visits.data ?? [],
        orders: orders.data ?? [],
        collections: collections.data ?? [],
        target: target.data,
        retailers: retailers.data ?? [],
        stock: stock.data ?? [],
        monthSales: (monthOrders.data ?? []).reduce((s, o) => s + Number(o.total_amount), 0),
        distributorVisits: distVisits.data ?? [],
        monthVisits: (monthVisits.data ?? []).length + (monthDistVisits.data ?? []).length,
      };
    },
  });

  const punch = useMutation({
    mutationFn: async (kind: "in" | "out") => {
      if (!userId) throw new Error("Your profile is still loading — please try again in a moment.");
      // Try GPS, but never block attendance if the device/browser refuses it.
      const pos = await tryGetPosition();
      const coords = pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : {};
      if (kind === "in") {
        const { error } = await supabase.from("attendance").upsert(
          { user_id: userId, work_date: today(), punch_in: new Date().toISOString(), punch_out: null, ...coords },
          { onConflict: "user_id,work_date" },
        );
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("attendance")
          .update({ punch_out: new Date().toISOString(), ...coords })
          .eq("user_id", userId)
          .eq("work_date", today());
        if (error) throw error;
      }
      if (pos) {
        await supabase.from("location_pings").insert({
          user_id: userId,
          work_date: today(),
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      }
      return { gps: !!pos };
    },
    onSuccess: (res) => {
      toast.success(res.gps ? "Attendance updated" : "Attendance updated — GPS unavailable, location not saved");
      qc.invalidateQueries({ queryKey: ["salesman-day"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not update attendance"),
  });

  const { data: mappedDistributors = [] } = useMappedDistributors();
  const [distFilter, setDistFilter] = useState<string>("all");
  const [retailerSearch, setRetailerSearch] = useState<string>("");
  const [retailerPage, setRetailerPage] = useState<number>(1);
  const RETAILERS_PER_PAGE = 5;

  const retailerRows = (data?.retailers ?? []) as Array<{
    id: string; name: string; city: string | null; outstanding: number;
    distributor_id: string | null; distributors: { name: string } | null;
  }>;
  const visibleRetailers = retailerRows.filter((r) => {
    if (distFilter === "all") return true;
    if (distFilter === "unmapped") return !r.distributor_id;
    return r.distributor_id === distFilter;
  }).filter((r) => {
    const q = retailerSearch.trim().toLowerCase();
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || (r.city ?? "").toLowerCase().includes(q);
  });
  const totalRetailerPages = Math.max(1, Math.ceil(visibleRetailers.length / RETAILERS_PER_PAGE));
  const pagedRetailers = visibleRetailers.slice((retailerPage - 1) * RETAILERS_PER_PAGE, retailerPage * RETAILERS_PER_PAGE);

  const mapRetailer = useMutation({
    mutationFn: async ({ retailerId, distributorId }: { retailerId: string; distributorId: string }) => {
      const { error } = await supabase.from("retailers").update({ distributor_id: distributorId }).eq("id", retailerId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Retailer mapped to distributor");
      qc.invalidateQueries({ queryKey: ["salesman-day"] });
      qc.invalidateQueries({ queryKey: ["booking-master"] });
    },
    onError: (e: Error) => toast.error(e.message || "Could not map retailer"),
  });

  const sales = (data?.orders ?? []).reduce((s, o) => s + Number(o.total_amount), 0);
  const collected = (data?.collections ?? []).reduce((s, c) => s + Number(c.amount), 0);
  const targetAmt = Number(data?.target?.target_amount ?? 0);
  const monthSales = Number(data?.monthSales ?? 0);
  const hasTarget = targetAmt > 0;
  const visitsTarget = Number(data?.target?.visits_target ?? 0);
  const achievement = hasTarget ? Math.min(100, Math.round((monthSales / targetAmt) * 100)) : 0;
  const monthLabel = new Date().toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const punchedIn = !!data?.attendance?.punch_in && !data?.attendance?.punch_out;
  const { last: livePoint, error: gpsError } = useLocationTracking(punchedIn, userId);


  const greeting = new Date().getHours() < 12 ? "Good Morning" : new Date().getHours() < 17 ? "Good Afternoon" : "Good Evening";

  return (
    <Shell
      mobile
      title={`${greeting}, ${me?.profile?.full_name || "Salesman"}`}
      subtitle={new Date().toDateString()}
      nav={[
        { to: "/salesman", label: "Today", icon: CalendarDays },
        { to: "/order-booking", label: "Book Order", icon: ShoppingCart },
        { to: "/expenses", label: "Expenses", icon: Receipt },
        { to: "/my-report", label: "Reports", icon: BarChart3 },
      ]}

    >
      <div
        role="button"
        onClick={() => navigate({ to: "/salesman-report/$card", params: { card: "sales" } })}
        className="cursor-pointer rounded-2xl bg-[image:var(--gradient-brand)] p-5 text-primary-foreground shadow-[var(--shadow-lift)]"
      >
        <p className="text-xs uppercase tracking-[0.2em] opacity-70">Monthly Target • {monthLabel}</p>
        <p className="text-3xl font-semibold">{hasTarget ? inr(targetAmt) : "Not assigned"}</p>
        {!hasTarget ? (
          <p className="mt-1 text-xs opacity-80">Your reporting manager has not assigned a target for this month yet.</p>
        ) : null}
        <div className="mt-3 flex items-center justify-between text-sm">
          <span>Month sales {inr(monthSales)}</span>
          <span>{hasTarget ? `${achievement}% achieved` : `Today ${inr(sales)}`}</span>
        </div>
        <Progress value={achievement} className="mt-2 bg-primary-foreground/20" />
        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={punch.isPending}
            onClick={(event) => {
              event.stopPropagation();
              punch.mutate(punchedIn ? "out" : "in");
            }}
          >
            {punch.isPending ? "Please wait…" : punchedIn ? "Punch Out" : "Punch In (GPS)"}
          </Button>
          <Button asChild variant="secondary" className="flex-1">
            <Link to="/order-booking" onClick={(event) => event.stopPropagation()}>
              Start Market Visit
            </Link>
          </Button>
        </div>
        {data?.attendance?.punch_in ? (
          <p className="mt-2 text-xs opacity-90">
            Punch in: {new Date(data.attendance.punch_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            {data.attendance.punch_out
              ? ` · Punch out: ${new Date(data.attendance.punch_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`
              : " · Currently on duty"}
          </p>
        ) : null}
      </div>

      {punchedIn && (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-border bg-card p-3 text-xs">
          <MapPin className={`mt-0.5 h-4 w-4 shrink-0 ${gpsError ? "text-destructive" : "text-primary"}`} />
          <div className="min-w-0">
            <p className="font-medium">{gpsError ? "GPS signal lost" : "Live location tracking on"}</p>
            <p className="text-muted-foreground break-words">
              {gpsError
                ? `${gpsError}. Keep GPS on until punch out.`
                : livePoint
                  ? `${livePoint.lat.toFixed(5)}, ${livePoint.lng.toFixed(5)} · updated ${new Date(livePoint.at).toLocaleTimeString()}`
                  : "Acquiring GPS position…"}
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Monthly Visit Target" value={visitsTarget ? `${data?.monthVisits ?? 0}/${visitsTarget}` : "—"} onClick={() => navigate({ to: "/salesman-report/$card", params: { card: "plan" } })} />
        <StatCard
          label="Visits Completed"
          value={String((data?.visits.length ?? 0) + (data?.distributorVisits?.length ?? 0))}
          {...(data?.distributorVisits?.length ? { hint: `${data.distributorVisits.length} distributor` } : {})}
          tone="primary"
          onClick={() => navigate({ to: "/salesman-report/$card", params: { card: "visits" } })}
        />
        <StatCard label="Orders" value={String(data?.orders.length ?? 0)} tone="success" onClick={() => navigate({ to: "/salesman-report/$card", params: { card: "orders" } })} />
        <StatCard label="Collection" value={inr(collected)} tone="warning" onClick={() => navigate({ to: "/salesman-report/$card", params: { card: "collection" } })} />
      </div>

      <Section title="Today's Orders">
        <div className="divide-y divide-border/60">
          {(data?.orders ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No orders booked yet.</p>
          ) : (
            data!.orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between p-3 text-sm">
                <span className="font-medium">{o.order_no}</span>
                <span className="tabular-nums">{inr(o.total_amount)}</span>
                <Badge variant="secondary">{o.status}</Badge>
              </div>
            ))
          )}
        </div>
      </Section>

      <Section title="Live Distributor Stock">
        <div className="divide-y divide-border/60">
          {(data?.stock ?? []).map((s, i) => {
            const available = (s.physical_qty ?? 0) - (s.reserved_qty ?? 0);
            const tone = stockTone(available);
            return (
              <div key={i} className="flex items-center justify-between p-3 text-sm">
                <div>
                  <p className="font-medium">{(s.products as { name: string } | null)?.name}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {(s.distributors as { name: string } | null)?.name}
                  </p>
                </div>
                <span
                  className={
                    tone === "ok"
                      ? "font-semibold text-success"
                      : tone === "warn"
                        ? "font-semibold text-warning"
                        : "font-semibold text-destructive"
                  }
                >
                  {available} pcs
                </span>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="Today's Visits" action={<MarkVisitDialog invalidateKeys={["salesman-day"]} />}>
        <div className="divide-y divide-border/60">
          {(data?.visits ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No visits marked yet.</p>
          ) : (
            data!.visits.map((v) => (
              <div key={v.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{(v.retailers as { name: string } | null)?.name ?? "Shop"}</p>
                  {v.notes ? <p className="text-[11px] text-muted-foreground">{v.notes}</p> : null}
                </div>
                <Badge variant={v.productive ? "default" : "secondary"} className="shrink-0">
                  {v.productive ? "Productive" : "No order"}
                </Badge>
              </div>
            ))
          )}
        </div>
      </Section>

      <Section title="Distributor Visits" action={<DistributorVisitDialog invalidateKeys={["salesman-day"]} />}>
        <div className="divide-y divide-border/60">
          {(data?.distributorVisits ?? []).length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No distributor visit added today.</p>
          ) : (
            (data?.distributorVisits ?? []).map((v) => (
              <div key={v.id} className="flex items-start justify-between gap-3 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{v.distributor_name}</p>
                  {v.phone ? <p className="text-[11px] text-muted-foreground">{v.phone}</p> : null}
                  {v.address ? <p className="text-[11px] text-muted-foreground">{v.address}</p> : null}
                  {v.notes ? <p className="text-[11px] text-muted-foreground">{v.notes}</p> : null}
                </div>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {new Date(v.visited_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            ))
          )}
        </div>
      </Section>

      <Section
        title="My Retailers"
        action={
          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <Link to="/payment-in" search={{ retailer: "" }}>
                Payment In
              </Link>
            </Button>
            <AddRetailerDialog invalidateKeys={["salesman-day", "booking-master"]} />
          </div>
        }
      >
        <div className="space-y-2 border-b border-border/60 p-3">
          <Input
            placeholder="Search retailer by name or city"
            value={retailerSearch}
            onChange={(e) => {
              setRetailerSearch(e.target.value);
              setRetailerPage(1);
            }}
            className="h-9 text-xs"
          />
          <Select value={distFilter} onValueChange={(v) => { setDistFilter(v); setRetailerPage(1); }}>
            <SelectTrigger className="h-9 w-full text-xs">
              <SelectValue placeholder="Filter by distributor" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All distributors</SelectItem>
              <SelectItem value="unmapped">Not mapped yet</SelectItem>
              {mappedDistributors.map((d) => (
                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="divide-y divide-border/60">
          {pagedRetailers.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No retailers for this distributor yet.</p>
          ) : null}
          {pagedRetailers.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{r.name}</p>
                <p className="text-[11px] text-muted-foreground">{r.city}</p>
                {r.distributor_id ? (
                  <p className="truncate text-[11px] text-muted-foreground">Dist: {r.distributors?.name ?? "—"}</p>
                ) : (
                  <div className="mt-1 w-44">
                    <Select
                      value=""
                      onValueChange={(v) => mapRetailer.mutate({ retailerId: r.id, distributorId: v })}
                    >
                      <SelectTrigger className="h-7 text-[11px]">
                        <SelectValue placeholder="Map to distributor" />
                      </SelectTrigger>
                      <SelectContent>
                        {mappedDistributors.map((d) => (
                          <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {Number(r.outstanding ?? 0) > 0 ? (
                  <p className="mt-1 text-[11px] tabular-nums text-destructive">Outstanding: {inr(r.outstanding)}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <EditRetailerDialog
                  retailerId={r.id}
                  invalidateKeys={["salesman-day", "booking-master"]}
                  trigger={
                    <Button variant="outline" size="icon" className="h-9 w-9">
                      <Pencil className="h-4 w-4" />
                      <span className="sr-only">Edit retailer</span>
                    </Button>
                  }
                />
                <MarkVisitDialog
                  retailerId={r.id}
                  retailerName={r.name}
                  invalidateKeys={["salesman-day"]}
                  trigger={
                    <Button variant="outline" className="h-9 px-2.5 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive">
                      No order
                    </Button>
                  }
                />
                <Button asChild className="h-9 px-3 text-xs shadow-sm">
                  <Link to="/payment-in" search={{ retailer: r.id }}>
                    Payment
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
        {visibleRetailers.length > 0 && (
          <div className="flex items-center justify-between border-t border-border/60 p-3 text-xs">
            <span className="text-muted-foreground">
              Page {retailerPage} of {totalRetailerPages} · {visibleRetailers.length} retailer{visibleRetailers.length !== 1 ? "s" : ""}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={retailerPage <= 1}
                onClick={() => setRetailerPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={retailerPage >= totalRetailerPages}
                onClick={() => setRetailerPage((p) => Math.min(totalRetailerPages, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Section>

      <LeaveApply userId={userId} />
    </Shell>
  );
}
