CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _role public.app_role;
  _shop text;
  _retailer_id uuid;
BEGIN
  BEGIN
    _role := COALESCE((NEW.raw_user_meta_data->>'role')::public.app_role, 'salesman');
  EXCEPTION WHEN others THEN _role := 'salesman';
  END;

  _shop := NULLIF(btrim(COALESCE(NEW.raw_user_meta_data->>'shop_name','')), '');

  IF _shop IS NOT NULL THEN
    SELECT id INTO _retailer_id FROM public.retailers WHERE lower(name) = lower(_shop) LIMIT 1;
    IF _retailer_id IS NULL THEN
      INSERT INTO public.retailers (name, retailer_type, created_by)
      VALUES (_shop, CASE WHEN _role = 'ba' THEN 'ba' ELSE 'no_ba' END, NEW.id)
      RETURNING id INTO _retailer_id;
    END IF;
  END IF;

  INSERT INTO public.profiles (id, full_name, phone, designation, retailer_id)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.raw_user_meta_data->>'phone', NEW.raw_user_meta_data->>'designation', _retailer_id);

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, _role) ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $function$;