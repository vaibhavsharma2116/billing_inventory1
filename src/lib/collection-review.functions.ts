import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

export const reviewCollectionServerFn = createServerFn({ method: "POST" })
  .validator((d: { id: string; approve: boolean; note?: string | undefined }) => d)
  .handler(async ({ data }) => {
    const url = process.env["SUPABASE_URL"] || process.env["VITE_SUPABASE_URL"];
    const serviceKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
    if (!url || !serviceKey) {
      throw new Error("Missing Supabase configuration");
    }

    const supabase = createClient(url, serviceKey);
    const { id, approve, note } = data;

    // Fetch collection row
    const { data: row, error: fetchErr } = await supabase
      .from("collections")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchErr || !row) {
      throw new Error("Collection not found");
    }

    if (row.status !== "pending") {
      throw new Error("Collection already reviewed");
    }

    // If retailer collection and approved, reduce retailer outstanding
    const rowAny = row as any;
    if (approve && rowAny.retailer_id) {
      const { data: ret } = await supabase
        .from("retailers")
        .select("outstanding")
        .eq("id", rowAny.retailer_id)
        .single();
      if (ret) {
        await supabase
          .from("retailers")
          .update({
            outstanding: Math.max(0, Number(ret.outstanding || 0) - Number(rowAny.amount || 0)),
          })
          .eq("id", rowAny.retailer_id);
      }
    }

    // If distributor collection and approved, reduce distributor outstanding
    if (approve && rowAny.distributor_id) {
      const { data: dist } = await supabase
        .from("distributors")
        .select("outstanding")
        .eq("id", rowAny.distributor_id)
        .single();
      if (dist) {
        await supabase
          .from("distributors")
          .update({
            outstanding: Math.max(0, Number(dist.outstanding || 0) - Number(rowAny.amount || 0)),
          })
          .eq("id", rowAny.distributor_id);
      }
    }

    // Update collection status
    const { error: updateErr } = await supabase
      .from("collections")
      .update({
        status: approve ? "approved" : "rejected",
        approved_at: new Date().toISOString(),
        review_note: note?.trim() || null,
      })
      .eq("id", id);

    if (updateErr) {
      throw new Error(updateErr.message);
    }

    return { success: true };
  });
