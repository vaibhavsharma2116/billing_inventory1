import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMappedDistributors } from "@/hooks/useMappedDistributors";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Form = {
  name: string;
  owner_name: string;
  phone: string;
  address: string;
  city: string;
  area: string;
  state: string;
  pincode: string;
  gstin: string;
  email: string;
  margin_pct: string;
  display_amount: string;
};

const empty: Form = {
  name: "",
  owner_name: "",
  phone: "",
  address: "",
  city: "",
  area: "",
  state: "",
  pincode: "",
  gstin: "",
  email: "",
  margin_pct: "",
  display_amount: "",
};

const RETAILER_TYPES = [
  { value: "ba", label: "BA (Beauty Advisor)" },
  { value: "rba", label: "RBA (Roaming Beauty Advisor)" },
  { value: "no_ba", label: "Retail Outlet" },
] as const;

export function EditRetailerDialog({
  retailerId,
  invalidateKeys = [],
  trigger,
}: {
  retailerId: string;
  invalidateKeys?: string[];
  trigger?: React.ReactNode;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [retailerType, setRetailerType] = useState<string>("no_ba");
  const [distributorId, setDistributorId] = useState<string | null>(null);

  const { data: distributors = [] } = useMappedDistributors(open);

  const { data: retailer, isLoading } = useQuery({
    queryKey: ["retailer-edit", retailerId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await (supabase.from("retailers") as any)
        .select(
          "id, name, owner_name, phone, address, city, area, state, pincode, gstin, email, margin_pct, display_amount, retailer_type, distributor_id",
        )
        .eq("id", retailerId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!retailer) return;
    const r = retailer as typeof retailer & { area?: string | null; pincode?: string | null };
    setForm({
      name: r.name ?? "",
      owner_name: r.owner_name ?? "",
      phone: r.phone ?? "",
      address: r.address ?? "",
      city: r.city ?? "",
      area: r.area ?? "",
      state: r.state ?? "",
      pincode: r.pincode ?? "",
      gstin: r.gstin ?? "",
      email: r.email ?? "",
      margin_pct: String(r.margin_pct ?? 0),
      display_amount: String(r.display_amount ?? 0),
    });
    setRetailerType(r.retailer_type ?? "no_ba");
    setDistributorId(r.distributor_id ?? null);
  }, [retailer]);

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      if (!form.name.trim()) throw new Error("Shop name is required");
      const { error } = await supabase
        .from("retailers")
        .update({
          name: form.name.trim(),
          owner_name: form.owner_name.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          city: form.city.trim() || null,
          area: form.area.trim() || null,
          state: form.state.trim() || null,
          pincode: form.pincode.trim() || null,
          gstin: form.gstin.trim() || null,
          email: form.email.trim() || null,
          margin_pct: Number(form.margin_pct) || 0,
          display_amount: Number(form.display_amount) || 0,
          retailer_type: retailerType,
          distributor_id: distributorId,
        } as any)
        .eq("id", retailerId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Retailer updated");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["retailer-edit", retailerId] });
      const keys = invalidateKeys.length ? invalidateKeys : ["salesman-day", "order-booking"];
      keys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e: Error) => toast.error(e.message || "Could not update retailer"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm" className="text-xs">
            <Pencil className="mr-1 h-3 w-3" /> Edit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Retailer</DialogTitle>
          <DialogDescription>Update shop details, mapping and margin settings.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <p className="py-6 text-sm text-muted-foreground">Loading retailer…</p>
        ) : (
          <div className="grid gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="e-name">Shop name *</Label>
              <Input id="e-name" value={form.name} onChange={set("name")} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="e-owner">Owner</Label>
                <Input id="e-owner" value={form.owner_name} onChange={set("owner_name")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-phone">Phone</Label>
                <Input id="e-phone" inputMode="tel" value={form.phone} onChange={set("phone")} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="e-address">Address</Label>
              <Input id="e-address" value={form.address} onChange={set("address")} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="e-city">City</Label>
                <Input id="e-city" value={form.city} onChange={set("city")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-state">State</Label>
                <Input id="e-state" value={form.state} onChange={set("state")} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="e-area">Area</Label>
                <Input id="e-area" value={form.area} onChange={set("area")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-pincode">Pincode</Label>
                <Input id="e-pincode" inputMode="numeric" value={form.pincode} onChange={set("pincode")} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label htmlFor="e-email">Email</Label>
              <Input id="e-email" type="email" value={form.email} onChange={set("email")} />
            </div>
          </div>
            <div className="grid gap-1.5">
              <Label htmlFor="e-gstin">GSTIN</Label>
              <Input id="e-gstin" value={form.gstin} onChange={set("gstin")} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="e-margin">Retail margin %</Label>
                <Input id="e-margin" inputMode="decimal" value={form.margin_pct} onChange={set("margin_pct")} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="e-display">Display amount</Label>
                <Input id="e-display" inputMode="numeric" value={form.display_amount} onChange={set("display_amount")} />
              </div>
            </div>
            <div className="grid gap-1.5">
              <Label>Retailer type</Label>
              <Select value={retailerType} onValueChange={setRetailerType}>
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  {RETAILER_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>Mapped distributor</Label>
              <Select
                value={distributorId ?? "none"}
                onValueChange={(v) => setDistributorId(v === "none" ? null : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select distributor" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not mapped</SelectItem>
                  {distributors.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      {d.city ? ` (${d.city})` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={save.isPending || isLoading}>
            {save.isPending ? "Saving..." : "Save changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
