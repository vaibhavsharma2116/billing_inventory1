import { lazy, Suspense } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Shell, StatCard, Section } from "@/components/sfa/Shell";
import { Badge } from "@/components/ui/badge";
import { agoLabel, minutesAgo, type SalesmanPosition } from "@/components/sfa/live-map-types";

const LiveMap = lazy(() => import("@/components/sfa/LiveMap"));

export const Route = createFileRoute("/_authenticated/live-map")({
  head: () => ({
    meta: [
      { title: "Live Field Map — POPPiK SFA" },
      { name: "description", content: "Track every salesman's current GPS location and last update time on a live admin map." },
      { property: "og:title", content: "Live Field Map — POPPiK SFA" },
      { property: "og:description", content: "Real-time field force location tracking for administrators." },
    ],
  }),
  component: LiveMapPage,
});

const MapSkeleton = () => <div className="h-[480px] w-full animate-pulse rounded-2xl bg-muted" />;

function LiveMapPage() {
  const today = new Date().toISOString().slice(0, 10);

  const { data, isLoading } = useQuery({
    queryKey: ["live-map", today],
    refetchInterval: 30_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const [pings, profiles, attendance] = await Promise.all([
        supabase
          .from("location_pings")
          .select("user_id, lat, lng, accuracy, recorded_at")
          .gte("recorded_at", since)
          .order("recorded_at", { ascending: false })
          .limit(1000),
        supabase.from("profiles").select("id, full_name, designation"),
        supabase.from("attendance").select("user_id, punch_in, punch_out").eq("work_date", today),
      ]);

      const nameOf = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
      const punched = new Map(
        (attendance.data ?? []).map((a) => [a.user_id, Boolean(a.punch_in) && !a.punch_out]),
      );

      const latest = new Map<string, SalesmanPosition>();
      for (const p of pings.data ?? []) {
        if (latest.has(p.user_id)) continue;
        latest.set(p.user_id, {
          userId: p.user_id,
          name: nameOf.get(p.user_id) ?? "Unknown user",
          lat: Number(p.lat),
          lng: Number(p.lng),
          recordedAt: p.recorded_at,
          accuracy: p.accuracy === null ? null : Number(p.accuracy),
          punchedIn: punched.get(p.user_id) ?? false,
        });
      }
      return Array.from(latest.values()).sort(
        (a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime(),
      );
    },
  });

  const positions = data ?? [];
  const live = positions.filter((p) => minutesAgo(p.recordedAt) <= 15);
  const onDuty = positions.filter((p) => p.punchedIn);

  return (
    <Shell
      title="Live Field Map"
      subtitle="Salesman locations • auto-refresh every 30s"
      nav={[
        { to: "/admin", label: "Control Tower" },
        { to: "/reports", label: "Reports" },
        { to: "/live-map", label: "Live Map" },
      ]}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="Tracked (24h)" value={String(positions.length)} />
        <StatCard label="Live now" value={String(live.length)} tone="success" hint="Updated ≤ 15 min" />
        <StatCard label="Punched in" value={String(onDuty.length)} tone="primary" />
      </div>

      <Section title="Map">
        <div className="p-2">
          <ClientOnly fallback={<MapSkeleton />}>
            <Suspense fallback={<MapSkeleton />}>
              <LiveMap positions={positions} />
            </Suspense>
          </ClientOnly>
        </div>
      </Section>

      <Section title="Last known positions">
        <div className="divide-y divide-border/60">
          {isLoading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading locations…</p>
          ) : positions.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              No GPS pings in the last 24 hours. Locations appear once a salesman punches in.
            </p>
          ) : (
            positions.map((p) => (
              <div key={p.userId} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {p.lat.toFixed(5)}, {p.lng.toFixed(5)}
                    {p.accuracy ? ` • ±${Math.round(p.accuracy)}m` : ""}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-xs text-muted-foreground">{agoLabel(p.recordedAt)}</span>
                  <Badge variant={minutesAgo(p.recordedAt) <= 15 ? "default" : "secondary"}>
                    {p.punchedIn ? "On duty" : "Off duty"}
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
