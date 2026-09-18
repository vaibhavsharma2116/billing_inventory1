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

const PLATFORMS = ["Instagram", "Facebook", "YouTube", "LinkedIn", "X"] as const;

type Form = {
  name: string;
  insta_link: string;
  mobile: string;
  address: string;
  pincode: string;
  agreement_sign: string;
  agreement_accept: string;
  product_chosen: string;
  dispatch_details: string;
  content_received: string;
  content_approved: string;
  approved_by_name: string;
  posted_platforms: string[];
};

const emptyForm: Form = {
  name: "",
  insta_link: "",
  mobile: "",
  address: "",
  pincode: "",
  agreement_sign: "no",
  agreement_accept: "no",
  product_chosen: "",
  dispatch_details: "",
  content_received: "no",
  content_approved: "no",
  approved_by_name: "",
  posted_platforms: [],
};

type InfluencerRow = Form & { id: string; created_by: string; created_at: string };

const toForm = (r: InfluencerRow): Form => ({
  name: r.name ?? "",
  insta_link: r.insta_link ?? "",
  mobile: r.mobile ?? "",
  address: r.address ?? "",
  pincode: r.pincode ?? "",
  agreement_sign: r.agreement_sign ?? "no",
  agreement_accept: r.agreement_accept ?? "no",
  product_chosen: r.product_chosen ?? "",
  dispatch_details: r.dispatch_details ?? "",
  content_received: r.content_received ?? "no",
  content_approved: r.content_approved ?? "no",
  approved_by_name: r.approved_by_name ?? "",
  posted_platforms: r.posted_platforms ?? [],
});

const toPayload = (form: Form) => ({
  name: form.name.trim(),
  insta_link: form.insta_link.trim() || null,
  mobile: form.mobile.trim() || null,
  address: form.address.trim() || null,
  pincode: form.pincode.trim() || null,
  agreement_sign: form.agreement_sign,
  agreement_accept: form.agreement_accept,
  product_chosen: form.product_chosen.trim() || null,
  dispatch_details: form.dispatch_details.trim() || null,
  content_received: form.content_received,
  content_approved: form.content_approved,
  approved_by_name: form.approved_by_name.trim() || null,
  posted_platforms: form.posted_platforms,
});

function YesNo({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
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

function InfluencerForm({
  form,
  setForm,
  onSubmit,
  submitLabel,
  pending,
  onCancel,
}: {
  form: Form;
  setForm: (f: Form) => void;
  onSubmit: () => void;
  submitLabel: string;
  pending: boolean;
  onCancel?: () => void;
}) {
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm({ ...form, [k]: v });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">Influencer name</Label>
          <Input value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={120} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Instagram link</Label>
          <Input
            value={form.insta_link}
            onChange={(e) => set("insta_link", e.target.value)}
            placeholder="https://instagram.com/..."
            maxLength={300}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Mobile no</Label>
          <Input value={form.mobile} onChange={(e) => set("mobile", e.target.value)} maxLength={15} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Pincode</Label>
          <Input value={form.pincode} onChange={(e) => set("pincode", e.target.value)} maxLength={10} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label className="text-xs">Address</Label>
          <Textarea rows={2} value={form.address} onChange={(e) => set("address", e.target.value)} maxLength={500} />
        </div>
        <YesNo label="Agreement sign" value={form.agreement_sign} onChange={(v) => set("agreement_sign", v)} />
        <YesNo label="Agreement accept" value={form.agreement_accept} onChange={(v) => set("agreement_accept", v)} />
        <div className="space-y-1">
          <Label className="text-xs">Product chosen</Label>
          <Input
            value={form.product_chosen}
            onChange={(e) => set("product_chosen", e.target.value)}
            placeholder="Product name"
            maxLength={200}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Dispatch detail</Label>
          <Input
            value={form.dispatch_details}
            onChange={(e) => set("dispatch_details", e.target.value)}
            placeholder="Courier / AWB / date"
            maxLength={300}
          />
        </div>
        <YesNo label="Content received" value={form.content_received} onChange={(v) => set("content_received", v)} />
        <YesNo label="Content approved" value={form.content_approved} onChange={(v) => set("content_approved", v)} />
        <div className="space-y-1">
          <Label className="text-xs">Approved by</Label>
          <Input
            value={form.approved_by_name}
            onChange={(e) => set("approved_by_name", e.target.value)}
            maxLength={120}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Posted on platform</Label>
        <div className="flex flex-wrap gap-3">
          {PLATFORMS.map((p) => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={form.posted_platforms.includes(p)}
                onCheckedChange={(c) =>
                  set(
                    "posted_platforms",
                    c ? [...form.posted_platforms, p] : form.posted_platforms.filter((x) => x !== p),
                  )
                }
              />
              {p}
            </label>
          ))}
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

export function InfluencerAppointments({ userId }: { userId?: string | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(emptyForm);

  const { data: rows = [] } = useQuery({
    queryKey: ["influencer-appointments", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("influencer_appointments")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InfluencerRow[];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Influencer name is required");
      const { error } = await supabase
        .from("influencer_appointments")
        .insert({ created_by: userId!, ...toPayload(form) });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Influencer appointment saved");
      setForm(emptyForm);
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["influencer-appointments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Section
      title="Influencer appointment status"
      action={
        <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
          <Plus className="mr-1 size-4" /> {open ? "Close" : "New"}
        </Button>
      }
    >
      {open ? (
        <div className="border-b border-border/60 p-3">
          <InfluencerForm
            form={form}
            setForm={setForm}
            onSubmit={() => save.mutate()}
            submitLabel="Save appointment"
            pending={save.isPending || !userId}
          />
        </div>
      ) : null}

      <div className="divide-y divide-border/60">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No influencer appointment added yet.</p>
        ) : (
          rows.map((r) => <InfluencerRowItem key={r.id} row={r} />)
        )}
      </div>
    </Section>
  );
}

/** Row with full edit support (used by employee + manager screens). */
export function InfluencerRowItem({ row: r, byLabel }: { row: InfluencerRow; byLabel?: string }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const [values, setValues] = useState<Form>(toForm(r));

  const update = useMutation({
    mutationFn: async () => {
      if (!values.name.trim()) throw new Error("Influencer name is required");
      const { error } = await supabase
        .from("influencer_appointments")
        .update(toPayload(values))
        .eq("id", r.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Appointment updated");
      setEdit(false);
      qc.invalidateQueries({ queryKey: ["influencer-appointments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium">{r.name}</p>
          <p className="text-xs text-muted-foreground">
            {[byLabel ? `By ${byLabel}` : null, r.mobile, r.pincode].filter(Boolean).join(" · ") || "—"}
          </p>
          {r.insta_link ? (
            <a
              href={r.insta_link}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-primary underline"
            >
              Instagram profile
            </a>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant={r.agreement_sign === "yes" ? "default" : "outline"}>Sign: {r.agreement_sign}</Badge>
          <Badge variant={r.agreement_accept === "yes" ? "default" : "outline"}>Accept: {r.agreement_accept}</Badge>
          <Badge variant={r.content_received === "yes" ? "default" : "outline"}>Content: {r.content_received}</Badge>
          <Badge variant={r.content_approved === "yes" ? "default" : "outline"}>Approved: {r.content_approved}</Badge>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setValues(toForm(r));
              setEdit((e) => !e);
            }}
          >
            {edit ? "Close" : "Edit"}
          </Button>
        </div>
      </div>

      {edit ? (
        <InfluencerForm
          form={values}
          setForm={setValues}
          onSubmit={() => update.mutate()}
          submitLabel="Save changes"
          pending={update.isPending}
          onCancel={() => setEdit(false)}
        />
      ) : (
        <>
          {r.address ? <p className="text-xs text-muted-foreground">{r.address}</p> : null}
          <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
            <span>Product: {r.product_chosen || "—"}</span>
            <span>Dispatch: {r.dispatch_details || "—"}</span>
            <span>Approved by: {r.approved_by_name || "—"}</span>
            <span>Posted: {(r.posted_platforms ?? []).join(", ") || "—"}</span>
          </div>
        </>
      )}
    </div>
  );
}
