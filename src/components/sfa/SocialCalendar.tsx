import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const SOCIAL_BUCKET = "social-designs";
const MAX_MB = 25;

export const SOCIAL_PLATFORMS = ["Instagram", "Facebook", "X", "YouTube", "LinkedIn", "Threads"] as const;
export const CONTENT_TYPES = ["Post", "Story", "Reels", "Carousel"] as const;

export type SocialCalendarRow = {
  id: string;
  created_by: string;
  entry_date: string | null;
  day_label: string | null;
  platforms: string[] | null;
  content_pillar: string | null;
  content_type: string;
  handover_to_designer: string;
  design_path: string | null;
  design_mime: string | null;
  approved: string;
  approved_by_name: string | null;
  posting: string;
  in_data_bank: boolean;
  created_at: string;
};

export const dayFromDate = (d: string) =>
  d ? new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { weekday: "long" }) : "";

export async function openSocialFile(path: string) {
  const { data, error } = await supabase.storage.from(SOCIAL_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    toast.error(error?.message || "Unable to open file");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

function YesNo({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="yes">Yes</SelectItem>
          <SelectItem value="no">No</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

type Form = {
  entry_date: string;
  platforms: string[];
  content_pillar: string;
  content_type: string;
  handover_to_designer: string;
  approved: string;
  approved_by_name: string;
  posting: string;
};

const emptyForm: Form = {
  entry_date: today(),
  platforms: [],
  content_pillar: "",
  content_type: "Post",
  handover_to_designer: "no",
  approved: "no",
  approved_by_name: "",
  posting: "no",
};

const rowToForm = (r: SocialCalendarRow): Form => ({
  entry_date: r.entry_date ?? today(),
  platforms: r.platforms ?? [],
  content_pillar: r.content_pillar ?? "",
  content_type: r.content_type ?? "Post",
  handover_to_designer: r.handover_to_designer ?? "no",
  approved: r.approved ?? "no",
  approved_by_name: r.approved_by_name ?? "",
  posting: r.posting ?? "no",
});

async function uploadDesign(design: File, userId: string) {
  if (design.size > MAX_MB * 1024 * 1024) throw new Error(`File larger than ${MAX_MB} MB`);
  const ext = design.name.split(".").pop() || "bin";
  const path = `${userId}/design/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(SOCIAL_BUCKET).upload(path, design, { upsert: false });
  if (error) throw error;
  return { path, mime: design.type || null };
}

function SocialForm({
  form,
  setForm,
  design,
  setDesign,
  onSubmit,
  submitLabel,
  pending,
  onCancel,
  fileHint,
}: {
  form: Form;
  setForm: (f: Form) => void;
  design: File | null;
  setDesign: (f: File | null) => void;
  onSubmit: () => void;
  submitLabel: string;
  pending: boolean;
  onCancel?: () => void;
  fileHint?: string;
}) {
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Date</Label>
          <Input type="date" value={form.entry_date} onChange={(e) => set("entry_date", e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Day</Label>
          <Input value={dayFromDate(form.entry_date)} readOnly />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Platform</Label>
        <div className="flex flex-wrap gap-3">
          {SOCIAL_PLATFORMS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.platforms.includes(p)}
                onCheckedChange={(c) =>
                  set("platforms", c ? [...form.platforms, p] : form.platforms.filter((x) => x !== p))
                }
              />
              {p}
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">Content pillar (notes / remark)</Label>
        <Textarea
          rows={2}
          value={form.content_pillar}
          onChange={(e) => set("content_pillar", e.target.value)}
          maxLength={1000}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Content type</Label>
          <Select value={form.content_type} onValueChange={(v) => set("content_type", v)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONTENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <YesNo
          label="Handover to designer"
          value={form.handover_to_designer}
          onChange={(v) => set("handover_to_designer", v)}
        />
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Design upload (image or video, max {MAX_MB} MB)</Label>
          <Input type="file" accept="image/*,video/*" onChange={(e) => setDesign(e.target.files?.[0] ?? null)} />
          {fileHint ? <p className="text-xs text-muted-foreground">{fileHint}</p> : null}
          {design ? <p className="text-xs text-muted-foreground">{design.name}</p> : null}
        </div>
        <YesNo label="Approve" value={form.approved} onChange={(v) => set("approved", v)} />
        <div className="space-y-1">
          <Label className="text-xs">Approved by</Label>
          <Input
            value={form.approved_by_name}
            onChange={(e) => set("approved_by_name", e.target.value)}
            maxLength={120}
          />
        </div>
        <YesNo label="Posting" value={form.posting} onChange={(v) => set("posting", v)} />
      </div>

      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={onSubmit}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        {onCancel ? (
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function SocialCalendarCard({
  row,
  byLabel,
  editable,
}: {
  row: SocialCalendarRow;
  byLabel?: string;
  editable?: boolean;
}) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [values, setValues] = useState<Form>(rowToForm(row));
  const [design, setDesign] = useState<File | null>(null);

  const update = useMutation({
    mutationFn: async () => {
      if (!values.entry_date) throw new Error("Select a date");
      if (values.platforms.length === 0) throw new Error("Select at least one platform");
      let designPath = row.design_path;
      let designMime = row.design_mime;
      if (design) {
        const up = await uploadDesign(design, row.created_by);
        designPath = up.path;
        designMime = up.mime;
      }
      const { error } = await supabase
        .from("social_media_calendar")
        .update({
          entry_date: values.entry_date,
          day_label: dayFromDate(values.entry_date),
          platforms: values.platforms,
          content_pillar: values.content_pillar.trim() || null,
          content_type: values.content_type,
          handover_to_designer: values.handover_to_designer,
          design_path: designPath,
          design_mime: designMime,
          approved: values.approved,
          approved_by_name: values.approved_by_name.trim() || null,
          posting: values.posting,
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Calendar entry updated");
      setEdit(false);
      setDesign(null);
      qc.invalidateQueries({ queryKey: ["social-calendar"] });
      qc.invalidateQueries({ queryKey: ["office-manager"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            {row.entry_date ? `${row.entry_date} · ${row.day_label || dayFromDate(row.entry_date)}` : "Unscheduled"}
          </p>
          <p className="text-xs text-muted-foreground">
            {(row.platforms ?? []).join(", ") || "No platform"} · {row.content_type}
          </p>
          {byLabel ? <p className="text-xs text-muted-foreground">By {byLabel}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {row.in_data_bank ? <Badge variant="secondary">Data bank</Badge> : null}
          <Badge variant={row.handover_to_designer === "yes" ? "default" : "outline"}>
            Designer: {row.handover_to_designer}
          </Badge>
          <Badge variant={row.approved === "yes" ? "default" : "outline"}>Approved: {row.approved}</Badge>
          <Badge variant={row.posting === "yes" ? "default" : "outline"}>Posting: {row.posting}</Badge>
          {editable ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setValues(rowToForm(row));
                setEdit((e) => !e);
              }}
            >
              {edit ? "Close" : "Edit"}
            </Button>
          ) : null}
        </div>
      </div>

      {edit ? (
        <SocialForm
          form={values}
          setForm={setValues}
          design={design}
          setDesign={setDesign}
          onSubmit={() => update.mutate()}
          submitLabel="Save changes"
          pending={update.isPending}
          onCancel={() => setEdit(false)}
          fileHint="Leave empty to keep the current design file."
        />
      ) : (
        <>
          {row.content_pillar ? (
            <p className="text-xs text-muted-foreground">Pillar note: {row.content_pillar}</p>
          ) : null}
          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <span>Approved by: {row.approved_by_name || "—"}</span>
            <span>
              Design:{" "}
              {row.design_path ? (
                <button className="text-primary underline" onClick={() => openSocialFile(row.design_path!)}>
                  Open file
                </button>
              ) : (
                "—"
              )}
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export function SocialCalendar({ userId }: { userId?: string | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [design, setDesign] = useState<File | null>(null);
  const [realign, setRealign] = useState<Record<string, string>>({});

  const { data: rows = [] } = useQuery({
    queryKey: ["social-calendar", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("social_media_calendar")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as SocialCalendarRow[];
    },
  });

  const planned = rows.filter((r) => !r.in_data_bank);
  const bank = rows.filter((r) => r.in_data_bank);

  const save = useMutation({
    mutationFn: async () => {
      if (!form.entry_date) throw new Error("Select a date");
      if (form.platforms.length === 0) throw new Error("Select at least one platform");
      let designPath: string | null = null;
      let designMime: string | null = null;
      if (design) {
        const up = await uploadDesign(design, userId!);
        designPath = up.path;
        designMime = up.mime;
      }
      const { error } = await supabase.from("social_media_calendar").insert({
        created_by: userId!,
        entry_date: form.entry_date,
        day_label: dayFromDate(form.entry_date),
        platforms: form.platforms,
        content_pillar: form.content_pillar.trim() || null,
        content_type: form.content_type,
        handover_to_designer: form.handover_to_designer,
        design_path: designPath,
        design_mime: designMime,
        approved: form.approved,
        approved_by_name: form.approved_by_name.trim() || null,
        posting: form.posting,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Calendar entry saved");
      setForm(emptyForm);
      setDesign(null);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["social-calendar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: async ({ id, toBank, date }: { id: string; toBank: boolean; date?: string }) => {
      const values = toBank
        ? { in_data_bank: true }
        : { in_data_bank: false, entry_date: date!, day_label: dayFromDate(date!) };
      const { error } = await supabase.from("social_media_calendar").update(values).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["social-calendar"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Section
      title="Social media calendar"
      action={
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          <Plus className="mr-1 size-4" /> {open ? "Close" : "New"}
        </Button>
      }
    >
      {open ? (
        <div className="border-b border-border/60 p-3">
          <SocialForm
            form={form}
            setForm={setForm}
            design={design}
            setDesign={setDesign}
            onSubmit={() => save.mutate()}
            submitLabel="Save entry"
            pending={save.isPending || !userId}
          />
        </div>
      ) : null}

      <div className="divide-y divide-border/60">
        {planned.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No calendar entry added yet.</p>
        ) : (
          planned.map((r) => (
            <div key={r.id}>
              <SocialCalendarCard row={r} editable />
              <div className="px-3 pb-3">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={move.isPending}
                  onClick={() => move.mutate({ id: r.id, toBank: true })}
                >
                  Transfer to data bank
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="border-t border-border/60">
        <p className="px-3 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Data bank ({bank.length})
        </p>
        <div className="divide-y divide-border/60">
          {bank.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">Data bank is empty.</p>
          ) : (
            bank.map((r) => (
              <div key={r.id}>
                <SocialCalendarCard row={r} editable />
                <div className="flex flex-wrap items-end gap-2 px-3 pb-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Re-align date</Label>
                    <Input
                      type="date"
                      value={realign[r.id] ?? today()}
                      onChange={(e) => setRealign((s) => ({ ...s, [r.id]: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Day</Label>
                    <Input value={dayFromDate(realign[r.id] ?? today())} readOnly className="w-32" />
                  </div>
                  <Button
                    size="sm"
                    disabled={move.isPending}
                    onClick={() => move.mutate({ id: r.id, toBank: false, date: realign[r.id] ?? today() })}
                  >
                    Align back to calendar
                  </Button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </Section>
  );
}
