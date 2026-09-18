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

export type BarcodeRow = {
  id: string;
  created_by: string;
  barcode_no: string;
  product_allotted: string;
  notes: string | null;
  created_at: string;
};

const emptyForm = { barcode_no: "", product_allotted: "", notes: "" };

/** Employee-facing barcode entry list. */
export function BarcodeTracker({ userId }: { userId?: string | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const { data: rows = [] } = useQuery({
    queryKey: ["barcodes", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("barcodes")
        .select("*")
        .eq("created_by", userId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as BarcodeRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.barcode_no.trim()) throw new Error("Barcode no is required");
      if (!form.product_allotted.trim()) throw new Error("Product allotted is required");
      const { error } = await supabase.from("barcodes").insert({
        created_by: userId!,
        barcode_no: form.barcode_no.trim(),
        product_allotted: form.product_allotted.trim(),
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Barcode saved");
      setForm(emptyForm);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["barcodes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Section
      title="Barcode"
      action={
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          <Plus className="mr-1 size-4" /> {open ? "Close" : "New"}
        </Button>
      }
    >
      {open ? (
        <div className="space-y-3 border-b border-border/60 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Barcode no</Label>
              <Input
                value={form.barcode_no}
                onChange={(e) => setForm((f) => ({ ...f, barcode_no: e.target.value }))}
                maxLength={60}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Product allotted</Label>
              <Input
                value={form.product_allotted}
                onChange={(e) => setForm((f) => ({ ...f, product_allotted: e.target.value }))}
                maxLength={200}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Remarks</Label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              maxLength={500}
            />
          </div>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            Save barcode
          </Button>
        </div>
      ) : null}

      <div className="divide-y divide-border/60">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No barcode added yet.</p>
        ) : (
          rows.map((r) => (
            <BarcodeEditRow
              key={r.id}
              row={r}
              onSaved={() => qc.invalidateQueries({ queryKey: ["barcodes"] })}
            />
          ))
        )}
      </div>
    </Section>
  );
}

/** Manager-side editable row. */
export function BarcodeEditRow({
  row,
  employeeName,
  onSaved,
}: {
  row: BarcodeRow;
  employeeName?: string;
  onSaved: () => void;
}) {
  const [edit, setEdit] = useState(false);
  const [values, setValues] = useState({
    barcode_no: row.barcode_no,
    product_allotted: row.product_allotted,
    notes: row.notes ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!values.barcode_no.trim() || !values.product_allotted.trim())
        throw new Error("Barcode no and product allotted are required");
      const { error } = await supabase
        .from("barcodes")
        .update({
          barcode_no: values.barcode_no.trim(),
          product_allotted: values.product_allotted.trim(),
          notes: values.notes.trim() || null,
        })
        .eq("id", row.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Barcode updated");
      setEdit(false);
      onSaved();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium tabular-nums">{row.barcode_no}</p>
          <p className="text-xs text-muted-foreground">
            {[row.product_allotted, employeeName ? `By ${employeeName}` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => setEdit((e) => !e)}>
          {edit ? "Cancel" : "Edit"}
        </Button>
      </div>
      {edit ? (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Barcode no</Label>
              <Input
                value={values.barcode_no}
                onChange={(e) => setValues((v) => ({ ...v, barcode_no: e.target.value }))}
                maxLength={60}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Product allotted</Label>
              <Input
                value={values.product_allotted}
                onChange={(e) => setValues((v) => ({ ...v, product_allotted: e.target.value }))}
                maxLength={200}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Remarks</Label>
            <Textarea
              rows={2}
              value={values.notes}
              onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
              maxLength={500}
            />
          </div>
          <Button size="sm" disabled={save.isPending} onClick={() => save.mutate()}>
            Save changes
          </Button>
        </div>
      ) : row.notes ? (
        <p className="text-xs text-muted-foreground">Remarks: {row.notes}</p>
      ) : null}
    </div>
  );
}
