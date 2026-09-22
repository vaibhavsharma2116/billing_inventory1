import { useState, useEffect } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarDays, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { Shell, Section, StatCard } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { LeaveApply } from "@/components/sfa/LeaveApply";
import { InfluencerAppointments } from "@/components/sfa/InfluencerAppointments";
import { BAAppointments } from "@/components/sfa/BAAppointments";
import { SocialCalendar } from "@/components/sfa/SocialCalendar";
import { AccountCompliance } from "@/components/sfa/AccountCompliance";
import { BarcodeTracker } from "@/components/sfa/BarcodeTracker";

export const Route = createFileRoute("/_authenticated/office")({
  head: () => ({
    meta: [
      { title: "Office Employee Dashboard — POPPiK SFA" },
      {
        name: "description",
        content: "Daily attendance, manager assigned tasks and performance score for office employees.",
      },
      { property: "og:title", content: "Office Employee Dashboard — POPPiK SFA" },
      { property: "og:description", content: "Punch in, finish assigned tasks and track your monthly performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: OfficePage,
});

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => today().slice(0, 8) + "01";

function OfficePage() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const userId = me?.profile?.id;
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [checkoutNote, setCheckoutNote] = useState("");
  const [elapsed, setElapsed] = useState("");

  // Live working-time clock: ticks every second while checked in, freezes on checkout.
  useEffect(() => {
    const att = data?.attendance;
    if (!att?.punch_in) { setElapsed(""); return; }
    const punchIn = new Date(att.punch_in).getTime();
    const end = att.punch_out ? new Date(att.punch_out).getTime() : null;
    const tick = () => {
      const diff = Math.max((end ?? Date.now()) - punchIn, 0);
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setElapsed(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    tick();
    if (!end) {
      const id = setInterval(tick, 1000);
      return () => clearInterval(id);
    }
  }, [data?.attendance]);

  const { data } = useQuery({
    queryKey: ["office-day", userId],
    enabled: !!userId,
    queryFn: async () => {
      const [attendance, tasks, monthTasks, reviews] = await Promise.all([
        supabase.from("attendance").select("*").eq("user_id", userId!).eq("work_date", today()).maybeSingle(),
        supabase
          .from("office_tasks")
          .select("*")
          .eq("assigned_to", userId!)
          .eq("task_date", today())
          .order("created_at"),
        supabase.from("office_tasks").select("status, rating, task_date").eq("assigned_to", userId!).gte("task_date", monthStart()),
        supabase.from("office_day_reviews").select("*").eq("user_id", userId!).gte("work_date", monthStart()).order("work_date", { ascending: false }),
      ]);
      return {
        attendance: attendance.data,
        tasks: tasks.data ?? [],
        monthTasks: monthTasks.data ?? [],
        reviews: reviews.data ?? [],
      };
    },
  });

  const tasks = data?.tasks ?? [];
  const doneToday = tasks.filter((t) => t.status === "done").length;
  const pendingToday = tasks.length - doneToday;
  const todayPct = tasks.length ? Math.round((doneToday / tasks.length) * 100) : 0;

  const monthTasks = data?.monthTasks ?? [];
  const monthDone = monthTasks.filter((t) => t.status === "done").length;
  const monthPct = monthTasks.length ? Math.round((monthDone / monthTasks.length) * 100) : 0;
  const reviews = data?.reviews ?? [];
  const avgStars = reviews.length
    ? (reviews.reduce((s, r) => s + Number(r.stars), 0) / reviews.length).toFixed(1)
    : "—";

  const punchedIn = !!data?.attendance?.punch_in && !data?.attendance?.punch_out;
  const todayReview = reviews.find((r) => r.work_date === today());

  const punch = useMutation({
    mutationFn: async (kind: "in" | "out") => {
      if (kind === "out") {
        const note = checkoutNote.trim();
        if (pendingToday > 0 && !note)
          throw new Error(`${pendingToday} task(s) pending — add a remark to check out.`);
        const { error } = await supabase
          .from("attendance")
          .update({ punch_out: new Date().toISOString(), checkout_note: note || null })
          .eq("user_id", userId!)
          .eq("work_date", today());
        if (error) throw error;
        return;
      }
      const { error } = await supabase.from("attendance").upsert(
        { user_id: userId!, work_date: today(), punch_in: new Date().toISOString() },
        { onConflict: "user_id,work_date" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Attendance updated");
      qc.invalidateQueries({ queryKey: ["office-day"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const complete = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("office_tasks")
        .update({
          status: "done",
          completed_at: new Date().toISOString(),
          completion_note: notes[id]?.trim() || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Task marked complete");
      qc.invalidateQueries({ queryKey: ["office-day"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Shell
      title={`Hello, ${me?.profile?.full_name || "Employee"}`}
      subtitle={new Date().toDateString()}
      nav={[{ to: "/office", label: "Today", icon: CalendarDays }]}
    >
      <div className="rounded-2xl bg-[image:var(--gradient-brand)] p-5 text-primary-foreground shadow-[var(--shadow-lift)]">
        <p className="text-xs uppercase tracking-[0.2em] opacity-70">Today's task completion</p>
        <p className="text-3xl font-semibold">{todayPct}%</p>
        <p className="mt-1 text-sm opacity-90">
          {doneToday} of {tasks.length} tasks done{pendingToday ? ` · ${pendingToday} pending` : ""}
        </p>
        <Progress value={todayPct} className="mt-3 bg-primary-foreground/20" />
        {punchedIn && pendingToday > 0 ? (
          <div className="mt-4">
            <Textarea
              rows={2}
              placeholder={`${pendingToday} task(s) pending — write today's remark to check out`}
              value={checkoutNote}
              onChange={(e) => setCheckoutNote(e.target.value)}
              className="bg-primary-foreground/10 text-primary-foreground placeholder:text-primary-foreground/70"
            />
          </div>
        ) : null}
        {elapsed ? (
          <div className="mt-3 rounded-xl bg-primary-foreground/10 px-4 py-3">
            <p className="text-xs uppercase tracking-widest opacity-70">Working time</p>
            <p className="mt-0.5 font-mono text-2xl font-semibold tabular-nums">{elapsed}</p>
            <p className="mt-1 text-xs opacity-80">
              In: {data?.attendance?.punch_in ? new Date(data.attendance.punch_in).toLocaleTimeString("en-IN") : "—"}
              {" · "}
              Out: {data?.attendance?.punch_out ? new Date(data.attendance.punch_out).toLocaleTimeString("en-IN") : "running"}
            </p>
          </div>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Button
            variant="secondary"
            className="flex-1"
            disabled={punch.isPending || (!!data?.attendance?.punch_out)}
            onClick={() => punch.mutate(punchedIn ? "out" : "in")}
          >
            {data?.attendance?.punch_out ? "Checked out" : punchedIn ? "Check Out" : "Check In"}
          </Button>
        </div>
        {punchedIn && pendingToday > 0 ? (
          <p className="mt-2 text-xs opacity-90">
            Pending tasks ke sath check out ke liye remark dena zaroori hai.
          </p>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Tasks today" value={String(tasks.length)} />
        <StatCard label="Completed today" value={String(doneToday)} tone="success" />
        <StatCard label="Month achievement" value={`${monthPct}%`} tone="primary" />
        <StatCard label="Avg manager rating" value={avgStars === "—" ? "—" : `${avgStars} / 5`} tone="warning" />
      </div>

      <Section title="Tasks assigned by manager">
        <div className="divide-y divide-border/60">
          {tasks.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No task assigned for today yet.</p>
          ) : (
            tasks.map((t) => (
              <div key={t.id} className="space-y-2 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{t.title}</p>
                    {t.description ? (
                      <p className="text-xs text-muted-foreground">{t.description}</p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={t.priority === "high" ? "destructive" : "secondary"}>{t.priority}</Badge>
                    <Badge variant={t.status === "done" ? "default" : "outline"}>{t.status}</Badge>
                    {t.rating ? <Stars value={Number(t.rating)} /> : null}
                  </div>
                </div>
                {t.status === "done" ? (
                  t.completion_note ? (
                    <p className="text-xs text-muted-foreground">Note: {t.completion_note}</p>
                  ) : null
                ) : (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Textarea
                      rows={1}
                      placeholder="Completion remark (optional)"
                      value={notes[t.id] ?? ""}
                      onChange={(e) => setNotes((n) => ({ ...n, [t.id]: e.target.value }))}
                    />
                    <Button size="sm" disabled={complete.isPending} onClick={() => complete.mutate(t.id)}>
                      Mark done
                    </Button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </Section>

      <Section title="Manager rating">
        <div className="p-3 text-sm">
          {todayReview ? (
            <div className="flex items-center gap-2">
              <Stars value={Number(todayReview.stars)} />
              <span className="text-muted-foreground">{todayReview.note || "Rated for today"}</span>
            </div>
          ) : (
            <p className="text-muted-foreground">Today's rating not given yet.</p>
          )}
        </div>
      </Section>

      <Section title="Monthly performance analysis">
        <div className="divide-y divide-border/60 text-sm">
          <Row label="Tasks assigned this month" value={String(monthTasks.length)} />
          <Row label="Tasks completed" value={String(monthDone)} />
          <Row label="Achievement" value={`${monthPct}%`} />
          <Row label="Days rated" value={String(reviews.length)} />
          <Row label="Average rating" value={avgStars === "—" ? "—" : `${avgStars} / 5`} />
        </div>
      </Section>

      <InfluencerAppointments userId={userId} />

      <BAAppointments userId={userId} />

      <SocialCalendar userId={userId} />

      <AccountCompliance userId={userId} />

      <BarcodeTracker userId={userId} />

      <LeaveApply userId={userId} />

    </Shell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between p-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function Stars({ value }: { value: number }) {
  return (
    <span className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`size-3.5 ${i <= value ? "fill-warning text-warning" : "text-muted-foreground/40"}`}
        />
      ))}
    </span>
  );
}
