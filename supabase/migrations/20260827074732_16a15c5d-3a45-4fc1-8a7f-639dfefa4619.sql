CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  kind text NOT NULL DEFAULT 'ta_da',
  distance_km numeric NOT NULL DEFAULT 0,
  ta_amount numeric NOT NULL DEFAULT 0,
  da_amount numeric NOT NULL DEFAULT 0,
  bill_amount numeric NOT NULL DEFAULT 0,
  total_amount numeric GENERATED ALWAYS AS (ta_amount + da_amount + bill_amount) STORED,
  route text,
  vendor text,
  notes text,
  receipt_path text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expenses TO authenticated;
GRANT ALL ON public.expenses TO service_role;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own expenses insert" ON public.expenses FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "staff read expenses" ON public.expenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "own pending expenses update" ON public.expenses FOR UPDATE TO authenticated
  USING ((user_id = auth.uid() AND status = 'pending') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK ((user_id = auth.uid()) OR public.has_role(auth.uid(), 'super_admin'));
CREATE POLICY "own pending expenses delete" ON public.expenses FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending');

CREATE INDEX expenses_user_date_idx ON public.expenses (user_id, expense_date DESC);

CREATE POLICY "own receipts read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'expense-receipts' AND ((storage.foldername(name))[1] = auth.uid()::text OR public.has_role(auth.uid(), 'super_admin')));
CREATE POLICY "own receipts insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own receipts update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);
CREATE POLICY "own receipts delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'expense-receipts' AND (storage.foldername(name))[1] = auth.uid()::text);