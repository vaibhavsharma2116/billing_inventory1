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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const COMPLIANCE_ITEMS = [
  { key: "pf", label: "PF" },
  { key: "tds", label: "TDS" },
  { key: "esic", label: "ESIC" },
  { key: "ptrc", label: "PTRC" },
  { key: "gst", label: "GST" },
  { key: "mwf", label: "MWF" },
  { key: "ptec", label: "PTEC" },
] as const;

export type ComplianceKey = (typeof COMPLIANCE_ITEMS)[number]["key"];

export type ComplianceRow = {
  id: string;
  created_by: string;
  period_month: string;
  notes: string | null;
  created_at: string;
} & Record<ComplianceKey, string>;

const monthValue = () => new Date().toISOString().slice(0, 7);

const emptyForm = () => ({
  month: monthValue(),
  pf: "no",
  tds: "no",
  esic: "no",
  ptrc: "no",
  gst: "no",
  mwf: "no",
  ptec: "no",
  notes: "",
});

export function monthLabel(period: string) {
  return new Date(period).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
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

export function AccountCompliance({ userId }: { userId?: string | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const { data: rows = [] } = useQuery({
    queryKey: ["account-compliance", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_compliance")
        .select("*")
        .eq("created_by", userId!)
        .order("period_month", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ComplianceRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.month) throw new Error("Select the compliance month");
      const { error } = await supabase.from("account_compliance").insert({
        created_by: userId!,
        period_month: `${form.month}-01`,
        pf: form.pf,
        tds: form.tds,
        esic: form.esic,
        ptrc: form.ptrc,
        gst: form.gst,
        mwf: form.mwf,
        ptec: form.ptec,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Compliance status saved");
      setForm(emptyForm());
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["account-compliance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const patch = useMutation({
    mutationFn: async ({ id, key, value }: { id: string; key: ComplianceKey; value: string }) => {
      const { error } = await supabase
        .from("account_compliance")
        .update({ [key]: value } as Partial<Record<ComplianceKey, string>>)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["account-compliance"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const patchRow = useMutation({
    mutationFn: async ({ id, month, notes }: { id: string; month: string; notes: string }) => {
      if (!month) throw new Error("Select the compliance month");
      const { error } = await supabase
        .from("account_compliance")
        .update({ period_month: `${month}-01`, notes: notes.trim() || null })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Compliance updated");
      qc.invalidateQueries({ queryKey: ["account-compliance"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Section
      title="Account compliance"
      action={
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          <Plus className="mr-1 size-4" /> {open ? "Close" : "New"}
        </Button>
      }
    >
      {open ? (
        <div className="space-y-3 border-b border-border/60 p-3">
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">Compliance month</Label>
              <Input type="month" value={form.month} onChange={(e) => set("month", e.target.value)} />
            </div>
            {COMPLIANCE_ITEMS.map((item) => (
              <YesNo
                key={item.key}
                label={item.label}
                value={form[item.key]}
                onChange={(v) => set(item.key, v)}
              />
            ))}
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Remarks</Label>
            <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
          </div>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            Save compliance
          </Button>
        </div>
      ) : null}

      <div className="divide-y divide-border/60">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No compliance status filled yet.</p>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="space-y-2 p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium">{monthLabel(r.period_month)}</p>
                <div className="flex flex-wrap gap-1">
                  {COMPLIANCE_ITEMS.map((item) => (
                    <Badge key={item.key} variant={r[item.key] === "yes" ? "default" : "outline"}>
                      {item.label}: {r[item.key]}
                    </Badge>
                  ))}
                </div>
              </div>
              <div className="grid gap-2 sm:grid-cols-3 md:grid-cols-4">
                {COMPLIANCE_ITEMS.map((item) => (
                  <YesNo
                    key={item.key}
                    label={item.label}
                    value={r[item.key]}
                    onChange={(v) => patch.mutate({ id: r.id, key: item.key, value: v })}
                  />
                ))}
              </div>
              <RowDetailsEditor
                row={r}
                pending={patchRow.isPending}
                onSave={(month, notes) => patchRow.mutate({ id: r.id, month, notes })}
              />
            </div>
          ))
        )}
      </div>
    </Section>
  );
}

function RowDetailsEditor({
  row,
  pending,
  onSave,
}: {
  row: ComplianceRow;
  pending: boolean;
  onSave: (month: string, notes: string) => void;
}) {
  const [edit, setEdit] = useState(false);
  const [month, setMonth] = useState(row.period_month.slice(0, 7));
  const [notes, setNotes] = useState(row.notes ?? "");

  if (!edit) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2">
        {row.notes ? <p className="text-xs text-muted-foreground">Remarks: {row.notes}</p> : <span />}
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setMonth(row.period_month.slice(0, 7));
            setNotes(row.notes ?? "");
            setEdit(true);
          }}
        >
          Edit
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label className="text-xs">Compliance month</Label>
        <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Remarks</Label>
        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => onSave(month, notes)}>
          Save changes
        </Button>
        <Button size="sm" variant="outline" onClick={() => setEdit(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
