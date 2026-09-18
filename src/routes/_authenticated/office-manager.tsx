import { useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Star, Users } from "lucide-react";
import { downloadReportPdf } from "@/lib/report-pdf";

import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { Shell, Section, StatCard } from "@/components/sfa/Shell";
import { BaRow, type BaAppointmentRow } from "@/components/sfa/BAAppointments";
import { SocialCalendarCard, type SocialCalendarRow } from "@/components/sfa/SocialCalendar";
import { COMPLIANCE_ITEMS, monthLabel, type ComplianceRow } from "@/components/sfa/AccountCompliance";
import { BarcodeEditRow, type BarcodeRow } from "@/components/sfa/BarcodeTracker";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/office-manager")({
  head: () => ({
    meta: [
      { title: "Office Manager Dashboard — POPPiK SFA" },
      {
        name: "description",
        content: "Assign daily tasks to office employees, rate their day out of 5 and review monthly performance.",
      },
      { property: "og:title", content: "Office Manager Dashboard — POPPiK SFA" },
      { property: "og:description", content: "Task assignment, completion tracking and star ratings for office staff." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OfficeManagerPage,
});

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + "01";

type Task = {
  id: string;
  assigned_to: string;
  title: string;
  description: string | null;
  task_date: string;
  priority: string;
  status: string;
  completion_note: string | null;
  rating: number | null;
  rating_note: string | null;
};

function OfficeManagerPage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const userId = me?.profile?.id;
  const [form, setForm] = useState({ assignedTo: "", title: "", description: "", priority: "normal", taskDate: today() });
  const [reviewNote, setReviewNote] = useState<Record<string, string>>({});

  const { data } = useQuery({
    queryKey: ["office-manager", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [profiles, roles, tasks, reviews, influencers, baAppointments, socialRows, compliance, barcodes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, employee_code, designation, reports_to").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("office_tasks").select("*").gte("task_date", monthStart()).order("created_at", { ascending: false }),
        supabase.from("office_day_reviews").select("*").gte("work_date", monthStart()),
        supabase.from("influencer_appointments").select("*").order("created_at", { ascending: false }),
        supabase.from("ba_appointments").select("*").order("created_at", { ascending: false }),
        supabase.from("social_media_calendar").select("*").order("entry_date", { ascending: false }),
        supabase.from("account_compliance").select("*").order("period_month", { ascending: false }),
        supabase.from("barcodes").select("*").order("created_at", { ascending: false }),
      ]);
      const officeIds = new Set((roles.data ?? []).filter((r) => r.role === "office").map((r) => r.user_id));
      const employees = (profiles.data ?? []).filter(
        (p) => (officeIds.has(p.id) || p.reports_to === userId) && p.id !== userId,
      );
      const teamIds = new Set(employees.map((e) => e.id));
      return {
        employees,
        tasks: (tasks.data ?? []) as Task[],
        reviews: reviews.data ?? [],
        influencers: (influencers.data ?? []).filter((r) => teamIds.has(r.created_by)),
        baAppointments: ((baAppointments.data ?? []) as BaAppointmentRow[]).filter((r) => teamIds.has(r.created_by)),
        socialRows: ((socialRows.data ?? []) as SocialCalendarRow[]).filter((r) => teamIds.has(r.created_by)),
        compliance: ((compliance.data ?? []) as ComplianceRow[]).filter((r) => teamIds.has(r.created_by)),
        barcodes: ((barcodes.data ?? []) as BarcodeRow[]).filter((r) => teamIds.has(r.created_by)),
      };
    },
  });

  const employees = data?.employees ?? [];
  const tasks = data?.tasks ?? [];
  const reviews = data?.reviews ?? [];
  const influencers = data?.influencers ?? [];
  const [infEmp, setInfEmp] = useState("all");
  const filteredInfluencers = influencers.filter((r) => infEmp === "all" || r.created_by === infEmp);
  const baRows = data?.baAppointments ?? [];
  const [baEmp, setBaEmp] = useState("all");
  const filteredBa = baRows.filter((r) => baEmp === "all" || r.created_by === baEmp);
  const barcodeRows = data?.barcodes ?? [];
  const [barEmp, setBarEmp] = useState("all");
  const filteredBarcodes = barcodeRows.filter((r) => barEmp === "all" || r.created_by === barEmp);
  const complianceRows = data?.compliance ?? [];
  const [compEmp, setCompEmp] = useState("all");
  const filteredCompliance = complianceRows.filter((r) => compEmp === "all" || r.created_by === compEmp);
  const socialRows = data?.socialRows ?? [];
  const [socEmp, setSocEmp] = useState("all");
  const [socView, setSocView] = useState("calendar");
  const filteredSocial = socialRows
    .filter((r) => socEmp === "all" || r.created_by === socEmp)
    .filter((r) => (socView === "bank" ? r.in_data_bank : !r.in_data_bank));

  const todaysTasks = tasks.filter((t) => t.task_date === today());
  const doneToday = todaysTasks.filter((t) => t.status === "done").length;

  const nameOf = (id: string) => employees.find((e) => e.id === id)?.full_name ?? "—";

  const monthly = useMemo(
    () =>
      employees.map((e) => {
        const own = tasks.filter((t) => t.assigned_to === e.id);
        const done = own.filter((t) => t.status === "done").length;
        const rated = reviews.filter((r) => r.user_id === e.id);
        const avg = rated.length ? rated.reduce((s, r) => s + Number(r.stars), 0) / rated.length : 0;
        return {
          id: e.id,
          name: e.full_name,
          assigned: own.length,
          done,
          pct: own.length ? Math.round((done / own.length) * 100) : 0,
          avg,
          ratedDays: rated.length,
        };
      }),
    [employees, tasks, reviews],
  );

  const assign = useMutation({
    mutationFn: async () => {
      if (!form.assignedTo) throw new Error("Select an employee");
      if (!form.title.trim()) throw new Error("Task title is required");
      const { error } = await supabase.from("office_tasks").insert({
        assigned_to: form.assignedTo,
        assigned_by: userId!,
        title: form.title.trim(),
        description: form.description.trim() || null,
        priority: form.priority,
        task_date: form.taskDate,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task assigned");
      setForm((f) => ({ ...f, title: "", description: "" }));
      qc.invalidateQueries({ queryKey: ["office-manager"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rateTask = useMutation({
    mutationFn: async (v: { id: string; rating: number }) => {
      const { error } = await supabase
        .from("office_tasks")
        .update({ rating: v.rating, rated_by: userId!, rated_at: new Date().toISOString() })
        .eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task rated");
      qc.invalidateQueries({ queryKey: ["office-manager"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rateDay = useMutation({
    mutationFn: async (v: { employeeId: string; stars: number }) => {
      const { error } = await supabase.from("office_day_reviews").upsert(
        {
          user_id: v.employeeId,
          work_date: today(),
          stars: v.stars,
          note: reviewNote[v.employeeId]?.trim() || null,
          rated_by: userId!,
        },
        { onConflict: "user_id,work_date" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Daily rating saved");
      qc.invalidateQueries({ queryKey: ["office-manager"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell
      title="Office Manager"
      subtitle="Task assignment, completion tracking & performance ratings"
      nav={[{ to: "/office-manager", label: "Team", icon: Users }]}
    >
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Office employees" value={String(employees.length)} />
        <StatCard label="Tasks today" value={String(todaysTasks.length)} tone="primary" />
        <StatCard label="Completed today" value={String(doneToday)} tone="success" />
        <StatCard
          label="Pending today"
          value={String(todaysTasks.length - doneToday)}
          tone={todaysTasks.length - doneToday ? "danger" : "default"}
        />
      </div>

      <Section title="Assign a task">
        <div className="grid gap-3 p-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Employee</Label>
            <Select value={form.assignedTo} onValueChange={(v) => setForm((f) => ({ ...f, assignedTo: v }))}>
              <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Task date</Label>
            <Input type="date" value={form.taskDate} onChange={(e) => setForm((f) => ({ ...f, taskDate: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Task title</Label>
            <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="normal">Normal</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Details</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="sm:col-span-2">
            <Button disabled={assign.isPending} onClick={() => assign.mutate()}>
              {assign.isPending ? "Assigning…" : "Assign task"}
            </Button>
          </div>
        </div>
      </Section>

      <Section title={`Today's tasks (${todaysTasks.length})`}>
        <div className="divide-y divide-border/60">
          {todaysTasks.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No task assigned for today.</p>
          ) : (
            todaysTasks.map((t) => (
              <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium">{t.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {nameOf(t.assigned_to)}
                    {t.completion_note ? ` · ${t.completion_note}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={t.status === "done" ? "default" : "outline"}>{t.status}</Badge>
                  <StarPicker value={Number(t.rating ?? 0)} onPick={(n) => rateTask.mutate({ id: t.id, rating: n })} />
                </div>
              </div>
            ))
          )}
        </div>
      </Section>

      <Section title="End of day rating (out of 5)">
        <div className="divide-y divide-border/60">
          {employees.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No office employee mapped to you yet.</p>
          ) : (
            employees.map((e) => {
              const own = todaysTasks.filter((t) => t.assigned_to === e.id);
              const done = own.filter((t) => t.status === "done").length;
              const review = reviews.find((r) => r.user_id === e.id && r.work_date === today());
              return (
                <div key={e.id} className="space-y-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium">{e.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {done}/{own.length} tasks done today
                        {review ? ` · rated ${review.stars}/5` : ""}
                      </p>
                    </div>
                    <StarPicker value={Number(review?.stars ?? 0)} onPick={(n) => rateDay.mutate({ employeeId: e.id, stars: n })} />
                  </div>
                  <Textarea
                    rows={1}
                    placeholder="Feedback note (optional)"
                    value={reviewNote[e.id] ?? review?.note ?? ""}
                    onChange={(ev) => setReviewNote((n) => ({ ...n, [e.id]: ev.target.value }))}
                  />
                </div>
              );
            })
          )}
        </div>
      </Section>

      <Section
        title={`Influencer appointment report (${filteredInfluencers.length})`}
        action={
          <div className="flex items-center gap-2">
            <Select value={infEmp} onValueChange={setInfEmp}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={filteredInfluencers.length === 0}
              onClick={() =>
                downloadReportPdf({
                  fileName: `influencer-report-${today()}.pdf`,
                  title: "Influencer Appointment Report",
                  subtitle: infEmp === "all" ? "All office employees" : nameOf(infEmp),
                  meta: [`Generated: ${new Date().toLocaleString("en-IN")}`, `Records: ${filteredInfluencers.length}`],
                  tables: [
                    {
                      title: "Appointments",
                      head: ["Influencer", "Mobile", "Employee", "Agreement", "Content", "Posted"],
                      rows: filteredInfluencers.map((r) => [
                        r.name,
                        r.mobile || "-",
                        nameOf(r.created_by),
                        `Sign ${r.agreement_sign} / Accept ${r.agreement_accept}`,
                        `Recd ${r.content_received} / Appr ${r.content_approved}`,
                        (r.posted_platforms ?? []).join(", ") || "-",
                      ]),
                      align: ["left", "left", "left", "left", "left", "left"],
                    },
                  ],
                })
              }
            >
              <Download className="mr-1 size-4" /> PDF
            </Button>
          </div>
        }
      >
        <div className="divide-y divide-border/60">
          {filteredInfluencers.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No influencer appointment filled by your team yet.</p>
          ) : (
            filteredInfluencers.map((r) => (
              <div key={r.id} className="space-y-2 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      By {nameOf(r.created_by)} · {[r.mobile, r.pincode].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {r.insta_link ? (
                      <a href={r.insta_link} target="_blank" rel="noreferrer noopener" className="text-xs text-primary underline">
                        Instagram profile
                      </a>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1">
                    <Badge variant={r.agreement_sign === "yes" ? "default" : "outline"}>Sign: {r.agreement_sign}</Badge>
                    <Badge variant={r.agreement_accept === "yes" ? "default" : "outline"}>Accept: {r.agreement_accept}</Badge>
                    <Badge variant={r.content_received === "yes" ? "default" : "outline"}>Content: {r.content_received}</Badge>
                    <Badge variant={r.content_approved === "yes" ? "default" : "outline"}>Approved: {r.content_approved}</Badge>
                  </div>
                </div>
                {r.address ? <p className="text-xs text-muted-foreground">{r.address}</p> : null}
                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <span>Product: {r.product_chosen || "—"}</span>
                  <span>Dispatch: {r.dispatch_details || "—"}</span>
                  <span>Approved by: {r.approved_by_name || "—"}</span>
                  <span>Posted: {(r.posted_platforms ?? []).join(", ") || "—"}</span>
                </div>
              </div>
            ))
          )}
        </div>
      </Section>


      <Section
        title={`BA appointment report (${filteredBa.length})`}
        action={
          <div className="flex items-center gap-2">
            <Select value={baEmp} onValueChange={setBaEmp}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={filteredBa.length === 0}
              onClick={() =>
                downloadReportPdf({
                  fileName: `ba-appointment-report-${today()}.pdf`,
                  title: "BA Appointment Report",
                  subtitle: baEmp === "all" ? "All office employees" : nameOf(baEmp),
                  meta: [`Generated: ${new Date().toLocaleString("en-IN")}`, `Records: ${filteredBa.length}`],
                  tables: [
                    {
                      title: "Appointments",
                      head: ["Outlet", "Owner / Mobile", "BA", "Employee", "Vendor / Quote", "Approval", "Status"],
                      rows: filteredBa.map((r) => [
                        r.outlet_name,
                        [r.outlet_owner_name, r.mobile].filter(Boolean).join(" / ") || "-",
                        `${r.ba_name || "-"} ${r.ba_mobile || ""} (allot ${r.ba_alloted})`,
                        nameOf(r.created_by),
                        `Vendor ${r.coordinated_with_vendor} / Quote ${r.quotation_received}`,
                        `${r.approved}${r.approved_by_name ? ` by ${r.approved_by_name}` : ""}`,
                        `Design ${r.design_finalization} / Fitting ${r.fitting} / Branding ${r.branding_done}`,
                      ]),
                      align: ["left", "left", "left", "left", "left", "left", "left"],
                    },
                  ],
                })
              }
            >
              <Download className="mr-1 size-4" /> PDF
            </Button>
          </div>
        }
      >
        <div className="divide-y divide-border/60">
          {filteredBa.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No BA appointment filled by your team yet.</p>
          ) : (
            filteredBa.map((r) => <BaRow key={r.id} row={r} byLabel={nameOf(r.created_by)} />)
          )}
        </div>
      </Section>

      <Section
        title={`Social media calendar report (${filteredSocial.length})`}
        action={
          <div className="flex items-center gap-2">
            <Select value={socView} onValueChange={setSocView}>
              <SelectTrigger className="h-8 w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="calendar">Calendar</SelectItem>
                <SelectItem value="bank">Data bank</SelectItem>
              </SelectContent>
            </Select>
            <Select value={socEmp} onValueChange={setSocEmp}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={filteredSocial.length === 0}
              onClick={() =>
                downloadReportPdf({
                  fileName: `social-calendar-report-${today()}.pdf`,
                  title: "Social Media Calendar Report",
                  subtitle: socEmp === "all" ? "All office employees" : nameOf(socEmp),
                  meta: [
                    `Generated: ${new Date().toLocaleString("en-IN")}`,
                    `View: ${socView === "bank" ? "Data bank" : "Calendar"}`,
                    `Records: ${filteredSocial.length}`,
                  ],
                  tables: [
                    {
                      title: "Entries",
                      head: ["Date / Day", "Platforms", "Type", "Pillar note", "Employee", "Designer", "Approval", "Posting"],
                      rows: filteredSocial.map((r) => [
                        r.entry_date ? `${r.entry_date} / ${r.day_label || ""}` : "Unscheduled",
                        (r.platforms ?? []).join(", ") || "-",
                        r.content_type,
                        r.content_pillar || "-",
                        nameOf(r.created_by),
                        r.handover_to_designer,
                        `${r.approved}${r.approved_by_name ? ` by ${r.approved_by_name}` : ""}`,
                        r.posting,
                      ]),
                      align: ["left", "left", "left", "left", "left", "left", "left", "left"],
                    },
                  ],
                })
              }
            >
              <Download className="mr-1 size-4" /> PDF
            </Button>
          </div>
        }
      >
        <div className="divide-y divide-border/60">
          {filteredSocial.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No social media calendar entry yet.</p>
          ) : (
            filteredSocial.map((r) => <SocialCalendarCard key={r.id} row={r} byLabel={nameOf(r.created_by)} />)
          )}
        </div>
      </Section>

      <Section title="Monthly performance analysis">
        <div className="divide-y divide-border/60 text-sm">
          {monthly.length === 0 ? (
            <p className="p-4 text-muted-foreground">No data yet.</p>
          ) : (
            monthly.map((m) => (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <div>
                  <p className="font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.done}/{m.assigned} tasks · {m.ratedDays} days rated
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums font-medium">{m.pct}%</span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Star className="size-3.5 fill-warning text-warning" />
                    {m.avg ? m.avg.toFixed(1) : "—"}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </Section>
      <Section
        title={`Account compliance report (${filteredCompliance.length})`}
        action={
          <div className="flex items-center gap-2">
            <Select value={compEmp} onValueChange={setCompEmp}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={filteredCompliance.length === 0}
              onClick={() =>
                downloadReportPdf({
                  fileName: `account-compliance-report-${today()}.pdf`,
                  title: "Account Compliance Report",
                  subtitle: compEmp === "all" ? "All office employees" : nameOf(compEmp),
                  meta: [`Generated: ${new Date().toLocaleString("en-IN")}`, `Records: ${filteredCompliance.length}`],
                  tables: [
                    {
                      title: "Compliance status",
                      head: ["Month", "Employee", ...COMPLIANCE_ITEMS.map((i) => i.label)],
                      rows: filteredCompliance.map((r) => [
                        monthLabel(r.period_month),
                        nameOf(r.created_by),
                        ...COMPLIANCE_ITEMS.map((i) => r[i.key]),
                      ]),
                      align: ["left", "left", ...COMPLIANCE_ITEMS.map(() => "left" as const)],
                    },
                  ],
                })
              }
            >
              <Download className="mr-1 size-4" /> PDF
            </Button>
          </div>
        }
      >
        <div className="divide-y divide-border/60">
          {filteredCompliance.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No compliance status filled by your team yet.</p>
          ) : (
            filteredCompliance.map((r) => (
              <div key={r.id} className="space-y-2 p-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">{monthLabel(r.period_month)}</p>
                    <p className="text-xs text-muted-foreground">By {nameOf(r.created_by)}</p>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {COMPLIANCE_ITEMS.map((item) => (
                      <Badge key={item.key} variant={r[item.key] === "yes" ? "default" : "outline"}>
                        {item.label}: {r[item.key]}
                      </Badge>
                    ))}
                  </div>
                </div>
                {r.notes ? <p className="text-xs text-muted-foreground">Remarks: {r.notes}</p> : null}
              </div>
            ))
          )}
        </div>
      </Section>
      <Section
        title={`Barcode report (${filteredBarcodes.length})`}
        action={
          <div className="flex items-center gap-2">
            <Select value={barEmp} onValueChange={setBarEmp}>
              <SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {employees.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={filteredBarcodes.length === 0}
              onClick={() =>
                downloadReportPdf({
                  fileName: `barcode-report-${today()}.pdf`,
                  title: "Barcode Report",
                  subtitle: barEmp === "all" ? "All office employees" : nameOf(barEmp),
                  meta: [`Generated: ${new Date().toLocaleString("en-IN")}`, `Records: ${filteredBarcodes.length}`],
                  tables: [
                    {
                      title: "Barcodes",
                      head: ["Barcode no", "Product allotted", "Employee", "Remarks"],
                      rows: filteredBarcodes.map((r) => [
                        r.barcode_no,
                        r.product_allotted,
                        nameOf(r.created_by),
                        r.notes || "-",
                      ]),
                      align: ["left", "left", "left", "left"],
                    },
                  ],
                })
              }
            >
              <Download className="mr-1 size-4" /> PDF
            </Button>
          </div>
        }
      >
        <div className="divide-y divide-border/60">
          {filteredBarcodes.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No barcode added by your team yet.</p>
          ) : (
            filteredBarcodes.map((r) => (
              <BarcodeEditRow
                key={r.id}
                row={r}
                employeeName={nameOf(r.created_by)}
                onSaved={() => qc.invalidateQueries({ queryKey: ["office-manager"] })}
              />
            ))
          )}
        </div>
      </Section>
    </Shell>
  );
}

function StarPicker({ value, onPick }: { value: number; onPick: (n: number) => void }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <button key={i} type="button" onClick={() => onPick(i)} aria-label={`Rate ${i} star`}>
          <Star className={`size-4 ${i <= value ? "fill-warning text-warning" : "text-muted-foreground/40"}`} />
        </button>
      ))}
    </span>
  );
}
