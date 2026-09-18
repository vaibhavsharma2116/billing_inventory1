import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMe } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

const REASONS = [
  "Shop closed",
  "Owner not available",
  "Stock still available",
  "Payment pending / credit hold",
  "Price or scheme issue",
  "Buying from competitor",
  "Will order next visit",
  "Other",
];

export function MarkVisitDialog({
  retailerId,
  retailerName,
  invalidateKeys = ["salesman-day"],
  trigger,
}: {
  /** Pre-selected shop. When omitted, the salesman picks one in the dialog. */
  retailerId?: string | undefined;
  retailerName?: string | undefined;
  invalidateKeys?: string[] | undefined;
  trigger?: React.ReactNode | undefined;
}) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>(retailerId ?? "");
  const [reason, setReason] = useState<string>(REASONS[0]!);
  const [remark, setRemark] = useState("");
  const [followUp, setFollowUp] = useState("");

  const { data: retailers } = useQuery({
    queryKey: ["visit-retailers"],
    enabled: open && !retailerId,
    queryFn: async () => {
      const { data, error } = await supabase.from("retailers").select("id, name, city").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const userId = me?.profile?.id;
      if (!userId) throw new Error("Not signed in");
      const target = retailerId ?? selected;
      if (!target) throw new Error("Please select a shop");

      const notes = [
        `No order — ${reason}`,
        remark.trim() ? remark.trim() : null,
        followUp ? `Follow-up: ${followUp}` : null,
      ]
        .filter(Boolean)
        .join(" | ");

      const { error } = await supabase.from("visits").insert({
        salesman_id: userId,
        retailer_id: target,
        productive: false,
        notes,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Visit marked with remark");
      setOpen(false);
      setRemark("");
      setFollowUp("");
      setReason(REASONS[0]!);
      invalidateKeys.forEach((k) => qc.invalidateQueries({ queryKey: [k] }));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <MapPin className="size-4" /> Mark Visit
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark visit — no order</DialogTitle>
          <DialogDescription>
            {retailerName
              ? `Record your visit to ${retailerName} and why no order was booked.`
              : "Record a shop visit where no order was booked, with a remark."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {!retailerId ? (
            <div className="space-y-1.5">
              <Label>Shop</Label>
              <Select value={selected} onValueChange={(v) => setSelected(v)}>
                <SelectTrigger><SelectValue placeholder="Select shop" /></SelectTrigger>
                <SelectContent>
                  {(retailers ?? []).map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.name}{r.city ? ` — ${r.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label>Reason for no order</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {REASONS.map((r) => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label>Remark</Label>
            <Textarea
              rows={3}
              value={remark}
              onChange={(e) => setRemark(e.target.value)}
              placeholder="What the shop owner said, competitor activity, stock position…"
            />
          </div>

          <div className="space-y-1.5">
            <Label>Next follow-up date (optional)</Label>
            <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>Save visit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
