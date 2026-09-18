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

export const BA_BUCKET = "ba-appointments";
const MAX_MB = 5;

export async function openBaFile(path: string) {
  const { data, error } = await supabase.storage.from(BA_BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) {
    toast.error(error?.message || "Unable to open file");
    return;
  }
  window.open(data.signedUrl, "_blank", "noopener");
}

type Form = {
  outlet_name: string;
  outlet_owner_name: string;
  address: string;
  mobile: string;
  ba_name: string;
  ba_mobile: string;
  ba_alloted: string;
  coordinated_with_vendor: string;
  quotation_received: string;
  approved: string;
  approved_by_name: string;
  design_finalization: string;
  fitting: string;
  branding_done: string;
  notes: string;
};

const emptyForm: Form = {
  outlet_name: "",
  outlet_owner_name: "",
  address: "",
  mobile: "",
  ba_name: "",
  ba_mobile: "",
  ba_alloted: "no",
  coordinated_with_vendor: "no",
  quotation_received: "no",
  approved: "no",
  approved_by_name: "",
  design_finalization: "no",
  fitting: "no",
  branding_done: "no",
  notes: "",
};

type Files = {
  agreement: File | null;
  quotation: File | null;
  placePhotos: File[];
  donePhotos: File[];
};

const emptyFiles: Files = { agreement: null, quotation: null, placePhotos: [], donePhotos: [] };

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

async function uploadFile(file: File, kind: string, userId: string) {
  if (file.size > MAX_MB * 1024 * 1024) throw new Error(`${file.name} is larger than ${MAX_MB} MB`);
  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/${kind}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BA_BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

function BaForm({
  form,
  setForm,
  files,
  setFiles,
  onSubmit,
  submitLabel,
  pending,
  onCancel,
  fileHint,
}: {
  form: Form;
  setForm: (f: Form) => void;
  files: Files;
  setFiles: (f: Files) => void;
  onSubmit: () => void;
  submitLabel: string;
  pending: boolean;
  onCancel?: () => void;
  fileHint?: string;
}) {
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  return (
    <div className="space-y-3">
      {fileHint ? <p className="text-xs text-muted-foreground">{fileHint}</p> : null}
      <div className="space-y-1">
        <Label className="text-xs">Agreement upload (PDF / image, max {MAX_MB} MB)</Label>
        <Input
          type="file"
          accept="application/pdf,image/*"
          onChange={(e) => setFiles({ ...files, agreement: e.target.files?.[0] ?? null })}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Outlet name</Label>
          <Input value={form.outlet_name} onChange={(e) => set("outlet_name", e.target.value)} maxLength={160} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Outlet owner name</Label>
          <Input
            value={form.outlet_owner_name}
            onChange={(e) => set("outlet_owner_name", e.target.value)}
            maxLength={160}
          />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Address</Label>
          <Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} maxLength={500} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Mobile no</Label>
          <Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} maxLength={15} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">BA name</Label>
          <Input value={form.ba_name} onChange={(e) => set("ba_name", e.target.value)} maxLength={160} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">BA mobile no</Label>
          <Input value={form.ba_mobile} onChange={(e) => set("ba_mobile", e.target.value)} maxLength={15} />
        </div>
        <YesNo label="BA alloted" value={form.ba_alloted} onChange={(v) => set("ba_alloted", v)} />

        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Branding place photos (up to 3, max {MAX_MB} MB each)</Label>
          <Input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles({ ...files, placePhotos: Array.from(e.target.files ?? []).slice(0, 3) })}
          />
          {files.placePhotos.length ? (
            <p className="text-xs text-muted-foreground">{files.placePhotos.length} photo(s) selected</p>
          ) : null}
        </div>

        <YesNo
          label="Co-ordinate with vendor"
          value={form.coordinated_with_vendor}
          onChange={(v) => set("coordinated_with_vendor", v)}
        />
        <YesNo label="Quotation received" value={form.quotation_received} onChange={(v) => set("quotation_received", v)} />
        {form.quotation_received === "yes" ? (
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Quotation bill upload</Label>
            <Input
              type="file"
              accept="application/pdf,image/*"
              onChange={(e) => setFiles({ ...files, quotation: e.target.files?.[0] ?? null })}
            />
          </div>
        ) : null}

        <YesNo label="Approved" value={form.approved} onChange={(v) => set("approved", v)} />
        <div className="space-y-1">
          <Label className="text-xs">Approved by</Label>
          <Input
            value={form.approved_by_name}
            onChange={(e) => set("approved_by_name", e.target.value)}
            maxLength={120}
          />
        </div>
        <YesNo
          label="Design finalization"
          value={form.design_finalization}
          onChange={(v) => set("design_finalization", v)}
        />
        <YesNo label="Fitting" value={form.fitting} onChange={(v) => set("fitting", v)} />
        <YesNo label="Branding done" value={form.branding_done} onChange={(v) => set("branding_done", v)} />
        {form.branding_done === "yes" ? (
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Branding photos (up to 3)</Label>
            <Input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => setFiles({ ...files, donePhotos: Array.from(e.target.files ?? []).slice(0, 3) })}
            />
            {files.donePhotos.length ? (
              <p className="text-xs text-muted-foreground">{files.donePhotos.length} photo(s) selected</p>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Remark (optional)</Label>
          <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} maxLength={500} />
        </div>
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

export function BAAppointments({ userId }: { userId?: string | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);
  const [files, setFiles] = useState<Files>(emptyFiles);

  const { data: rows = [] } = useQuery({
    queryKey: ["ba-appointments", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ba_appointments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as BaAppointmentRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.outlet_name.trim()) throw new Error("Outlet name is required");
      if (files.placePhotos.length > 3) throw new Error("Maximum 3 branding place photos");
      if (files.donePhotos.length > 3) throw new Error("Maximum 3 branding done photos");
      const agreementPath = files.agreement ? await uploadFile(files.agreement, "agreement", userId!) : null;
      const quotationPath = files.quotation ? await uploadFile(files.quotation, "quotation", userId!) : null;
      const placePaths: string[] = [];
      for (const f of files.placePhotos) placePaths.push(await uploadFile(f, "branding-place", userId!));
      const donePaths: string[] = [];
      for (const f of files.donePhotos) donePaths.push(await uploadFile(f, "branding-done", userId!));

      const { error } = await supabase.from("ba_appointments").insert({
        created_by: userId!,
        outlet_name: form.outlet_name.trim(),
        outlet_owner_name: form.outlet_owner_name.trim() || null,
        address: form.address.trim() || null,
        mobile: form.mobile.trim() || null,
        ba_name: form.ba_name.trim() || null,
        ba_mobile: form.ba_mobile.trim() || null,
        ba_alloted: form.ba_alloted,
        agreement_path: agreementPath,
        branding_place_paths: placePaths,
        coordinated_with_vendor: form.coordinated_with_vendor,
        quotation_received: form.quotation_received,
        quotation_path: quotationPath,
        approved: form.approved,
        approved_by_name: form.approved_by_name.trim() || null,
        design_finalization: form.design_finalization,
        fitting: form.fitting,
        branding_done: form.branding_done,
        branding_done_paths: donePaths,
        notes: form.notes.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("BA appointment saved");
      setForm(emptyForm);
      setFiles(emptyFiles);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["ba-appointments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Section
      title="BA appointment"
      action={
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          <Plus className="mr-1 size-4" /> {open ? "Close" : "New"}
        </Button>
      }
    >
      {open ? (
        <div className="border-b border-border/60 p-3">
          <BaForm
            form={form}
            setForm={setForm}
            files={files}
            setFiles={setFiles}
            onSubmit={() => save.mutate()}
            submitLabel="Save appointment"
            pending={save.isPending || !userId}
          />
        </div>
      ) : null}

      <div className="divide-y divide-border/60">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No BA appointment added yet.</p>
        ) : (
          rows.map((r) => <BaRow key={r.id} row={r} editable />)
        )}
      </div>
    </Section>
  );
}

export type BaAppointmentRow = {
  id: string;
  outlet_name: string;
  outlet_owner_name: string | null;
  address: string | null;
  mobile: string | null;
  ba_name: string | null;
  ba_mobile: string | null;
  ba_alloted: string;
  agreement_path: string | null;
  branding_place_paths: string[] | null;
  coordinated_with_vendor: string;
  quotation_received: string;
  quotation_path: string | null;
  approved: string;
  approved_by_name: string | null;
  design_finalization: string;
  fitting: string;
  branding_done: string;
  branding_done_paths: string[] | null;
  notes: string | null;
  created_by: string;
  created_at: string;
};

const rowToForm = (r: BaAppointmentRow): Form => ({
  outlet_name: r.outlet_name ?? "",
  outlet_owner_name: r.outlet_owner_name ?? "",
  address: r.address ?? "",
  mobile: r.mobile ?? "",
  ba_name: r.ba_name ?? "",
  ba_mobile: r.ba_mobile ?? "",
  ba_alloted: r.ba_alloted ?? "no",
  coordinated_with_vendor: r.coordinated_with_vendor ?? "no",
  quotation_received: r.quotation_received ?? "no",
  approved: r.approved ?? "no",
  approved_by_name: r.approved_by_name ?? "",
  design_finalization: r.design_finalization ?? "no",
  fitting: r.fitting ?? "no",
  branding_done: r.branding_done ?? "no",
  notes: r.notes ?? "",
});

export function BaRow({
  row: r,
  byLabel,
  editable,
}: {
  row: BaAppointmentRow;
  byLabel?: string;
  editable?: boolean;
}) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [values, setValues] = useState<Form>(rowToForm(r));
  const [files, setFiles] = useState<Files>(emptyFiles);

  const update = useMutation({
    mutationFn: async () => {
      if (!values.outlet_name.trim()) throw new Error("Outlet name is required");
      const owner = r.created_by;
      const agreementPath = files.agreement ? await uploadFile(files.agreement, "agreement", owner) : r.agreement_path;
      const quotationPath = files.quotation ? await uploadFile(files.quotation, "quotation", owner) : r.quotation_path;
      let placePaths = r.branding_place_paths ?? [];
      if (files.placePhotos.length) {
        placePaths = [];
        for (const f of files.placePhotos) placePaths.push(await uploadFile(f, "branding-place", owner));
      }
      let donePaths = r.branding_done_paths ?? [];
      if (files.donePhotos.length) {
        donePaths = [];
        for (const f of files.donePhotos) donePaths.push(await uploadFile(f, "branding-done", owner));
      }
      const { error } = await supabase
        .from("ba_appointments")
        .update({
          outlet_name: values.outlet_name.trim(),
          outlet_owner_name: values.outlet_owner_name.trim() || null,
          address: values.address.trim() || null,
          mobile: values.mobile.trim() || null,
          ba_name: values.ba_name.trim() || null,
          ba_mobile: values.ba_mobile.trim() || null,
          ba_alloted: values.ba_alloted,
          agreement_path: agreementPath,
          branding_place_paths: placePaths,
          coordinated_with_vendor: values.coordinated_with_vendor,
          quotation_received: values.quotation_received,
          quotation_path: quotationPath,
          approved: values.approved,
          approved_by_name: values.approved_by_name.trim() || null,
          design_finalization: values.design_finalization,
          fitting: values.fitting,
          branding_done: values.branding_done,
          branding_done_paths: donePaths,
          notes: values.notes.trim() || null,
        })
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("BA appointment updated");
      setEdit(false);
      setFiles(emptyFiles);
      qc.invalidateQueries({ queryKey: ["ba-appointments"] });
      qc.invalidateQueries({ queryKey: ["office-manager"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">{r.outlet_name}</p>
          <p className="text-xs text-muted-foreground">
            {[byLabel ? `By ${byLabel}` : null, r.outlet_owner_name, r.mobile].filter(Boolean).join(" · ") || "—"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant={r.ba_alloted === "yes" ? "default" : "outline"}>BA: {r.ba_alloted}</Badge>
          <Badge variant={r.quotation_received === "yes" ? "default" : "outline"}>Quote: {r.quotation_received}</Badge>
          <Badge variant={r.approved === "yes" ? "default" : "outline"}>Approved: {r.approved}</Badge>
          <Badge variant={r.branding_done === "yes" ? "default" : "outline"}>Branding: {r.branding_done}</Badge>
          {editable ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setValues(rowToForm(r));
                setEdit((e) => !e);
              }}
            >
              {edit ? "Close" : "Edit"}
            </Button>
          ) : null}
        </div>
      </div>

      {edit ? (
        <BaForm
          form={values}
          setForm={setValues}
          files={files}
          setFiles={setFiles}
          onSubmit={() => update.mutate()}
          submitLabel="Save changes"
          pending={update.isPending}
          onCancel={() => setEdit(false)}
          fileHint="Leave file inputs empty to keep the already uploaded files."
        />
      ) : (
        <>
          {r.address ? <p className="text-xs text-muted-foreground">{r.address}</p> : null}
          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <span>BA name: {r.ba_name || "—"}</span>
            <span>BA mobile: {r.ba_mobile || "—"}</span>
            <span>Vendor co-ordination: {r.coordinated_with_vendor}</span>
            <span>Design finalization: {r.design_finalization}</span>
            <span>Fitting: {r.fitting}</span>
            <span>Approved by: {r.approved_by_name || "—"}</span>
            {r.notes ? <span className="sm:col-span-2">Remark: {r.notes}</span> : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {r.agreement_path ? <FileChip label="Agreement" path={r.agreement_path} /> : null}
            {r.quotation_path ? <FileChip label="Quotation bill" path={r.quotation_path} /> : null}
            {(r.branding_place_paths ?? []).map((p, i) => (
              <FileChip key={p} label={`Place photo ${i + 1}`} path={p} />
            ))}
            {(r.branding_done_paths ?? []).map((p, i) => (
              <FileChip key={p} label={`Branding photo ${i + 1}`} path={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function FileChip({ label, path }: { label: string; path: string }) {
  return (
    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openBaFile(path)}>
      {label}
    </Button>
  );
}
