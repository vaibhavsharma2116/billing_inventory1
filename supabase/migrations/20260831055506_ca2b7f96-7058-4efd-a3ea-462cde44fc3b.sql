ALTER TABLE public.collections
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved',
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS review_note text;

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
      OR EXISTS (
        SELECT 1 FROM public.profiles p
        JOIN public.retailers r ON r.id = _row.retailer_id
        WHERE p.id = auth.uid() AND p.distributor_id IS NOT NULL AND p.distributor_id = r.distributor_id
      )
  INTO _allowed;
  IF NOT _allowed THEN RAISE EXCEPTION 'Only the mapped distributor or admin can review this collection'; END IF;

  IF _approve AND _row.retailer_id IS NOT NULL THEN
    UPDATE public.retailers
    SET outstanding = GREATEST(outstanding - _row.amount, 0)
    WHERE id = _row.retailer_id;
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