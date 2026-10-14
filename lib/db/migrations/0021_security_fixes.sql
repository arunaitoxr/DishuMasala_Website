CREATE INDEX "orders_email_lower_idx" ON "orders" USING btree (lower("email"));--> statement-breakpoint
-- Every new Supabase identity becomes a CUSTOMER. The 0008 version took the role from
-- raw_user_meta_data, which the signup caller controls: anyone holding the publishable key could
-- call /auth/v1/signup with data.role = "admin" and get an admin account. Staff and admins are
-- promoted only server-side (scripts/create-staff-user.ts sets public.users.role directly).
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.users (auth_user_id, email, name, phone, role, email_verified_at)
  VALUES (
    NEW.id,
    lower(NEW.email),
    coalesce(nullif(trim(NEW.raw_user_meta_data->>'name'), ''), split_part(NEW.email, '@', 1)),
    nullif(trim(NEW.raw_user_meta_data->>'phone'), ''),
    'customer',
    NEW.email_confirmed_at
  )
  -- An app-side row may already exist for this email (a pre-existing customer being linked to a
  -- newly created Supabase identity). Link it rather than failing the signup on users_email_uniq;
  -- the existing row keeps its role.
  ON CONFLICT (email) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id,
        updated_at   = now();
  RETURN NEW;
END;
$function$;
