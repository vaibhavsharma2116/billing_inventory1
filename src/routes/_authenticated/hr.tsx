import { useEffect, useMemo, useState } from "react";
import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useMe, roleHome } from "@/hooks/useAuth";
import { Shell, StatCard, Section } from "@/components/sfa/Shell";
import { AutoPayroll } from "@/components/sfa/AutoPayroll";
import { usePager } from "@/components/sfa/Pager";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inr, compactInr } from "@/lib/sfa";
import { removeEmployee } from "@/lib/admin-users.functions";
import { downloadReportPdf, rs } from "@/lib/report-pdf";

export const Route = createFileRoute("/_authenticated/hr")({
  head: () => ({
    meta: [
      { title: "HR & Payroll — POPPiK SFA" },
      { name: "description", content: "Employee master, payroll details, attendance, leave approvals and expense reports for HR." },
      { property: "og:title", content: "HR & Payroll — POPPiK SFA" },
      { property: "og:description", content: "Employee records, attendance, leave approval and expense reporting in one HR workspace." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HrRoute,
});

function HrRoute() {
  const { data: me, isLoading, sessionLoading } = useMe();
  if (isLoading || sessionLoading || !me) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">
        Loading your workspace…
      </div>
    );
  }
  if (me.role !== "hr" && me.role !== "super_admin") {
    return <Navigate to={roleHome[me.role]} replace />;
  }
  return <HrPage />;
}

type EmployeeDetail = {
  id?: string;
  user_id: string;
  date_of_birth: string | null;
  date_of_joining: string | null;
  gender: string | null;
  marital_status: string | null;
  blood_group: string | null;
  father_name: string | null;
  personal_email: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  department: string | null;
  designation: string | null;
  employment_type: string;
  work_location: string | null;
  reporting_manager: string | null;
  pan_no: string | null;
  aadhaar_no: string | null;
  uan_no: string | null;
  pf_no: string | null;
  esic_no: string | null;
  bank_name: string | null;
  bank_account_no: string | null;
  ifsc_code: string | null;
  account_holder: string | null;
  ctc_annual: number;
  status: string;
  exit_date: string | null;
  notes: string | null;
};

const emptyDetail = (userId: string): EmployeeDetail => ({
  user_id: userId,
  date_of_birth: null,
  date_of_joining: null,
  gender: null,
  marital_status: null,
  blood_group: null,
  father_name: null,
  personal_email: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
  address: null,
  city: null,
  state: null,
  pincode: null,
  department: null,
  designation: null,
  employment_type: "full_time",
  work_location: null,
  reporting_manager: null,
  pan_no: null,
  aadhaar_no: null,
  uan_no: null,
  pf_no: null,
  esic_no: null,
  bank_name: null,
  bank_account_no: null,
  ifsc_code: null,
  account_holder: null,
  ctc_annual: 0,
  status: "active",
  exit_date: null,
  notes: null,
});

const day = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString("en-IN") : "—");
const time = (v: string | null | undefined) => (v ? new Date(v).toLocaleTimeString("en-IN") : "—");
const duration = (pin: string | null | undefined, pout: string | null | undefined) => {
  if (!pin || !pout) return "—";
  const ms = new Date(pout).getTime() - new Date(pin).getTime();
  if (ms <= 0) return "—";
  const mins = Math.round(ms / 60000);
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};
const monthStart = () => new Date().toISOString().slice(0, 8) + "01";
const todayStr = () => new Date().toISOString().slice(0, 10);

function HrPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const openReport = (card: string) => navigate({ to: "/hr-report/$card", params: { card } });
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<EmployeeDetail | null>(null);
  const [editingName, setEditingName] = useState("");
  const [attDate, setAttDate] = useState(todayStr());
  const [attCity, setAttCity] = useState("all");
  const [attMode, setAttMode] = useState<"day" | "range">("day");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(todayStr());
  const [salaryFor, setSalaryFor] = useState<string | null>(null);
  const [calEmp, setCalEmp] = useState<string>("");
  const [calMonth, setCalMonth] = useState<string>(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  // Separate lightweight query for calendar view
  const { data: calData } = useQuery({
    queryKey: ["att-calendar", calEmp, calMonth],
    enabled: !!calEmp,
    queryFn: async () => {
      const yrStr = calMonth.split("-")[0] ?? "2026";
      const moStr = calMonth.split("-")[1] ?? "01";
      const yr = Number(yrStr);
      const mo = Number(moStr);
      const prev = new Date(yr, mo - 2, 1);
      const start = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(yr, mo, 0).getDate();
      const end = `${yr}-${String(mo).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const [att, leavs] = await Promise.all([
        supabase.from("attendance").select("work_date, punch_in, punch_out").eq("user_id", calEmp).gte("work_date", start).lte("work_date", end),
        supabase.from("leaves").select("leave_type, from_date, to_date, status").eq("user_id", calEmp).eq("status", "approved").gte("to_date", start),
      ]);
      return { attendance: att.data ?? [], leaves: leavs.data ?? [] };
    },
  });

  const { data, isLoading } = useQuery({
    queryKey: ["hr-workspace", from, to, attDate],
    queryFn: async () => {
      const [profilesRaw, roles, details, attendance, leaves, expenses, salaries] = await Promise.all([
        supabase.from("profiles").select("id, full_name, phone, designation, employee_code").order("full_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("employee_details").select("*"),
        supabase
          .from("attendance")
          .select("user_id, work_date, punch_in, punch_out, location_label")
          .gte("work_date", attDate < from ? attDate : from)
          .lte("work_date", attDate > to ? attDate : to)
          .order("work_date", { ascending: false }),
        supabase
          .from("leaves")
          .select("id, user_id, leave_type, from_date, to_date, status, reason, created_at")
          .order("created_at", { ascending: false }),
        supabase
          .from("expenses")
          .select("id, user_id, expense_date, kind, distance_km, ta_amount, da_amount, bill_amount, total_amount, route, vendor, notes, status")
          .gte("expense_date", from)
          .lte("expense_date", to)
          .order("expense_date", { ascending: false }),
        supabase.from("salary_structures").select("*").order("effective_from", { ascending: false }),
      ]);
      const partyIds = new Set(
        (roles.data ?? [])
          .filter((r) => ["distributor", "csa", "depot"].includes(r.role))
          .map((r) => r.user_id),
      );
      return {
        profiles: (profilesRaw.data ?? []).filter((p) => !partyIds.has(p.id)),
        details: (details.data ?? []) as unknown as EmployeeDetail[],
        attendance: attendance.data ?? [],
        leaves: leaves.data ?? [],
        expenses: expenses.data ?? [],
        salaries: salaries.data ?? [],
      };
    },
  });

  const profiles = data?.profiles ?? [];
  const nameOf = (id: string | null | undefined) =>
    profiles.find((p) => p.id === id)?.full_name ?? "Employee";
  const detailOf = (id: string) => (data?.details ?? []).find((d) => d.user_id === id);
  const salaryOf = (id: string) => (data?.salaries ?? []).find((s) => s.user_id === id);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles;
    return profiles.filter((p) => {
      const d = detailOf(p.id);
      return [p.full_name, p.phone, p.employee_code, d?.department, d?.designation, d?.city]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [profiles, search, data?.details]);

  const { paged: pagedEmployees, bar: employeeBar } = usePager(filteredEmployees, 15);

  const pendingLeaves = (data?.leaves ?? []).filter((l) => l.status === "pending");
  const pendingExpenses = (data?.expenses ?? []).filter((e) => e.status === "pending");
  const cityOf = (id: string | null | undefined) => (id ? detailOf(id)?.city ?? "" : "");
  const [attView, setAttView] = useState<"records" | "absent" | "calendar">("records");
  const attCities = useMemo(
    () =>
      Array.from(new Set((data?.details ?? []).map((d) => d.city?.trim()).filter((c): c is string => !!c))).sort(),
    [data?.details],
  );
  const isSunday = (iso: string) => new Date(`${iso}T00:00:00`).getDay() === 0;
  const onApprovedLeave = (userId: string, iso: string) =>
    (data?.leaves ?? []).some(
      (l) => l.user_id === userId && l.status === "approved" && l.from_date <= iso && l.to_date >= iso,
    );
  const attDates = useMemo(() => {
    const dates =
      attMode === "day"
        ? [attDate]
        : (() => {
            const out: string[] = [];
            const cur = new Date(`${from}T00:00:00`);
            const end = new Date(`${to}T00:00:00`);
            while (cur <= end) {
              out.push(cur.toISOString().slice(0, 10));
              cur.setDate(cur.getDate() + 1);
            }
            return out;
          })();
    return dates.filter((d) => !isSunday(d));
  }, [attMode, attDate, from, to]);
  const absentRows = useMemo(() => {
    const scopedProfiles = profiles.filter((p) => attCity === "all" || cityOf(p.id) === attCity);
    const attendanceSet = new Set(
      (data?.attendance ?? []).filter((a) => a.punch_in).map((a) => `${a.user_id}|${a.work_date}`),
    );
    const rows: { id: string; name: string; city: string; dates: string[] }[] = [];
    for (const p of scopedProfiles) {
      const dObj = detailOf(p.id);
      const doj = dObj?.date_of_joining;
      const exitDate = dObj?.exit_date;
      const missed = attDates.filter((d) => {
        if (d > todayStr()) return false;
        if (doj && d < doj) return false;
        if (exitDate && d > exitDate) return false;
        if (attendanceSet.has(`${p.id}|${d}`)) return false;
        if (onApprovedLeave(p.id, d)) return false;
        return true;
      });
      if (missed.length) rows.push({ id: p.id, name: p.full_name ?? "Employee", city: cityOf(p.id) || "—", dates: missed });
    }
    return rows.sort((a, b) => b.dates.length - a.dates.length);
  }, [profiles, attCity, attDates, data?.attendance, data?.leaves]);
  const filteredAttendance = useMemo(
    () =>
      (data?.attendance ?? []).filter(
        (a) =>
          (attCity === "all" || cityOf(a.user_id) === attCity) &&
          (attMode === "range"
            ? a.work_date >= from && a.work_date <= to
            : a.work_date === attDate),
      ),
    [data?.attendance, attMode, attDate, from, to, attCity, data?.details],
  );
  const attendanceForDate = (data?.attendance ?? []).filter((a) => a.work_date === attDate);
  const presentToday = attendanceForDate.filter((a) => a.punch_in).length;
  const expenseTotal = (data?.expenses ?? []).reduce((s, e) => s + Number(e.total_amount ?? 0), 0);
  const monthlyPayroll = (data?.salaries ?? []).reduce(
    (s, r) =>
      s +
      Number(r.basic ?? 0) +
      Number(r.hra ?? 0) +
      Number(r.conveyance ?? 0) +
      Number((r as { medical_allowance?: number }).medical_allowance ?? 0) +
      Number((r as { special_allowance?: number }).special_allowance ?? 0) +
      Number(r.other_allowance ?? 0) -
      Number(r.deductions ?? 0),
    0,
  );

  const saveDetail = useMutation({
    mutationFn: async (row: EmployeeDetail) => {
      const payload = { ...row, ctc_annual: Number(row.ctc_annual || 0) };
      const { error } = await supabase
        .from("employee_details")
        .upsert(payload as never, { onConflict: "user_id" });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Employee record saved");
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["hr-workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeEmp = useMutation({
    mutationFn: async (id: string) => removeEmployee({ data: { id } }),
    onSuccess: () => {
      toast.success("Employee removed");
      qc.invalidateQueries({ queryKey: ["hr-workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reviewLeave = useMutation({
    mutationFn: async (v: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase.from("leaves").update({ status: v.status }).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      toast.success(v.status === "approved" ? "Leave approved" : "Leave rejected");
      qc.invalidateQueries({ queryKey: ["hr-workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const reviewExpense = useMutation({
    mutationFn: async (v: { id: string; status: "approved" | "rejected" }) => {
      const { error } = await supabase.from("expenses").update({ status: v.status }).eq("id", v.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Expense updated");
      qc.invalidateQueries({ queryKey: ["hr-workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const saveSalary = useMutation({
    mutationFn: async (v: SalaryRow & { user_id: string }) => {
      const existing = salaryOf(v.user_id);
      if (existing) {
        const { error } = await supabase.from("salary_structures").update(v).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("salary_structures").insert(v);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Salary structure saved");
      setSalaryFor(null);
      qc.invalidateQueries({ queryKey: ["hr-workspace"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const exportEmployees = () =>
    downloadReportPdf({
      fileName: "employee-master.pdf",
      title: "Employee Master",
      subtitle: "HR & Payroll",
      tables: [
        {
          title: `Employees (${filteredEmployees.length})`,
          head: ["Employee", "Department / Designation", "Joining", "Bank / PAN", "CTC"],
          align: ["left", "left", "left", "left", "right"],
          rows: filteredEmployees.map((p) => {
            const d = detailOf(p.id);
            return [
              `${p.full_name}${p.employee_code ? ` (${p.employee_code})` : ""}`,
              `${d?.department ?? "—"} / ${d?.designation ?? p.designation ?? "—"}`,
              day(d?.date_of_joining),
              `${d?.bank_account_no ?? "—"} / ${d?.pan_no ?? "—"}`,
              rs(Number(d?.ctc_annual ?? 0)),
            ];
          }),
        },
      ],
    });

  const exportAttendance = () =>
    downloadReportPdf({
      fileName: attMode === "day" ? `attendance-${attDate}.pdf` : `attendance-${from}-to-${to}.pdf`,
      title: "Attendance Report",
      subtitle: attMode === "day" ? `Date: ${day(attDate)}` : `${day(from)} → ${day(to)}`,
      meta: attCity !== "all" ? [`City: ${attCity}`] : [],
      tables: [
        {
          title: `Punch records (${filteredAttendance.length})`,
          head: ["Employee", "Date", "Punch in", "Punch out", "Duration", "Location"],
          align: ["left", "left", "left", "left", "left", "left"],
          rows: filteredAttendance.map((a) => [
            nameOf(a.user_id),
            day(a.work_date),
            time(a.punch_in),
            a.punch_out ? time(a.punch_out) : "Working",
            duration(a.punch_in, a.punch_out),
            a.location_label ?? "—",
          ]),
        },
      ],
    });

  const exportExpenses = () =>
    downloadReportPdf({
      fileName: `expense-report-${from}-to-${to}.pdf`,
      title: "Expense Report",
      subtitle: `${day(from)} → ${day(to)}`,
      meta: [`Total claimed: ${rs(expenseTotal)}`],
      tables: [
        {
          title: `Expenses (${(data?.expenses ?? []).length})`,
          head: ["Employee", "Date / Type", "TA", "DA", "Bill", "Total", "Status"],
          align: ["left", "left", "right", "right", "right", "right", "left"],
          rows: (data?.expenses ?? []).map((e) => [
            nameOf(e.user_id),
            `${day(e.expense_date)} • ${e.kind}`,
            rs(Number(e.ta_amount ?? 0)),
            rs(Number(e.da_amount ?? 0)),
            rs(Number(e.bill_amount ?? 0)),
            rs(Number(e.total_amount ?? 0)),
            e.status,
          ]),
        },
      ],
    });

  const exportLeaves = () =>
    downloadReportPdf({
      fileName: "leave-report.pdf",
      title: "Leave Report",
      subtitle: "All leave applications",
      tables: [
        {
          title: `Leave requests (${(data?.leaves ?? []).length})`,
          head: ["Employee", "Type", "From", "To", "Status"],
          align: ["left", "left", "left", "left", "left"],
          rows: (data?.leaves ?? []).map((l) => [
            nameOf(l.user_id),
            l.leave_type,
            day(l.from_date),
            day(l.to_date),
            l.status,
          ]),
        },
      ],
    });

  return (
    <Shell
      title="HR & Payroll"
      subtitle="Employee master • Attendance • Leave • Expenses"
      nav={[{ to: "/hr", label: "HR Desk" }]}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Employees" value={String(profiles.length)} tone="primary" onClick={() => openReport("employees")} />
        <StatCard label={`Present on ${day(attDate)}`} value={String(presentToday)} tone="success" onClick={() => openReport("attendance")} />
        <StatCard label="Pending Leaves" value={String(pendingLeaves.length)} tone="warning" onClick={() => openReport("leaves")} />
        <StatCard label="Pending Expenses" value={String(pendingExpenses.length)} tone="danger" onClick={() => openReport("expenses")} />
      </div>
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Expense (period)" value={compactInr(expenseTotal)} onClick={() => openReport("expenses")} />
        <StatCard label="Monthly Payroll (net)" value={compactInr(monthlyPayroll)} onClick={() => openReport("payroll")} />
        <StatCard label="Payroll Records" value={String((data?.salaries ?? []).length)} onClick={() => openReport("payroll")} />
        <StatCard label="Records Completed" value={String((data?.details ?? []).length)} onClick={() => openReport("records")} />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 rounded-2xl border border-border/70 bg-card p-3">
        <div className="space-y-1.5">
          <Label>From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label>To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <p className="text-xs text-muted-foreground">Attendance and expense reports use this date range.</p>
      </div>

      <Tabs defaultValue="employees" className="mt-6">
        <TabsList>
          <TabsTrigger value="employees">Employees</TabsTrigger>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="leaves">Leaves{pendingLeaves.length ? ` (${pendingLeaves.length})` : ""}</TabsTrigger>
          <TabsTrigger value="expenses">Expenses{pendingExpenses.length ? ` (${pendingExpenses.length})` : ""}</TabsTrigger>
          <TabsTrigger value="payroll">Payroll</TabsTrigger>
          <TabsTrigger value="auto-salary">Auto Salary</TabsTrigger>
        </TabsList>

        <TabsContent value="employees">
          <Section
            title="Employee master"
            action={<Button size="sm" variant="outline" onClick={exportEmployees}>Download PDF</Button>}
          >
            <div className="p-3">
              <Input
                placeholder="Search by name, code, department, city…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="divide-y divide-border/60">
              {isLoading ? (
                <p className="p-4 text-sm text-muted-foreground">Loading employees…</p>
              ) : filteredEmployees.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No employees found.</p>
              ) : (
                pagedEmployees.map((p) => {
                  const d = detailOf(p.id);
                  return (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.full_name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {d?.designation ?? p.designation ?? "—"}
                          {d?.department ? ` • ${d.department}` : ""}
                          {p.employee_code ? ` • ${p.employee_code}` : ""}
                          {p.phone ? ` • ${p.phone}` : ""}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          Joined {day(d?.date_of_joining)} • CTC {inr(Number(d?.ctc_annual ?? 0))}
                          {d?.pan_no ? ` • PAN ${d.pan_no}` : ""}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={d ? "default" : "secondary"}>{d ? d.status : "Details pending"}</Badge>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditing(d ? { ...d } : emptyDetail(p.id));
                            setEditingName(p.full_name);
                          }}
                        >
                          {d ? "Edit details" : "Add details"}
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          disabled={removeEmp.isPending}
                          onClick={() => {
                            if (window.confirm(`${p.full_name} ko remove kar dein? Iska login aur record delete ho jayega.`)) {
                              removeEmp.mutate(p.id);
                            }
                          }}
                        >
                          Remove
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
              {employeeBar}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="attendance">
          <Section
            title="Attendance"
            action={<Button size="sm" variant="outline" onClick={exportAttendance}>Download PDF</Button>}
          >
            <div className="flex flex-wrap items-end gap-3 border-b border-border/60 p-3">
              <div className="space-y-1.5">
                <Label>Panel</Label>
                <div className="flex flex-wrap gap-1">
                  <Button size="sm" variant={attView === "records" ? "default" : "outline"} onClick={() => setAttView("records")}>
                    Punch records
                  </Button>
                  <Button size="sm" variant={attView === "absent" ? "default" : "outline"} onClick={() => setAttView("absent")}>
                    Absent ({absentRows.length})
                  </Button>
                  <Button size="sm" variant={attView === "calendar" ? "default" : "outline"} onClick={() => setAttView("calendar")}>
                    📅 Calendar
                  </Button>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>View</Label>
                <div className="flex gap-1">
                  <Button size="sm" variant={attMode === "day" ? "default" : "outline"} onClick={() => setAttMode("day")}>
                    Day
                  </Button>
                  <Button size="sm" variant={attMode === "range" ? "default" : "outline"} onClick={() => setAttMode("range")}>
                    From–To
                  </Button>
                </div>
              </div>
              {attMode === "day" && (
                <div className="space-y-1.5">
                  <Label>Date</Label>
                  <Input type="date" value={attDate} onChange={(e) => setAttDate(e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label>City</Label>
                <select
                  className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={attCity}
                  onChange={(e) => setAttCity(e.target.value)}
                >
                  <option value="all">All cities</option>
                  {attCities.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
              {attMode === "day" ? (
                <p className="text-xs text-muted-foreground">
                  Present {presentToday} / {profiles.length} • Absent {Math.max(profiles.length - presentToday, 0)}
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {day(from)} → {day(to)} • {filteredAttendance.length} records (set range above)
                </p>
              )}
            </div>
            <div className="divide-y divide-border/60">
              {attView === "calendar" ? (
                <div className="p-3 space-y-4">
                  {/* Employee + Month selectors */}
                  <div className="flex flex-wrap gap-3 items-end">
                    <div className="space-y-1.5">
                      <Label>Employee</Label>
                      <select
                        className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[180px]"
                        value={calEmp}
                        onChange={(e) => setCalEmp(e.target.value)}
                      >
                        <option value="">— Select employee —</option>
                        {profiles.map((p) => (
                          <option key={p.id} value={p.id}>{p.full_name}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Month</Label>
                      <div className="flex gap-1 items-center">
                        <Button size="sm" variant="outline" onClick={() => {
                          const [yrStr2, moStr2] = calMonth.split("-");
                          const yr2 = Number(yrStr2 ?? "2026");
                          const mo2 = Number(moStr2 ?? "1");
                          const d = new Date(yr2, mo2 - 2, 1);
                          setCalMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
                        }}>←</Button>
                        <input
                          type="month"
                          className="h-9 rounded-md border border-input bg-background px-3 text-sm"
                          value={calMonth}
                          max={todayStr().slice(0, 7)}
                          onChange={(e) => setCalMonth(e.target.value)}
                        />
                        <Button size="sm" variant="outline" onClick={() => {
                          const [yrStr3, moStr3] = calMonth.split("-");
                          const yr3 = Number(yrStr3 ?? "2026");
                          const mo3 = Number(moStr3 ?? "1");
                          const d = new Date(yr3, mo3, 1);
                          const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
                          if (next <= todayStr().slice(0, 7)) setCalMonth(next);
                        }}>→</Button>
                      </div>
                    </div>
                  </div>

                  {!calEmp ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">Employee select karo calendar dekhne ke liye</p>
                  ) : (() => {
                    const yrStr4 = calMonth.split("-")[0] ?? "2026";
                    const moStr4 = calMonth.split("-")[1] ?? "01";
                    const yr = Number(yrStr4);
                    const mo = Number(moStr4);
                    const firstDay = new Date(yr, mo - 1, 1).getDay();
                    const daysInMonth = new Date(yr, mo, 0).getDate();
                    const today = todayStr();
                    const dObj = detailOf(calEmp);
                    const doj = dObj?.date_of_joining;
                    const exitDate = dObj?.exit_date;
                    const attMap = new Map((calData?.attendance ?? []).map((a) => [a.work_date, a]));
                    const getStatus = (dateStr: string) => {
                      const dow = new Date(`${dateStr}T00:00:00`).getDay();
                      if (dow === 0) return "sunday";
                      if (dateStr > today) return "future";
                      if (doj && dateStr < doj) return "not_joined";
                      if (exitDate && dateStr > exitDate) return "exited";
                      const att = attMap.get(dateStr);
                      const leave = (calData?.leaves ?? []).find(
                        (l) => l.from_date <= dateStr && l.to_date >= dateStr
                      );
                      if (att?.punch_in) {
                        const isHalf = leave?.leave_type?.toLowerCase().includes("half");
                        return isHalf ? "half" : "present";
                      }
                      if (leave) return "leave";
                      return "absent";
                    };
                    const cells: (string | null)[] = [];
                    for (let i = 0; i < firstDay; i++) cells.push(null);
                    for (let d = 1; d <= daysInMonth; d++) {
                      cells.push(`${calMonth}-${String(d).padStart(2, "0")}`);
                    }
                    const statusStyle: Record<string, string> = {
                      present: "bg-green-500/20 text-green-700 dark:text-green-400 border-green-400/40",
                      half: "bg-amber-400/20 text-amber-700 dark:text-amber-300 border-amber-400/40",
                      absent: "bg-red-500/15 text-red-700 dark:text-red-400 border-red-400/30",
                      leave: "bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-400/30",
                      sunday: "bg-muted/40 text-muted-foreground border-transparent",
                      future: "bg-background text-muted-foreground/50 border-border/30",
                      not_joined: "bg-muted/20 text-muted-foreground/40 border-dashed border-border/40",
                      exited: "bg-muted/20 text-muted-foreground/40 border-dashed border-border/40",
                    };
                    const statusLabel: Record<string, string> = {
                      present: "P", half: "½", absent: "A", leave: "L", sunday: "—", future: "", not_joined: "NA", exited: "—",
                    };
                    const monthName = new Date(yr, mo - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
                    // Summary counts
                    const allDates = Array.from({ length: daysInMonth }, (_, i) => `${calMonth}-${String(i + 1).padStart(2, "0")}`);
                    const counts = allDates.reduce((acc, d) => { const s = getStatus(d); acc[s] = (acc[s] || 0) + 1; return acc; }, {} as Record<string, number>);
                    return (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="font-semibold text-sm">{nameOf(calEmp)} — {monthName}</p>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" />Present {counts["present"] ?? 0}</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block" />Half Day {counts["half"] ?? 0}</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />Absent {counts["absent"] ?? 0}</span>
                            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block" />Leave {counts["leave"] ?? 0}</span>
                          </div>
                        </div>
                        {/* Day headers */}
                        <div className="grid grid-cols-7 gap-1 text-center">
                          {["Su","Mo","Tu","We","Th","Fr","Sa"].map((d) => (
                            <div key={d} className="text-[11px] font-semibold text-muted-foreground py-1">{d}</div>
                          ))}
                          {/* Calendar cells */}
                          {cells.map((dateStr, i) => {
                            if (!dateStr) return <div key={`empty-${i}`} />;
                            const s = getStatus(dateStr);
                            const dayNum = parseInt(dateStr.slice(8));
                            const att = attMap.get(dateStr);
                            const pinTime = att?.punch_in ? new Date(att.punch_in).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : null;
                            const poutTime = att?.punch_out ? new Date(att.punch_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }) : null;
                            return (
                              <div
                                key={dateStr}
                                title={[
                                  dateStr,
                                  s === "present" ? `In: ${pinTime}${poutTime ? ` | Out: ${poutTime}` : " | Working"}` : "",
                                  s === "half" ? `Half Day • In: ${pinTime}` : "",
                                  s === "absent" ? "Absent" : "",
                                  s === "leave" ? "On Leave" : "",
                                ].filter(Boolean).join(" — ")}
                                className={`rounded-lg border p-1 min-h-[42px] flex flex-col items-center justify-center cursor-default transition-all ${statusStyle[s]}`}
                              >
                                <span className="text-[11px] font-bold leading-none">{dayNum}</span>
                                <span className="text-[10px] font-semibold mt-0.5 leading-none">{statusLabel[s]}</span>
                              </div>
                            );
                          })}
                        </div>
                        {/* Punch details for present/half days */}
                        {Array.from(attMap.values()).filter(a => a.punch_in).length > 0 && (
                          <details className="mt-2">
                            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">Punch details ({Array.from(attMap.values()).filter(a => a.punch_in).length} days)</summary>
                            <div className="mt-2 space-y-1 max-h-48 overflow-y-auto">
                              {Array.from(attMap.values()).filter(a => a.punch_in).sort((a, b) => a.work_date.localeCompare(b.work_date)).map(a => (
                                <div key={a.work_date} className="flex justify-between text-xs px-2 py-1 rounded bg-muted/40">
                                  <span className="font-medium">{day(a.work_date)}</span>
                                  <span className="text-muted-foreground tabular-nums">
                                    In: {new Date(a.punch_in!).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}
                                    {a.punch_out ? ` · Out: ${new Date(a.punch_out).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })}` : " · Running"}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </details>
                        )}
                      </div>
                    );
                  })()}
                </div>
              ) : attView === "absent" ? (
                absentRows.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    {attMode === "day" ? "Is date koi employee absent nahi hai." : "Is range/city mein koi absent nahi hai."}
                  </p>
                ) : (
                  absentRows.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{r.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.city} • {attMode === "day" ? day(r.dates[0]) : r.dates.slice(0, 6).map(day).join(", ")}
                          {attMode === "range" && r.dates.length > 6 ? ` +${r.dates.length - 6} more` : ""}
                        </p>
                      </div>
                      <Badge variant="destructive">Absent {r.dates.length} day{r.dates.length > 1 ? "s" : ""}</Badge>
                    </div>
                  ))
                )
              ) : filteredAttendance.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">
                  {attMode === "day" ? "Is date ki koi attendance nahi hai." : "Is range/city mein koi attendance nahi hai."}
                </p>
              ) : (
                filteredAttendance.map((a) => (
                  <div key={`${a.user_id}-${a.work_date}`} className="flex items-center justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{nameOf(a.user_id)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {day(a.work_date)} • In {time(a.punch_in)}
                        {a.location_label ? ` • ${a.location_label}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {a.punch_out ? (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {duration(a.punch_in, a.punch_out)}
                        </span>
                      ) : null}
                      <Badge variant={a.punch_out ? "secondary" : "default"}>
                        {a.punch_out ? `Out ${time(a.punch_out)}` : "Working"}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="leaves">
          <Section
            title="Leave approvals"
            action={<Button size="sm" variant="outline" onClick={exportLeaves}>Download PDF</Button>}
          >
            <div className="divide-y divide-border/60">
              {(data?.leaves ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No leave requests yet.</p>
              ) : (
                (data?.leaves ?? []).map((l) => (
                  <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{nameOf(l.user_id)}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        <span className="capitalize">{l.leave_type.replace("_", " ")}</span> • {day(l.from_date)} → {day(l.to_date)}
                        {l.reason ? ` • ${l.reason}` : ""}
                      </p>
                    </div>
                    {l.status === "pending" ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => reviewLeave.mutate({ id: l.id, status: "approved" })}>
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reviewLeave.mutate({ id: l.id, status: "rejected" })}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <Badge variant={l.status === "approved" ? "default" : "destructive"}>{l.status}</Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="expenses">
          <Section
            title={`Expense report • ${inr(expenseTotal)}`}
            action={<Button size="sm" variant="outline" onClick={exportExpenses}>Download PDF</Button>}
          >
            <div className="divide-y divide-border/60">
              {(data?.expenses ?? []).length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No expenses in this range.</p>
              ) : (
                (data?.expenses ?? []).map((e) => (
                  <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {nameOf(e.user_id)} • {inr(Number(e.total_amount ?? 0))}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {day(e.expense_date)} • {e.kind} • TA {inr(Number(e.ta_amount ?? 0))} • DA {inr(Number(e.da_amount ?? 0))} • Bill {inr(Number(e.bill_amount ?? 0))}
                        {e.route ? ` • ${e.route}` : ""}
                        {e.vendor ? ` • ${e.vendor}` : ""}
                      </p>
                    </div>
                    {e.status === "pending" ? (
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => reviewExpense.mutate({ id: e.id, status: "approved" })}>
                          Approve
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => reviewExpense.mutate({ id: e.id, status: "rejected" })}
                        >
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <Badge variant={e.status === "approved" ? "default" : "destructive"}>{e.status}</Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="payroll">
          <Section title="Salary structures">
            <div className="divide-y divide-border/60">
              {profiles.map((p) => {
                const s = salaryOf(p.id) as Record<string, unknown> | undefined;
                const n = (k: string) => Number((s?.[k] as number | null) ?? 0);
                const gross =
                  n("basic") + n("hra") + n("conveyance") + n("medical_allowance") + n("special_allowance") + n("other_allowance");
                const net = gross - n("deductions");
                // Pro-rate check: if effective_from is after the 1st of current month, salary is pro-rated
                const effFrom = s?.["effective_from"] ? String(s["effective_from"]) : null;
                const monthFirstDay = new Date().toISOString().slice(0, 8) + "01";
                const isProRated = !!effFrom && effFrom > monthFirstDay;
                const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
                const eligibleDays = effFrom
                  ? daysInMonth - new Date(`${effFrom}T00:00:00`).getDate() + 1
                  : daysInMonth;
                const proRatedNet = isProRated ? Math.round((net * eligibleDays) / daysInMonth) : net;
                return (
                  <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">{p.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {s
                          ? `Gross ${inr(gross)} • PF ${inr(n("pf_employee"))} • ESIC ${inr(n("esic_employee"))} • Mediclaim ${inr(n("mediclaim"))} • TDS ${inr(n("tds"))} • PT ${inr(n("professional_tax"))} • Total deductions ${inr(n("deductions"))}`
                          : "No salary structure yet"}
                      </p>
                      {effFrom && (
                        <p className="text-[11px] text-muted-foreground">
                          Effective from: {day(effFrom)}
                          {isProRated && ` — this month pro-rated ${inr(proRatedNet)} of full ${inr(net)}`}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge variant={isProRated ? "outline" : "secondary"} className={isProRated ? "text-warning" : ""}>
                        Net {inr(isProRated ? proRatedNet : net)}
                      </Badge>
                      <Button size="sm" variant="outline" onClick={() => setSalaryFor(p.id)}>
                        {s ? "Edit" : "Add"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="auto-salary">
          <AutoPayroll />
        </TabsContent>
      </Tabs>

      <EmployeeDialog
        open={!!editing}
        name={editingName}
        value={editing}
        saving={saveDetail.isPending}
        onClose={() => setEditing(null)}
        onChange={setEditing}
        onSave={() => editing && saveDetail.mutate(editing)}
      />

      <SalaryDialog
        open={!!salaryFor}
        name={salaryFor ? nameOf(salaryFor) : ""}
        existing={salaryFor ? salaryOf(salaryFor) : undefined}
        saving={saveSalary.isPending}
        onClose={() => setSalaryFor(null)}
        onSave={(v) => salaryFor && saveSalary.mutate({ ...v, user_id: salaryFor })}
      />
    </Shell>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  readOnly = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  readOnly?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input
        type={type}
        value={value}
        readOnly={readOnly}
        className={readOnly ? "bg-muted/60" : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function EmployeeDialog({
  open,
  name,
  value,
  saving,
  onClose,
  onChange,
  onSave,
}: {
  open: boolean;
  name: string;
  value: EmployeeDetail | null;
  saving: boolean;
  onClose: () => void;
  onChange: (v: EmployeeDetail) => void;
  onSave: () => void;
}) {
  if (!value) return null;
  const set = (k: keyof EmployeeDetail, v: string) =>
    onChange({ ...value, [k]: k === "ctc_annual" ? (Number(v) || 0) : v || null } as EmployeeDetail);
  const str = (v: string | number | null) => (v === null || v === undefined ? "" : String(v));

  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Employee record — {name}</DialogTitle>
        </DialogHeader>

        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Personal</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date of birth" type="date" value={str(value.date_of_birth)} onChange={(v) => set("date_of_birth", v)} />
          <Field label="Father / spouse name" value={str(value.father_name)} onChange={(v) => set("father_name", v)} />
          <Field label="Gender" value={str(value.gender)} onChange={(v) => set("gender", v)} />
          <Field label="Marital status" value={str(value.marital_status)} onChange={(v) => set("marital_status", v)} />
          <Field label="Blood group" value={str(value.blood_group)} onChange={(v) => set("blood_group", v)} />
          <Field label="Personal email" type="email" value={str(value.personal_email)} onChange={(v) => set("personal_email", v)} />
          <Field label="Emergency contact name" value={str(value.emergency_contact_name)} onChange={(v) => set("emergency_contact_name", v)} />
          <Field label="Emergency contact mobile" value={str(value.emergency_contact_phone)} onChange={(v) => set("emergency_contact_phone", v)} />
          <Field label="City" value={str(value.city)} onChange={(v) => set("city", v)} />
          <Field label="State" value={str(value.state)} onChange={(v) => set("state", v)} />
          <Field label="Pincode" value={str(value.pincode)} onChange={(v) => set("pincode", v)} />
        </div>
        <div className="space-y-1.5">
          <Label>Full address</Label>
          <Textarea rows={2} value={str(value.address)} onChange={(e) => set("address", e.target.value)} />
        </div>

        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employment</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Date of joining" type="date" value={str(value.date_of_joining)} onChange={(v) => set("date_of_joining", v)} />
          <Field label="Department" value={str(value.department)} onChange={(v) => set("department", v)} />
          <Field label="Designation" value={str(value.designation)} onChange={(v) => set("designation", v)} />
          <Field label="Employment type" value={str(value.employment_type)} onChange={(v) => set("employment_type", v)} />
          <Field label="Work location / HQ" value={str(value.work_location)} onChange={(v) => set("work_location", v)} />
          <Field label="Reporting manager" value={str(value.reporting_manager)} onChange={(v) => set("reporting_manager", v)} />
          <Field label="Status (active / inactive)" value={str(value.status)} onChange={(v) => set("status", v)} />
          <Field label="Exit date" type="date" value={str(value.exit_date)} onChange={(v) => set("exit_date", v)} />
        </div>

        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Payroll & statutory</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Annual CTC (₹)" type="number" value={str(value.ctc_annual)} onChange={(v) => set("ctc_annual", v)} />
          <Field label="PAN number" value={str(value.pan_no)} onChange={(v) => set("pan_no", v)} />
          <Field label="Aadhaar number" value={str(value.aadhaar_no)} onChange={(v) => set("aadhaar_no", v)} />
          <Field label="UAN number" value={str(value.uan_no)} onChange={(v) => set("uan_no", v)} />
          <Field label="PF number" value={str(value.pf_no)} onChange={(v) => set("pf_no", v)} />
          <Field label="ESIC number" value={str(value.esic_no)} onChange={(v) => set("esic_no", v)} />
          <Field label="Bank name" value={str(value.bank_name)} onChange={(v) => set("bank_name", v)} />
          <Field label="Bank account number" value={str(value.bank_account_no)} onChange={(v) => set("bank_account_no", v)} />
          <Field label="IFSC code" value={str(value.ifsc_code)} onChange={(v) => set("ifsc_code", v)} />
          <Field label="Account holder name" value={str(value.account_holder)} onChange={(v) => set("account_holder", v)} />
        </div>
        <div className="space-y-1.5">
          <Label>Notes</Label>
          <Textarea rows={2} value={str(value.notes)} onChange={(e) => set("notes", e.target.value)} />
        </div>

        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={onSave}>{saving ? "Saving…" : "Save record"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type SalaryRow = {
  basic: number;
  hra: number;
  conveyance: number;
  medical_allowance: number;
  special_allowance: number;
  other_allowance: number;
  pf_employee: number;
  pf_employer: number;
  esic_employee: number;
  esic_employer: number;
  mediclaim: number;
  tds: number;
  professional_tax: number;
  labour_welfare_fund: number;
  gratuity: number;
  loan_recovery: number;
  other_deductions: number;
  deductions: number;
  uan_no: string;
  esic_no: string;
  pan_no: string;
  effective_from: string;
};

const emptySalary = (): SalaryRow => ({
  basic: 0,
  hra: 0,
  conveyance: 0,
  medical_allowance: 0,
  special_allowance: 0,
  other_allowance: 0,
  pf_employee: 0,
  pf_employer: 0,
  esic_employee: 0,
  esic_employer: 0,
  mediclaim: 0,
  tds: 0,
  professional_tax: 0,
  labour_welfare_fund: 0,
  gratuity: 0,
  loan_recovery: 0,
  other_deductions: 0,
  deductions: 0,
  uan_no: "",
  esic_no: "",
  pan_no: "",
  effective_from: new Date().toISOString().slice(0, 8) + "01",
});

function SalaryDialog({
  open,
  name,
  existing,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  name: string;
  existing?: Record<string, unknown> | undefined;
  saving: boolean;
  onClose: () => void;
  onSave: (v: SalaryRow) => void;
}) {
  const [form, setForm] = useState<SalaryRow>(emptySalary);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [autoStat, setAutoStat] = useState(true);

  if (open && loadedFor !== name) {
    setLoadedFor(name);
    const base = emptySalary();
    const next = { ...base };
    if (existing) {
      for (const k of Object.keys(base) as (keyof SalaryRow)[]) {
        const raw = existing[k as string];
        if (raw === null || raw === undefined) continue;
        if (typeof base[k] === "number") (next[k] as number) = Number(raw) || 0;
        else (next[k] as string) = String(raw);
      }
    }
    setForm(next);
  }
  if (!open && loadedFor !== null) setLoadedFor(null);

  const num = (k: keyof SalaryRow) => (v: string) => setForm((f) => ({ ...f, [k]: Number(v) || 0 }));
  const txt = (k: keyof SalaryRow) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const gross =
    form.basic + form.hra + form.conveyance + form.medical_allowance + form.special_allowance + form.other_allowance;
  const employeeDeductions =
    form.pf_employee +
    form.esic_employee +
    form.mediclaim +
    form.tds +
    form.professional_tax +
    form.labour_welfare_fund +
    form.loan_recovery +
    form.other_deductions;
  const employerDeductions = form.pf_employer + form.esic_employer + form.gratuity;
  const totalDeductions = employeeDeductions + employerDeductions;
  const net = gross - totalDeductions;
  const ctc = gross;

  const applyGross = (v: string) => {
    const g = Number(v) || 0;
    setForm((f) => ({
      ...f,
      basic: Math.round(g * 0.5),
      hra: Math.round(g * 0.4),
      special_allowance: g - Math.round(g * 0.5) - Math.round(g * 0.4),
      conveyance: 0,
      medical_allowance: 0,
      other_allowance: 0,
    }));
  };

  // PF (employee + employer), ESIC and gratuity auto-calculate from Basic / gross.
  useEffect(() => {
    if (!autoStat) return;
    const pfBase = Math.min(form.basic, 15000);
    const pfEmp = Math.round(pfBase * 0.12);
    const esicOn = form.basic > 0 && form.basic <= 21000;
    const esicEmp = esicOn ? Math.ceil(gross * 0.0075) : 0;
    const esicEr = esicOn ? Math.ceil(gross * 0.0325) : 0;
    const grat = Math.round(form.basic * 0.0481);
    setForm((f) =>
      f.pf_employee === pfEmp &&
      f.pf_employer === pfEmp &&
      f.esic_employee === esicEmp &&
      f.esic_employer === esicEr &&
      f.gratuity === grat
        ? f
        : {
            ...f,
            pf_employee: pfEmp,
            pf_employer: pfEmp,
            esic_employee: esicEmp,
            esic_employer: esicEr,
            gratuity: grat,
            professional_tax: f.professional_tax || 200,
          },
    );
  }, [autoStat, form.basic, gross]);


  return (
    <Dialog open={open} onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Salary structure — {name}</DialogTitle>
        </DialogHeader>

        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gross salary</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Gross salary (monthly)" type="number" value={String(gross)} onChange={applyGross} />
          <p className="self-center text-xs text-muted-foreground">
            Auto split — Basic 50%, HRA 40%, Special allowance 10%. Employee + employer deductions both cut from gross.
          </p>
        </div>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Earnings breakup</p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Basic" type="number" value={String(form.basic)} onChange={num("basic")} />
          <Field label="HRA" type="number" value={String(form.hra)} onChange={num("hra")} />
          <Field label="Conveyance" type="number" value={String(form.conveyance)} onChange={num("conveyance")} />
          <Field label="Medical allowance" type="number" value={String(form.medical_allowance)} onChange={num("medical_allowance")} />
          <Field label="Special allowance" type="number" value={String(form.special_allowance)} onChange={num("special_allowance")} />
          <Field label="Other allowance" type="number" value={String(form.other_allowance)} onChange={num("other_allowance")} />
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Statutory deductions (employee)</p>
          <Button size="sm" variant={autoStat ? "default" : "outline"} onClick={() => setAutoStat((v) => !v)}>
            {autoStat ? "Auto calculate: On" : "Auto calculate: Off"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          PF (employee & employer) 12% of Basic (max ₹15,000). ESIC applies only when Basic is ₹21,000 or less —
          employee 0.75% and employer 3.25% of gross. Turn auto off to enter values manually.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="PF (employee 12% of Basic)" type="number" value={String(form.pf_employee)} onChange={num("pf_employee")} readOnly={autoStat} />
          <Field label="ESIC (employee 0.75%)" type="number" value={String(form.esic_employee)} onChange={num("esic_employee")} readOnly={autoStat} />
          <Field label="Mediclaim / health insurance" type="number" value={String(form.mediclaim)} onChange={num("mediclaim")} />
          <Field label="TDS (income tax)" type="number" value={String(form.tds)} onChange={num("tds")} />
          <Field label="Professional tax" type="number" value={String(form.professional_tax)} onChange={num("professional_tax")} />
          <Field label="Labour welfare fund" type="number" value={String(form.labour_welfare_fund)} onChange={num("labour_welfare_fund")} />
          <Field label="Loan / advance recovery" type="number" value={String(form.loan_recovery)} onChange={num("loan_recovery")} />
          <Field label="Other deductions" type="number" value={String(form.other_deductions)} onChange={num("other_deductions")} />
        </div>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Employer contributions (CTC)</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="PF (employer 12% of Basic)" type="number" value={String(form.pf_employer)} onChange={num("pf_employer")} readOnly={autoStat} />
          <Field label="ESIC (employer 3.25%)" type="number" value={String(form.esic_employer)} onChange={num("esic_employer")} readOnly={autoStat} />
          <Field label="Gratuity" type="number" value={String(form.gratuity)} onChange={num("gratuity")} readOnly={autoStat} />
        </div>

        <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Compliance references</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="PF UAN no" value={form.uan_no} onChange={txt("uan_no")} />
          <Field label="ESIC no" value={form.esic_no} onChange={txt("esic_no")} />
          <Field label="PAN no" value={form.pan_no} onChange={txt("pan_no")} />
          <Field
            label="Effective from"
            type="date"
            value={form.effective_from}
            onChange={(v) => setForm((f) => ({ ...f, effective_from: v }))}
          />
        </div>

        <div className="mt-2 grid gap-1 rounded-lg border border-border/60 bg-muted/40 p-3 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Gross salary</span><span className="font-medium tabular-nums">{inr(gross)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Employee deductions</span><span className="font-medium tabular-nums">-{inr(employeeDeductions)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Employer deductions</span><span className="font-medium tabular-nums">-{inr(employerDeductions)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Total deductions</span><span className="font-medium tabular-nums">-{inr(totalDeductions)}</span></div>
          <div className="flex justify-between"><span className="font-semibold">Net take home</span><span className="font-bold tabular-nums text-success">{inr(net)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Monthly CTC (gross)</span><span className="font-medium tabular-nums">{inr(ctc)}</span></div>

        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={saving} onClick={() => onSave({ ...form, deductions: totalDeductions })}>{saving ? "Saving…" : "Save"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

