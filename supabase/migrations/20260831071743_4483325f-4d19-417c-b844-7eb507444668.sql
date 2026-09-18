ALTER TABLE public.targets ADD COLUMN IF NOT EXISTS daily_target_amount numeric NOT NULL DEFAULT 0;

DELETE FROM public.targets a USING public.targets b
WHERE a.ctid < b.ctid AND a.user_id = b.user_id AND a.period_month = b.period_month;

CREATE UNIQUE INDEX IF NOT EXISTS targets_user_month_uidx ON public.targets (user_id, period_month);

DROP POLICY IF EXISTS "managers manage team targets" ON public.targets;
CREATE POLICY "managers manage team targets" ON public.targets
FOR ALL TO authenticated
USING (public.manager_sees_user(user_id))
WITH CHECK (public.manager_sees_user(user_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.targets TO authenticated;
GRANT ALL ON public.targets TO service_role;