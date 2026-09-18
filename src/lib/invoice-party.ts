import type { InvoiceParty } from "@/lib/invoice-pdf";

type PartyRow = {
  name?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  gstin?: string | null;
  phone?: string | null;
  email?: string | null;
} | null | undefined;

export function toParty(row: PartyRow, role: string, fallbackName = "Not provided"): InvoiceParty {
  return {
    role,
    name: row?.name || fallbackName,
    address: row?.address ?? null,
    city: row?.city ?? null,
    state: row?.state ?? null,
    gstin: row?.gstin ?? null,
    phone: row?.phone ?? null,
    email: row?.email ?? null,
  };
}
