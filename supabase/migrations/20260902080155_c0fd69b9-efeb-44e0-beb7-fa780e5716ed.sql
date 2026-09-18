CREATE POLICY "Own social design files"
ON storage.objects FOR ALL TO authenticated
USING (bucket_id = 'social-designs' AND (storage.foldername(name))[1] = auth.uid()::text)
WITH CHECK (bucket_id = 'social-designs' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Managers read team social design files"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'social-designs'
  AND (
    public.is_hr_admin(auth.uid())
    OR public.can_manage_office_user(((storage.foldername(name))[1])::uuid)
    OR public.manager_sees_user(((storage.foldername(name))[1])::uuid)
  )
);