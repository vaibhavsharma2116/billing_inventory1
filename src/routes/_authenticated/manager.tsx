import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useMe, roleLabel } from "@/hooks/useAuth";
import { Shell, StatCard, Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { inr } from "@/lib/sfa";
import { downloadReportPdf, rs } from "@/lib/report-pdf";
import { MarginBudget } from "@/components/sfa/MarginBudget";
import { TargetAssign } from "@/components/sfa/TargetAssign";

export const Route = createFileRoute("/_authenticated/manager")({
  head: () => ({
    meta: [
      { title: "Manager Reports — POPPiK SFA" },
      {
        name: "description",
        content: "Sales manager view of assigned distributors, CSAs, retailers and field team performance.",
      },
      { property: "og:title", content: "Manager Reports — POPPiK SFA" },
      {
        property: "og:description",
        content: "Assigned distributor, CSA, retailer and team-wise sales, collections and attendance reports.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ManagerDashboard,
});

function ManagerDashboard() {
  const { data: me } = useMe();
  const [card, setCard] = useState<string | null>(null);


  const { data, isLoading } = useQuery({
    queryKey: ["manager-scope", me?.profile?.id ?? null],
    enabled: !!me?.profile?.id,
    queryFn: async () => {
      const managerId = me!.profile!.id;
      const [dist, csa, ret, ord, coll, vis, att, ba, prof, asg, dep] = await Promise.all([
        supabase.from("distributors").select("id, name, city, state, outstanding, csa_id"),
        supabase.from("csas").select("id, name, city, state, depot_id"),
        supabase.from("retailers").select("id, name, city, retailer_type, distributor_id, outstanding, credit_limit"),
        supabase
          .from("orders")
          .select("id, order_no, kind, status, total_amount, created_at, distributor_id, csa_id, retailer_id, salesman_id, depot_id")
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.from("collections").select("id, amount, mode, created_at, retailer_id, salesman_id"),
        supabase.from("visits").select("id, salesman_id, retailer_id, productive, checked_in_at"),
        supabase.from("attendance").select("id, user_id, work_date, punch_in, punch_out"),
        supabase.from("ba_sales").select("id, ba_id, amount, qty, sale_date"),
        supabase.from("profiles").select("id, full_name, phone, designation, distributor_id, csa_id, depot_id, reports_to"),
        supabase.from("manager_assignments").select("manager_id, distributor_id, csa_id, member_id"),
        supabase.from("depots").select("id, name, city, state"),
      ]);


      const allAssignments = asg.data ?? [];
      const allProfiles = prof.data ?? [];

      // downline = this manager + everyone reporting (directly or indirectly) to them
      const downline = new Set<string>([managerId]);
      let grew = true;
      while (grew) {
        grew = false;
        allProfiles.forEach((p) => {
          if (p.reports_to && downline.has(p.reports_to) && !downline.has(p.id)) {
            downline.add(p.id);
            grew = true;
          }
        });
      }

      const assignments = allAssignments.filter((a) => a.manager_id && downline.has(a.manager_id));

      const distIds = new Set(assignments.map((a) => a.distributor_id).filter(Boolean) as string[]);
      const csaIds = new Set(assignments.map((a) => a.csa_id).filter(Boolean) as string[]);
      const memberIds = new Set(assignments.map((a) => a.member_id).filter(Boolean) as string[]);
      // reporting chain (excluding self) also counts as assigned team
      downline.forEach((id) => {
        if (id !== managerId) memberIds.add(id);
      });
      // members mapped to an assigned distributor / CSA
      allProfiles.forEach((p) => {
        if ((p.distributor_id && distIds.has(p.distributor_id)) || (p.csa_id && csaIds.has(p.csa_id))) {
          memberIds.add(p.id);
        }
      });

      const distributors = (dist.data ?? []).filter((d) => distIds.has(d.id));
      const csas = (csa.data ?? []).filter((c) => csaIds.has(c.id));
      const retailers = (ret.data ?? []).filter((r) => !!r.distributor_id && distIds.has(r.distributor_id));
      const retailerIds = new Set(retailers.map((r) => r.id));
      const profiles = allProfiles.filter((p) => memberIds.has(p.id));

      // master depots reachable through assigned CSAs or team members
      const depotIds = new Set<string>();
      csas.forEach((c) => {
        if (c.depot_id) depotIds.add(c.depot_id);
      });
      allProfiles.forEach((p) => {
        if (p.depot_id && memberIds.has(p.id)) depotIds.add(p.depot_id);
      });
      const depots = (dep.data ?? []).filter((d) => depotIds.has(d.id));

      const orders = (ord.data ?? []).filter(
        (o) =>
          (o.distributor_id && distIds.has(o.distributor_id)) ||
          (o.csa_id && csaIds.has(o.csa_id)) ||
          (o.retailer_id && retailerIds.has(o.retailer_id)) ||
          (o.salesman_id && memberIds.has(o.salesman_id)) ||
          (o.depot_id && depotIds.has(o.depot_id)),
      );


      return {
        distributors,
        csas,
        depots,
        retailers,
        orders,
        collections: (coll.data ?? []).filter(
          (c) =>
            (c.salesman_id && memberIds.has(c.salesman_id)) || (c.retailer_id && retailerIds.has(c.retailer_id)),
        ),
        visits: (vis.data ?? []).filter(
          (v) => memberIds.has(v.salesman_id) || (v.retailer_id && retailerIds.has(v.retailer_id)),
        ),
        attendance: (att.data ?? []).filter((a) => memberIds.has(a.user_id)),
        baSales: (ba.data ?? []).filter((b) => memberIds.has(b.ba_id)),
        profiles,
      };
    },
  });


  const orders = data?.orders ?? [];
  const secondary = orders.filter((o) => o.kind === "secondary");
  const primary = orders.filter((o) => o.kind === "primary");
  const sum = (rows: { total_amount: number | null }[]) => rows.reduce((a, r) => a + Number(r.total_amount ?? 0), 0);
  const secondaryValue = sum(secondary);
  const primaryValue = sum(primary);
  const collected = (data?.collections ?? []).reduce((a, c) => a + Number(c.amount ?? 0), 0);
  const distOutstanding = (data?.distributors ?? []).reduce((a, d) => a + Number(d.outstanding ?? 0), 0);
  const retailerOutstanding = (data?.retailers ?? []).reduce((a, r) => a + Number(r.outstanding ?? 0), 0);
  const outstanding = distOutstanding + retailerOutstanding;
  const visits = data?.visits ?? [];
  const productive = visits.filter((v) => v.productive).length;

  const nameOfUser = (id: string | null) =>
    (data?.profiles ?? []).find((p) => p.id === id)?.full_name || "—";
  const nameOfDist = (id: string | null) => (data?.distributors ?? []).find((d) => d.id === id)?.name || "—";
  const nameOfCsa = (id: string | null) => (data?.csas ?? []).find((c) => c.id === id)?.name || "—";
  const nameOfRetailer = (id: string | null) => (data?.retailers ?? []).find((r) => r.id === id)?.name || "—";

  // distributor-wise secondary + primary
  const distRows = (data?.distributors ?? []).map((d) => {
    const sec = secondary.filter((o) => o.distributor_id === d.id);
    const pri = primary.filter((o) => o.distributor_id === d.id);
    return {
      id: d.id,
      name: d.name,
      city: [d.city, d.state].filter(Boolean).join(", "),
      secondary: sum(sec),
      primary: sum(pri),
      outstanding: Number(d.outstanding ?? 0),
      retailers: (data?.retailers ?? []).filter((r) => r.distributor_id === d.id).length,
    };
  });

  const csaRows = (data?.csas ?? []).map((c) => {
    const pri = primary.filter((o) => o.csa_id === c.id);
    return {
      id: c.id,
      name: c.name,
      city: [c.city, c.state].filter(Boolean).join(", "),
      value: sum(pri),
      count: pri.length,
    };
  });

  const depotRows = (data?.depots ?? []).map((d) => {
    const csaIdsOfDepot = (data?.csas ?? []).filter((c) => c.depot_id === d.id).map((c) => c.id);
    const dep = orders.filter((o) => o.depot_id === d.id);
    return {
      id: d.id,
      name: d.name,
      city: [d.city, d.state].filter(Boolean).join(", "),
      csas: csaIdsOfDepot.length,
      value: sum(dep),
      count: dep.length,
    };
  });



  const retailerRows = (data?.retailers ?? []).map((r) => {
    const os = secondary.filter((o) => o.retailer_id === r.id);
    return {
      id: r.id,
      name: r.name,
      city: r.city ?? "",
      type: r.retailer_type,
      distributor: nameOfDist(r.distributor_id),
      sales: sum(os),
      outstanding: Number(r.outstanding ?? 0),
    };
  });

  const teamRows = (data?.profiles ?? []).map((p) => {
    const os = secondary.filter((o) => o.salesman_id === p.id);
    const baAmt = (data?.baSales ?? [])
      .filter((b) => b.ba_id === p.id)
      .reduce((a, b) => a + Number(b.amount ?? 0), 0);
    const v = visits.filter((x) => x.salesman_id === p.id);
    const present = (data?.attendance ?? []).filter((a) => a.user_id === p.id && a.punch_in).length;
    const coll = (data?.collections ?? [])
      .filter((c) => c.salesman_id === p.id)
      .reduce((a, c) => a + Number(c.amount ?? 0), 0);
    return {
      id: p.id,
      name: p.full_name || "—",
      designation: p.designation ?? "",
      sales: sum(os) + baAmt,
      visits: v.length,
      productive: v.filter((x) => x.productive).length,
      collections: coll,
      presentDays: present,
    };
  });

  const reportingRows = (data?.profiles ?? [])
    .filter((p) => (p as { reports_to?: string | null }).reports_to && p.id !== me?.profile?.id)
    .map((p) => {
      const mgr = (p as { reports_to?: string | null }).reports_to ?? null;
      return {
        id: p.id,
        name: p.full_name || "—",
        designation: p.designation ?? "",
        managerName: mgr === me?.profile?.id ? "you" : nameOfUser(mgr),
      };
    });

  const exportPdf = () =>
    downloadReportPdf({
      fileName: "manager-report.pdf",
      title: "Manager Performance Report",
      subtitle: me?.profile?.full_name ?? "Sales Manager",
      meta: [
        `Secondary sales: ${rs(secondaryValue)}`,
        `Primary purchases: ${rs(primaryValue)}`,
        `Collections: ${rs(collected)}`,
        `Distributor outstanding: ${rs(distOutstanding)}`,
        `Retailer outstanding: ${rs(retailerOutstanding)}`,
      ],
      tables: [
        {
          title: "Distributor-wise",
          head: ["Distributor", "Retailers", "Secondary", "Primary", "Outstanding"],
          rows: distRows.map((d) => [d.name, d.retailers, rs(d.secondary), rs(d.primary), rs(d.outstanding)]),
        },
        {
          title: "CSA-wise",
          head: ["CSA", "Orders", "Value"],
          rows: csaRows.map((c) => [c.name, c.count, rs(c.value)]),
        },
        {
          title: "Retailer-wise",
          head: ["Retailer", "Type", "Distributor", "Sales", "Outstanding"],
          rows: retailerRows.map((r) => [r.name, r.type, r.distributor, rs(r.sales), rs(r.outstanding)]),
        },
        {
          title: "Team-wise",
          head: ["Member", "Sales", "Visits", "Productive", "Collections", "Present days"],
          rows: teamRows.map((t) => [t.name, rs(t.sales), t.visits, t.productive, rs(t.collections), t.presentDays]),
        },
      ],
    });

  const dt = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IN") : "—");

  const partyOf = (o: (typeof orders)[number]) =>
    o.retailer_id ? nameOfRetailer(o.retailer_id) : o.distributor_id ? nameOfDist(o.distributor_id) : nameOfCsa(o.csa_id);

  const cardDetails: Record<string, { title: string; head: string[]; rows: string[][] }> = {
    secondary: {
      title: "Secondary sales — order wise",
      head: ["Order", "Party", "Booked by", "Status", "Value", "Date"],
      rows: secondary.map((o) => [
        o.order_no,
        partyOf(o),
        nameOfUser(o.salesman_id),
        o.status,
        inr(Number(o.total_amount ?? 0)),
        dt(o.created_at),
      ]),
    },
    primary: {
      title: "Primary purchases — order wise",
      head: ["Order", "Distributor", "CSA", "Status", "Value", "Date"],
      rows: primary.map((o) => [
        o.order_no,
        nameOfDist(o.distributor_id),
        nameOfCsa(o.csa_id),
        o.status,
        inr(Number(o.total_amount ?? 0)),
        dt(o.created_at),
      ]),
    },
    collections: {
      title: "Collections — entry wise",
      head: ["Retailer", "Collected by", "Mode", "Amount", "Date"],
      rows: (data?.collections ?? []).map((c) => [
        nameOfRetailer(c.retailer_id),
        nameOfUser(c.salesman_id),
        c.mode ?? "—",
        inr(Number(c.amount ?? 0)),
        dt(c.created_at),
      ]),
    },
    distOutstanding: {
      title: "Distributor outstanding — party wise",
      head: ["Distributor", "City", "State", "Outstanding"],
      rows: (data?.distributors ?? [])
        .filter((d) => Number(d.outstanding ?? 0) > 0)
        .sort((a, b) => Number(b.outstanding ?? 0) - Number(a.outstanding ?? 0))
        .map((d) => [d.name, d.city ?? "—", d.state ?? "—", inr(Number(d.outstanding ?? 0))]),
    },
    retailerOutstanding: {
      title: "Retailer outstanding — party wise",
      head: ["Retailer", "Type", "Distributor", "City", "Outstanding"],
      rows: (data?.retailers ?? [])
        .filter((r) => Number(r.outstanding ?? 0) > 0)
        .sort((a, b) => Number(b.outstanding ?? 0) - Number(a.outstanding ?? 0))
        .map((r) => [
          r.name,
          r.retailer_type ?? "Retailer",
          nameOfDist(r.distributor_id),
          r.city ?? "—",
          inr(Number(r.outstanding ?? 0)),
        ]),
    },
  };

  const detail = card ? cardDetails[card] : null;

  const exportDetail = () => {
    if (!detail) return;
    downloadReportPdf({
      fileName: `manager-${card}.pdf`,
      title: detail.title,
      subtitle: me?.profile?.full_name ?? "Sales Manager",
      meta: [`${detail.rows.length} records`],
      tables: [{ title: detail.title, head: detail.head, rows: detail.rows }],
    });
  };

  return (
    <Shell
      title="Manager Reports"
      subtitle={`${me?.profile?.full_name ?? "Manager"} · ${me?.role ? roleLabel[me.role] : ""}`}
    >
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading your team reports…</p>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:grid-cols-5">
            {[
              { key: "secondary", label: "Secondary Sales", value: secondaryValue, hint: `${secondary.length} orders` },
              { key: "primary", label: "Primary Purchases", value: primaryValue, hint: `${primary.length} orders` },
              { key: "collections", label: "Collections", value: collected, hint: `${(data?.collections ?? []).length} entries` },
              {
                key: "distOutstanding",
                label: "Distributor Outstanding",
                value: distOutstanding,
                hint: `${(data?.distributors ?? []).filter((d) => Number(d.outstanding ?? 0) > 0).length} distributors`,
                tone: "danger" as const,
              },
              {
                key: "retailerOutstanding",
                label: "Retailer Outstanding",
                value: retailerOutstanding,
                hint: `${(data?.retailers ?? []).filter((r) => Number(r.outstanding ?? 0) > 0).length} retailers`,
                tone: "danger" as const,
              },
            ].map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setCard(card === c.key ? null : c.key)}
                className={`text-left rounded-2xl transition ${card === c.key ? "ring-2 ring-primary" : "hover:opacity-90"}`}
              >
                <StatCard label={c.label} value={inr(c.value)} hint={`${c.hint} · tap for detail`} {...(c.tone ? { tone: c.tone } : {})} />
              </button>
            ))}
          </div>

          {detail ? (
            <Section title={detail.title}>
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="secondary">{detail.rows.length} records</Badge>
                <Button size="sm" variant="outline" className="ml-auto" onClick={exportDetail}>
                  Download PDF
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCard(null)}>
                  Close
                </Button>
              </div>
              <Table head={detail.head} rows={detail.rows} />
            </Section>
          ) : null}


          <TargetAssign />

          <Section title={`My reporting team (${reportingRows.length})`}>
            <p className="mb-2 text-xs text-muted-foreground">
              Every distributor, CSA, retailer and BA under your reporting chain rolls up into these reports.
            </p>
            <div className="space-y-2">
              {reportingRows.map((m) => (
                <div key={m.id} className="flex items-center justify-between rounded-2xl border border-border/60 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.designation || "Team member"}</p>
                  </div>
                  <Badge variant="secondary">Reports to {m.managerName}</Badge>
                </div>
              ))}
              {reportingRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No one is mapped to report to you yet.</p>
              ) : null}
            </div>
          </Section>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{distRows.length} distributors</Badge>
            <Badge variant="secondary">{csaRows.length} CSAs</Badge>
            <Badge variant="secondary">{depotRows.length} master depots</Badge>
            <Badge variant="secondary">{retailerRows.length} retailers</Badge>
            <Badge variant="secondary">
              {visits.length} visits · {productive} productive
            </Badge>
            <Button size="sm" variant="outline" className="ml-auto" onClick={exportPdf}>
              Download PDF
            </Button>
          </div>

          <Tabs defaultValue="distributors" className="mt-6">
            <TabsList>
              <TabsTrigger value="distributors">Distributors</TabsTrigger>
              <TabsTrigger value="csa">CSA</TabsTrigger>
              <TabsTrigger value="depots">Master Depot</TabsTrigger>
              <TabsTrigger value="retailers">Retailers</TabsTrigger>
              <TabsTrigger value="team">Team</TabsTrigger>
              <TabsTrigger value="orders">Orders</TabsTrigger>
              <TabsTrigger value="margin">Margin Budget</TabsTrigger>
            </TabsList>

            <TabsContent value="margin">
              <MarginBudget
                distributorIds={distRows.map((d) => d.id)}
                csaIds={csaRows.map((c) => c.id)}
                title="Margin budget — my zone"
              />
            </TabsContent>



            <TabsContent value="distributors">
              <Section title="Distributor-wise performance">
                <Table
                  head={["Distributor", "City", "Retailers", "Secondary", "Primary", "Outstanding"]}
                  rows={distRows.map((d) => [d.name, d.city, String(d.retailers), inr(d.secondary), inr(d.primary), inr(d.outstanding)])}
                  detail={(i) => {
                    const d = distRows[i]!;
                    const rows = orders
                      .filter((o) => o.distributor_id === d.id)
                      .map((o) => [o.order_no, o.kind, o.status, inr(Number(o.total_amount ?? 0)), dt(o.created_at)]);
                    return (
                      <MiniDetail
                        stats={[
                          ["Secondary", inr(d.secondary)],
                          ["Primary", inr(d.primary)],
                          ["Outstanding", inr(d.outstanding)],
                          ["Retailers", String(d.retailers)],
                        ]}
                        head={["Order", "Type", "Status", "Value", "Date"]}
                        rows={rows}
                      />
                    );
                  }}
                />
              </Section>
            </TabsContent>

            <TabsContent value="csa">
              <Section title="CSA-wise primary billing">
                <Table
                  head={["CSA", "City", "Orders", "Value"]}
                  rows={csaRows.map((c) => [c.name, c.city, String(c.count), inr(c.value)])}
                  detail={(i) => {
                    const c = csaRows[i]!;
                    const rows = primary
                      .filter((o) => o.csa_id === c.id)
                      .map((o) => [o.order_no, nameOfDist(o.distributor_id), o.status, inr(Number(o.total_amount ?? 0)), dt(o.created_at)]);
                    return (
                      <MiniDetail
                        stats={[
                          ["Orders", String(c.count)],
                          ["Value", inr(c.value)],
                        ]}
                        head={["Order", "Distributor", "Status", "Value", "Date"]}
                        rows={rows}
                      />
                    );
                  }}
                />
              </Section>
            </TabsContent>

            <TabsContent value="depots">
              <Section title="Master depot — mapped to my zone">
                <Table
                  head={["Master Depot", "City", "CSAs", "Orders", "Value"]}
                  rows={depotRows.map((d) => [d.name, d.city, String(d.csas), String(d.count), inr(d.value)])}
                  detail={(i) => {
                    const d = depotRows[i]!;
                    const rows = (data?.csas ?? [])
                      .filter((c) => c.depot_id === d.id)
                      .map((c) => [c.name, [c.city, c.state].filter(Boolean).join(", ") || "—"]);
                    return (
                      <MiniDetail
                        stats={[
                          ["Orders", String(d.count)],
                          ["Value", inr(d.value)],
                          ["CSAs", String(d.csas)],
                        ]}
                        head={["CSA", "City"]}
                        rows={rows}
                      />
                    );
                  }}
                />
                {depotRows.length === 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    No master depot is mapped to your team or CSAs yet.
                  </p>
                ) : null}
              </Section>
            </TabsContent>



            <TabsContent value="retailers">
              <Section title="Retailer / outlet-wise sales">
                <Table
                  head={["Retailer", "Type", "City", "Distributor", "Sales", "Outstanding"]}
                  rows={retailerRows.map((r) => [r.name, r.type, r.city, r.distributor, inr(r.sales), inr(r.outstanding)])}
                  detail={(i) => {
                    const r = retailerRows[i]!;
                    const rows = secondary
                      .filter((o) => o.retailer_id === r.id)
                      .map((o) => [o.order_no, nameOfUser(o.salesman_id), o.status, inr(Number(o.total_amount ?? 0)), dt(o.created_at)]);
                    const paid = (data?.collections ?? [])
                      .filter((c) => c.retailer_id === r.id)
                      .reduce((a, c) => a + Number(c.amount ?? 0), 0);
                    return (
                      <MiniDetail
                        stats={[
                          ["Sales", inr(r.sales)],
                          ["Collected", inr(paid)],
                          ["Outstanding", inr(r.outstanding)],
                        ]}
                        head={["Order", "Booked by", "Status", "Value", "Date"]}
                        rows={rows}
                      />
                    );
                  }}
                />
              </Section>
            </TabsContent>

            <TabsContent value="team">
              <Section title="Salesman / BA performance">
                <Table
                  head={["Member", "Role", "Sales", "Visits", "Productive", "Collections", "Present days"]}
                  rows={teamRows.map((t) => [
                    t.name,
                    t.designation,
                    inr(t.sales),
                    String(t.visits),
                    String(t.productive),
                    inr(t.collections),
                    String(t.presentDays),
                  ])}
                  detail={(i) => {
                    const t = teamRows[i]!;
                    const rows = secondary
                      .filter((o) => o.salesman_id === t.id)
                      .map((o) => [o.order_no, nameOfRetailer(o.retailer_id), o.status, inr(Number(o.total_amount ?? 0)), dt(o.created_at)]);
                    return (
                      <MiniDetail
                        stats={[
                          ["Sales", inr(t.sales)],
                          ["Visits", `${t.productive}/${t.visits} productive`],
                          ["Collections", inr(t.collections)],
                          ["Present days", String(t.presentDays)],
                        ]}
                        head={["Order", "Retailer", "Status", "Value", "Date"]}
                        rows={rows}
                      />
                    );
                  }}
                />
              </Section>
            </TabsContent>

            <TabsContent value="orders">
              <Section title="Recent orders">
                <Table
                  head={["Order", "Type", "Party", "Status", "Value", "Date"]}
                  rows={orders
                    .slice(0, 100)
                    .map((o) => [
                      o.order_no,
                      o.kind,
                      o.retailer_id
                        ? nameOfRetailer(o.retailer_id)
                        : o.distributor_id
                          ? nameOfDist(o.distributor_id)
                          : nameOfCsa(o.csa_id),
                      o.status,
                      inr(Number(o.total_amount ?? 0)),
                      new Date(o.created_at).toLocaleDateString("en-IN"),
                    ])}
                  detail={(i) => {
                    const o = orders[i]!;
                    return (
                      <MiniDetail
                        stats={[
                          ["Order value", inr(Number(o.total_amount ?? 0))],
                          ["Status", o.status],
                          ["Type", o.kind],
                          ["Booked by", nameOfUser(o.salesman_id)],
                        ]}
                        head={["Party", "Distributor", "CSA", "Date"]}
                        rows={[[partyOf(o), nameOfDist(o.distributor_id), nameOfCsa(o.csa_id), dt(o.created_at)]]}
                      />
                    );
                  }}
                />
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Booked by: {orders.length ? nameOfUser(orders[0]?.salesman_id ?? null) : "—"} and team
                </p>
              </Section>
            </TabsContent>
          </Tabs>
        </>
      )}
    </Shell>
  );
}

function Table({
  head,
  rows,
  detail,
}: {
  head: string[];
  rows: string[][];
  detail?: (rowIndex: number) => ReactNode;
}) {
  const [open, setOpen] = useState<number | null>(null);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No data assigned yet.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-2 py-2 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((r, i) => (
            <Fragment key={i}>
              <tr
                onClick={detail ? () => setOpen(open === i ? null : i) : undefined}
                className={detail ? "cursor-pointer hover:bg-muted/50" : undefined}
              >
                {r.map((c, j) => (
                  <td key={j} className="whitespace-nowrap px-2 py-2">{c}</td>
                ))}
              </tr>
              {detail && open === i ? (
                <tr>
                  <td colSpan={head.length} className="bg-muted/30 px-2 py-3">
                    {detail(i)}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniDetail({ stats, head, rows }: { stats: [string, string][]; head: string[]; rows: string[][] }) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {stats.map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border/60 bg-background px-3 py-1.5">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</p>
            <p className="text-sm font-semibold">{v}</p>
          </div>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">No transactions recorded yet.</p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left uppercase tracking-wide text-muted-foreground">
              {head.map((h) => (
                <th key={h} className="whitespace-nowrap px-2 py-1 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {rows.slice(0, 50).map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className="whitespace-nowrap px-2 py-1">{c}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
