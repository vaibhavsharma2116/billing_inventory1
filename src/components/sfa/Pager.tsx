import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shared 15-per-page pagination for admin lists. */
export function usePager<T>(rows: T[], pageSize = 15) {
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [rows.length]);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const bar =
    totalPages > 1 ? (
      <div className="flex items-center justify-between p-3">
        <Button size="sm" variant="outline" disabled={safePage <= 1} onClick={() => setPage((p) => p - 1)}>
          <ChevronLeft className="mr-1 size-4" /> Previous
        </Button>
        <span className="text-sm text-muted-foreground">
          Page {safePage} of {totalPages}
        </span>
        <Button size="sm" variant="outline" disabled={safePage >= totalPages} onClick={() => setPage((p) => p + 1)}>
          Next <ChevronRight className="ml-1 size-4" />
        </Button>
      </div>
    ) : null;
  return { paged, bar, safePage, totalPages };
}
