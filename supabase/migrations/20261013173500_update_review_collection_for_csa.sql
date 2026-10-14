-- Update review_collection to allow Depot and Admin to review CSA collections
CREATE OR REPLACE FUNCTION public.review_collection(_id uuid, _approve boolean, _note text DEFAULT NULL)
RETURNS public.collections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  _row public.collections;
  _allowed boolean;
BEGIN
  SELECT * INTO _row FROM public.collections WHERE id = _id FOR UPDATE;
  IF _row.id IS NULL THEN RAISE EXCEPTION 'Collection not found'; END IF;
  IF _row.status <> 'pending' THEN RAISE EXCEPTION 'Collection already reviewed'; END IF;

  SELECT public.has_role(auth.uid(), 'super_admin')
      OR (
        _row.retailer_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.profiles p
          JOIN public.retailers r ON r.id = _row.retailer_id
          WHERE p.id = auth.uid() AND p.distributor_id IS NOT NULL AND p.distributor_id = r.distributor_id
        )
      )
      OR (
        _row.csa_id IS NOT NULL AND (
          public.has_role(auth.uid(), 'depot')
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.csas c ON c.id = _row.csa_id
            WHERE p.id = auth.uid() AND p.depot_id IS NOT NULL AND c.depot_id = p.depot_id
          )
        )
      )
      OR (
        _row.distributor_id IS NOT NULL AND (
          public.has_role(auth.uid(), 'csa')
          OR EXISTS (
            SELECT 1 FROM public.profiles p
            JOIN public.distributors d ON d.id = _row.distributor_id
            WHERE p.id = auth.uid() AND p.csa_id IS NOT NULL AND d.csa_id = p.csa_id
          )
        )
      )
  INTO _allowed;
  IF NOT _allowed THEN RAISE EXCEPTION 'Not authorized to review this collection'; END IF;

  IF _approve AND _row.retailer_id IS NOT NULL THEN
    UPDATE public.retailers
    SET outstanding = GREATEST(outstanding - _row.amount, 0)
    WHERE id = _row.retailer_id;
  END IF;

  IF _approve AND _row.distributor_id IS NOT NULL THEN
    UPDATE public.distributors
    SET outstanding = GREATEST(outstanding - _row.amount, 0)
    WHERE id = _row.distributor_id;
  END IF;

  UPDATE public.collections
  SET status = CASE WHEN _approve THEN 'approved' ELSE 'rejected' END,
      approved_by = auth.uid(),
      approved_at = now(),
      review_note = NULLIF(_note, '')
  WHERE id = _id
  RETURNING * INTO _row;

  RETURN _row;
END;
$fn$;

DROP POLICY IF EXISTS "managers update collections" ON public.collections;
CREATE POLICY "managers update collections" ON public.collections FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
