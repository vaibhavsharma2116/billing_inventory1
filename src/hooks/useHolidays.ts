import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useHolidays() {
  return useQuery({
    queryKey: ["company_holidays"],
    queryFn: async () => {
      const { data, error } = await supabase.from("company_holidays").select("date");
      if (error) throw error;
      return (data || []).map((h) => h.date);
    },
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });
}
