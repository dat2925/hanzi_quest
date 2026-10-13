-- Manual only. Replace the zero UUID with the intended auth.users.id after checking the account.
begin;
do $$
declare selected_user uuid:='00000000-0000-0000-0000-000000000000';
begin
 if not exists(select 1 from auth.users where id=selected_user) then raise exception 'REPLACE_WITH_EXISTING_AUTH_USER_UUID'; end if;
 insert into public.curriculum_admins(user_id) values(selected_user) on conflict do nothing;
end $$;
commit;
