import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/** Optional location / ownership metadata every report row can carry. */
export type ReportRowMeta = {
  city?: string | null | undefined;
  area?: string | null | undefined;
  pincode?: string | null | undefined;
  salesman?: string | null | undefined;
};

type Row = ReportRowMeta & { label: string; sub: string; value: string };

const uniq = (list: (string | null | undefined)[]) =>
  Array.from(new Set(list.filter((v): v is string => !!v && v !== "—"))).sort();

/**
 * Shared search + city / area / pincode / salesman filtering for every
 * report list in the app. Dropdowns only render when the rows carry values.
 */
export function useReportFilters<T extends Row>(rows: T[], resetKey?: string) {
  const [q, setQ] = useState("");
  const [city, setCity] = useState("all");
  const [area, setArea] = useState("all");
  const [pincode, setPincode] = useState("all");
  const [salesman, setSalesman] = useState("all");

  const reset = () => {
    setQ("");
    setCity("all");
    setArea("all");
    setPincode("all");
    setSalesman("all");
  };

  useEffect(() => {
    reset();
  }, [resetKey]);

  const cities = useMemo(() => uniq(rows.map((r) => r.city)), [rows]);
  const areas = useMemo(() => uniq(rows.map((r) => r.area)), [rows]);
  const pincodes = useMemo(() => uniq(rows.map((r) => r.pincode)), [rows]);
  const salesmen = useMemo(() => uniq(rows.map((r) => r.salesman)), [rows]);

  const term = q.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (term && !`${r.label} ${r.sub} ${r.value}`.toLowerCase().includes(term)) return false;
        if (city !== "all" && r.city !== city) return false;
        if (area !== "all" && r.area !== area) return false;
        if (pincode !== "all" && r.pincode !== pincode) return false;
        if (salesman !== "all" && r.salesman !== salesman) return false;
        return true;
      }),
    [rows, term, city, area, pincode, salesman],
  );

  const active = !!term || city !== "all" || area !== "all" || pincode !== "all" || salesman !== "all";

  const bar = (
    <ReportFilterBar
      q={q}
      setQ={setQ}
      city={city}
      setCity={setCity}
      area={area}
      setArea={setArea}
      pincode={pincode}
      setPincode={setPincode}
      salesman={salesman}
      setSalesman={setSalesman}
      cities={cities}
      areas={areas}
      pincodes={pincodes}
      salesmen={salesmen}
      active={active}
      reset={reset}
    />
  );

  return { filtered, bar, active, reset, q };
}

function Picker({
  value,
  onChange,
  placeholder,
  allLabel,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  allLabel: string;
  options: string[];
}) {
  if (options.length === 0) return null;
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 sm:w-44">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{allLabel}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o} value={o}>
            {o}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ReportFilterBar(p: {
  q: string;
  setQ: (v: string) => void;
  city: string;
  setCity: (v: string) => void;
  area: string;
  setArea: (v: string) => void;
  pincode: string;
  setPincode: (v: string) => void;
  salesman: string;
  setSalesman: (v: string) => void;
  cities: string[];
  areas: string[];
  pincodes: string[];
  salesmen: string[];
  active: boolean;
  reset: () => void;
}) {
  const hasPickers = p.cities.length + p.areas.length + p.pincodes.length + p.salesmen.length > 0;
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={p.q} onChange={(e) => p.setQ(e.target.value)} placeholder="Search records…" className="pl-9" />
      </div>
      {hasPickers ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Picker value={p.city} onChange={p.setCity} placeholder="City" allLabel="All cities" options={p.cities} />
          <Picker value={p.area} onChange={p.setArea} placeholder="Area" allLabel="All areas" options={p.areas} />
          <Picker
            value={p.pincode}
            onChange={p.setPincode}
            placeholder="Pincode"
            allLabel="All pincodes"
            options={p.pincodes}
          />
          <Picker
            value={p.salesman}
            onChange={p.setSalesman}
            placeholder="Salesman"
            allLabel="All salesmen"
            options={p.salesmen}
          />
          {p.active ? (
            <Button size="sm" variant="ghost" onClick={p.reset}>
              <X className="mr-1 size-3.5" /> Clear
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
