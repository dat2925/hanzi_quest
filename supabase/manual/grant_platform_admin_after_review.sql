-- Run once after migration 006. Replace the UUID below with an existing auth.users ID.
-- No role is inferred from an email, browser metadata, or curriculum_admins membership.
begin;
do $$ declare target uuid := 'REPLACE_WITH_EXISTING_USER_UUID'::uuid; begin
 perform pg_advisory_xact_lock(72631012);
 if not exists(select 1 from auth.users where id=target) then raise exception 'USER_NOT_FOUND'; end if;
 if exists(select 1 from public.admin_user_state where user_id=target and suspended) then raise exception 'ACCOUNT_SUSPENDED'; end if;
 insert into public.platform_admins(user_id) values(target) on conflict do nothing;
end $$;
commit;
