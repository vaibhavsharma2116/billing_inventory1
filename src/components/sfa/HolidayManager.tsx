import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Section } from "@/components/sfa/Shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";

export function HolidayManager() {
  const qc = useQueryClient();
  const [date, setDate] = useState("");
  const [name, setName] = useState("");

  const { data: holidays = [], isLoading } = useQuery({
    queryKey: ["company_holidays_full"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_holidays").select("*").order("date", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const addHoliday = useMutation({
    mutationFn: async () => {
      if (!date || !name.trim()) throw new Error("Please enter both date and name");
      const { error } = await supabase.from("company_holidays").insert({ date, name: name.trim() });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Holiday added!");
      setDate("");
      setName("");
      qc.invalidateQueries({ queryKey: ["company_holidays_full"] });
      qc.invalidateQueries({ queryKey: ["company_holidays"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeHoliday = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("company_holidays").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Holiday removed");
      qc.invalidateQueries({ queryKey: ["company_holidays_full"] });
      qc.invalidateQueries({ queryKey: ["company_holidays"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Section title="Company Holidays Calendar">
      <p className="text-sm text-muted-foreground mb-4">Manage national and company-wide paid holidays. These days will automatically be excluded from Absent reports.</p>
      <div className="flex flex-col gap-6">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-4 bg-muted/20">
          <div className="flex-1 min-w-[200px]">
            <Label className="mb-2 block">Holiday Name</Label>
            <Input 
              placeholder="e.g. Diwali, Eid, Republic Day" 
              value={name} 
              onChange={(e) => setName(e.target.value)} 
            />
          </div>
          <div className="w-[180px]">
            <Label className="mb-2 block">Date</Label>
            <Input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)} 
            />
          </div>
          <Button 
            disabled={addHoliday.isPending || !name.trim() || !date}
            onClick={() => addHoliday.mutate()}
          >
            Add Holiday
          </Button>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {isLoading ? <p className="text-sm opacity-50">Loading holidays...</p> : null}
          {!isLoading && holidays.length === 0 ? <p className="text-sm opacity-50">No holidays added yet.</p> : null}
          {holidays.map((h) => (
            <div key={h.id} className="flex items-center justify-between rounded-lg border p-3 bg-white dark:bg-zinc-900 shadow-sm">
              <div>
                <div className="font-medium text-sm">{h.name}</div>
                <div className="text-xs opacity-70">
                  {new Date(h.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={() => {
                  if (confirm("Are you sure you want to remove this holiday?")) {
                    removeHoliday.mutate(h.id);
                  }
                }}
                disabled={removeHoliday.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>
    </Section>
  );
}
