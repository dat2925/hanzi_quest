-- Additive admin backend. Deploy after 005; bootstrap one platform admin manually.
begin;
create table public.platform_admins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 created_at timestamptz not null default now()
);
create table public.admin_user_state (
 user_id uuid primary key references auth.users(id) on delete cascade,
 suspended boolean not null default false,
 reason text not null default '' check(length(reason)<=500),
 revision int not null default 0,
 updated_at timestamptz not null default now()
);
create table public.admin_audit (
 request_id uuid primary key, actor uuid not null references auth.users(id),
 action text not null, target text not null, digest text not null,
 changes jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
create index admin_audit_recent on public.admin_audit(created_at desc,request_id);
alter table public.courses add column admin_revision int not null default 0;
alter table public.units add column admin_revision int not null default 0;
alter table public.lessons add column admin_revision int not null default 0;
alter table public.lessons add column has_been_published boolean not null default false;
update public.lessons set has_been_published=true where is_published;
create function private.protect_published_lesson() returns trigger language plpgsql set search_path='' as $$ begin
 if TG_OP='UPDATE' and OLD.has_been_published and (NEW.content_json is distinct from OLD.content_json or NEW.unit_id<>OLD.unit_id or NEW.title<>OLD.title or NEW.description<>OLD.description or NEW.estimated_minutes<>OLD.estimated_minutes)
 then raise exception 'PUBLISHED_CONTENT_IMMUTABLE'; end if;
 NEW.has_been_published:=NEW.is_published or case when TG_OP='UPDATE' then OLD.has_been_published else false end;
 return NEW;
end $$;
revoke all on function private.protect_published_lesson() from public,anon,authenticated;
create trigger protect_published_lesson before insert or update on public.lessons for each row execute function private.protect_published_lesson();
alter table public.platform_admins enable row level security;
alter table public.admin_user_state enable row level security;
alter table public.admin_audit enable row level security;
revoke all on public.platform_admins,public.admin_user_state,public.admin_audit from public,anon,authenticated;

create function public.user_account_active() returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not exists(select 1 from public.admin_user_state where user_id=auth.uid() and suspended);
$$;
revoke all on function public.user_account_active() from public,anon;
grant execute on function public.user_account_active() to authenticated;
create function private.require_platform_admin(p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
 if p_actor is null or not exists(select 1 from public.platform_admins where user_id=p_actor)
 then raise exception 'PLATFORM_ADMIN_REQUIRED'; end if;
 if exists(select 1 from public.admin_user_state where user_id=p_actor and suspended) then raise exception 'ACCOUNT_SUSPENDED'; end if;
end $$;
revoke all on function private.require_platform_admin(uuid) from public,anon,authenticated;
create function public.platform_admin_access() returns boolean
language sql stable security definer set search_path='' as $$
 select public.user_account_active() and exists(select 1 from public.platform_admins where user_id=auth.uid());
$$;
revoke all on function public.platform_admin_access() from public,anon;
grant execute on function public.platform_admin_access() to authenticated;
create or replace function private.require_curriculum_admin(p_actor uuid) returns void
language plpgsql security definer set search_path='' as $$ begin
 if p_actor is null or not (exists(select 1 from public.curriculum_admins where user_id=p_actor) or exists(select 1 from public.platform_admins where user_id=p_actor))
 then raise exception 'CURRICULUM_ADMIN_REQUIRED'; end if;
 if exists(select 1 from public.admin_user_state where user_id=p_actor and suspended) then raise exception 'ACCOUNT_SUSPENDED'; end if;
end $$;
create or replace function public.curriculum_admin_access() returns boolean
language sql stable security definer set search_path='' as $$
 select public.user_account_active() and (exists(select 1 from public.curriculum_admins where user_id=auth.uid()) or exists(select 1 from public.platform_admins where user_id=auth.uid()));
$$;
-- A revoked editor cannot finish a queued publish after the role change commits.
alter function public.curriculum_admin_apply(uuid,uuid,text,text,jsonb,jsonb) set schema private;
alter function private.curriculum_admin_apply(uuid,uuid,text,text,jsonb,jsonb) rename to curriculum_admin_apply_before_platform;
revoke all on function private.curriculum_admin_apply_before_platform(uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated,service_role;
create function public.curriculum_admin_apply(p_actor uuid,p_request uuid,p_action text,p_digest text,p_rows jsonb,p_refs jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$ begin
 perform private.require_curriculum_admin(p_actor);
 perform pg_advisory_xact_lock(72631012);
 perform private.require_curriculum_admin(p_actor);
 return private.curriculum_admin_apply_before_platform(p_actor,p_request,p_action,p_digest,p_rows,p_refs);
end $$;
revoke all on function public.curriculum_admin_apply(uuid,uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.curriculum_admin_apply(uuid,uuid,text,text,jsonb,jsonb) to service_role;

-- Suspension applies to reads and RPCs, including clients holding an existing JWT.
do $$ declare t text; begin
 foreach t in array array['profiles','courses','units','lessons','vocabulary','lesson_progress','stage_progress','review_items','notebook_entries','notebook_tasks','study_sessions','user_stats','sync_operations','legacy_imports','lesson_prerequisites'] loop
  execute format('create policy account_active on public.%I as restrictive for select to authenticated using ((select public.user_account_active()))',t);
 end loop;
end $$;
alter function public.learning_snapshot() set schema private;
alter function private.learning_snapshot() rename to learning_snapshot_before_admin;
revoke all on function private.learning_snapshot_before_admin() from public,anon,authenticated;
create function public.learning_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not public.user_account_active() then raise exception 'ACCOUNT_SUSPENDED'; end if;
 return private.learning_snapshot_before_admin();
end $$;
revoke all on function public.learning_snapshot() from public,anon;
grant execute on function public.learning_snapshot() to authenticated;
alter function public.apply_learning_operation(jsonb) set schema private;
alter function private.apply_learning_operation(jsonb) rename to apply_learning_operation_before_admin;
revoke all on function private.apply_learning_operation_before_admin(jsonb) from public,anon,authenticated;
create function public.apply_learning_operation(p_operation jsonb) returns void language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
 if not public.user_account_active() then raise exception 'ACCOUNT_SUSPENDED'; end if;
 perform private.apply_learning_operation_before_admin(p_operation);
end $$;
revoke all on function public.apply_learning_operation(jsonb) from public,anon;
grant execute on function public.apply_learning_operation(jsonb) to authenticated;

create function public.platform_admin_read(p_actor uuid,p_resource text,p_query jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare lim int:=coalesce((p_query->>'limit')::int,25); offst int:=coalesce((p_query->>'offset')::int,0); term text:=coalesce(p_query->>'search',''); uid uuid; result jsonb;
begin
 perform private.require_platform_admin(p_actor);
 if lim not between 1 and 100 or offst not between 0 and 100000 or length(term)>100 then raise exception 'INVALID_QUERY'; end if;
 if p_resource='overview' then
  return jsonb_build_object(
   'users',(select count(*) from auth.users),
   'suspendedUsers',(select count(*) from public.admin_user_state where suspended),
   'activeUsers7d',(select count(distinct user_id) from public.study_sessions where ended_at>=now()-interval '7 days'),
   'courses',(select count(*) from public.courses),
   'publishedLessons',(select count(*) from public.lessons where is_published),
   'draftLessons',(select count(*) from public.curriculum_drafts d where not exists(select 1 from public.lessons l where l.id=d.lesson_id and l.is_published)),
   'pendingReview',(select count(*) from public.curriculum_drafts d where reviewed_revision is distinct from revision and not exists(select 1 from public.lessons l where l.id=d.lesson_id and l.is_published)),
   'studySessions7d',(select count(*) from public.study_sessions where ended_at>=now()-interval '7 days'));
 elsif p_resource='users' then
  with filtered as (
   select u.id,u.email,u.created_at,u.last_sign_in_at,p.display_name,p.target_hsk,
    coalesce(s.total_xp,0) total_xp,coalesce(s.total_study_seconds,0) total_study_seconds,
    coalesce(a.suspended,false) suspended,coalesce(a.revision,0) revision,
    case when pa.user_id is not null then 'admin' when ca.user_id is not null then 'editor' else 'learner' end role,
    (select count(*) from public.lesson_progress lp where lp.user_id=u.id and lp.completion_status='completed') completed_lessons
   from auth.users u left join public.profiles p on p.id=u.id left join public.user_stats s on s.user_id=u.id
   left join public.admin_user_state a on a.user_id=u.id left join public.platform_admins pa on pa.user_id=u.id left join public.curriculum_admins ca on ca.user_id=u.id
   where (term='' or position(lower(term) in lower(coalesce(u.email,'')||' '||coalesce(p.display_name,'')||' '||u.id::text))>0)
    and (p_query->>'status' is null or (p_query->>'status'='suspended')=coalesce(a.suspended,false))
    and (p_query->>'role' is null or p_query->>'role'=case when pa.user_id is not null then 'admin' when ca.user_id is not null then 'editor' else 'learner' end)
  ) select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from filtered order by created_at desc,id limit lim offset offst) x),'[]'),
   'total',(select count(*) from filtered),'limit',lim,'offset',offst) into result;
  return result;
 elsif p_resource='user' then
  uid:=(p_query->>'id')::uuid;
  if not exists(select 1 from auth.users where id=uid) then raise exception 'USER_NOT_FOUND'; end if;
  return jsonb_build_object('id',uid,
   'email',(select email from auth.users where id=uid),
   'created_at',(select created_at from auth.users where id=uid),
   'last_sign_in_at',(select last_sign_in_at from auth.users where id=uid),
   'profile',(select to_jsonb(p) from public.profiles p where id=uid),
   'stats',(select to_jsonb(s) from public.user_stats s where user_id=uid),
   'role',case when exists(select 1 from public.platform_admins where user_id=uid) then 'admin' when exists(select 1 from public.curriculum_admins where user_id=uid) then 'editor' else 'learner' end,
   'suspended',coalesce((select suspended from public.admin_user_state where user_id=uid),false),
   'reason',coalesce((select reason from public.admin_user_state where user_id=uid),''),
   'revision',coalesce((select revision from public.admin_user_state where user_id=uid),0),
   'lessonProgress',coalesce((select jsonb_agg(to_jsonb(x)) from (select lp.lesson_id,l.title,lp.completion_status,lp.best_score,lp.attempt_count,lp.completed_at,lp.updated_at from public.lesson_progress lp join public.lessons l on l.id=lp.lesson_id where lp.user_id=uid order by lp.updated_at desc,lp.lesson_id limit lim offset offst) x),'[]'),
   'progressTotal',(select count(*) from public.lesson_progress where user_id=uid),
   'limit',lim,'offset',offst);
 elsif p_resource='courses' then
  return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)) from (
   select c.*,(select count(*) from public.units u where u.course_id=c.id) chapters,
    (select count(*) from public.lessons l join public.units u on u.id=l.unit_id where u.course_id=c.id) lessons,
    (select count(*) from public.curriculum_drafts d where d.course_id=c.id and not exists(select 1 from public.lessons l where l.id=d.lesson_id and l.is_published)) drafts
   from public.courses c where term='' or position(lower(term) in lower(c.title||' '||c.id))>0 order by c.sort_order,c.id limit lim offset offst) x),'[]'),
   'total',(select count(*) from public.courses c where term='' or position(lower(term) in lower(c.title||' '||c.id))>0),'limit',lim,'offset',offst);
 elsif p_resource='chapters' then
  return jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)) from (select u.* from public.units u where u.course_id=p_query->>'courseId' order by u.sort_order,u.id limit lim offset offst) x),'[]'),
   'total',(select count(*) from public.units where course_id=p_query->>'courseId'),'limit',lim,'offset',offst);
 elsif p_resource='lessons' then
  with combined as (
   select l.id,u.course_id,l.unit_id chapter_id,l.title,l.description,l.estimated_minutes,l.sort_order,l.admin_revision,
    case when l.is_published then 'published' when l.has_been_published then 'hidden' when d.reviewed_revision=d.revision then 'reviewed' else 'draft' end status,d.revision,d.reviewed_revision,
    (select count(*) from public.lesson_progress lp where lp.lesson_id=l.id) learners
   from public.lessons l join public.units u on u.id=l.unit_id left join public.curriculum_drafts d on d.lesson_id=l.id
   union all
   select d.lesson_id,d.course_id,d.chapter_json->>'id',d.learning_json->>'title',d.learning_json->>'description',(d.learning_json->>'minutes')::int,2147483647,0,
    case when d.reviewed_revision=d.revision then 'reviewed' else 'draft' end,d.revision,d.reviewed_revision,0
   from public.curriculum_drafts d where not exists(select 1 from public.lessons l where l.id=d.lesson_id)
  ), filtered as(select * from combined x where
   (p_query->>'courseId' is null or x.course_id=p_query->>'courseId') and (p_query->>'chapterId' is null or x.chapter_id=p_query->>'chapterId')
   and (p_query->>'status' is null or x.status=p_query->>'status') and (term='' or position(lower(term) in lower(x.title||' '||x.id))>0))
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from filtered order by course_id,chapter_id,sort_order,id limit lim offset offst) x),'[]'),
   'total',(select count(*) from filtered),'limit',lim,'offset',offst) into result;
  return result;
 elsif p_resource='audit' then
  with combined as (
   select request_id,actor,action,target,changes,created_at from public.admin_audit
   union all
   select op.request_id,op.actor,'curriculum.'||op.action,coalesce(op.result->'ids','[]')::text,jsonb_build_object('ids',op.result->'ids'),op.created_at from public.curriculum_admin_operations op
  ), filtered as(select * from combined where term='' or position(lower(term) in lower(action||' '||target))>0)
  select jsonb_build_object('items',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from filtered order by created_at desc,request_id limit lim offset offst) x),'[]'),
   'total',(select count(*) from filtered),'limit',lim,'offset',offst) into result;
  return result;
 else raise exception 'UNKNOWN_RESOURCE'; end if;
end $$;

create function public.platform_admin_apply(p_actor uuid,p_request uuid,p_action text,p_digest text,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid; target text:=p_payload->>'id'; expected int:=(p_payload->>'expectedRevision')::int; old public.admin_audit;
 state public.admin_user_state; c public.courses; chapter public.units; lesson public.lessons; draft public.curriculum_drafts; result jsonb; rev int;
begin
 perform private.require_platform_admin(p_actor);
 -- Serialize permissions, content visibility and editorial publishing together.
 perform pg_advisory_xact_lock(72631012);
 perform private.require_platform_admin(p_actor);
 if p_request is null or length(p_digest)<>64 or jsonb_typeof(p_payload)<>'object' or octet_length(p_payload::text)>20000 then raise exception 'INVALID_COMMAND'; end if;
 select * into old from public.admin_audit where request_id=p_request;
 if found then
  if old.actor<>p_actor or old.action<>p_action or old.digest<>p_digest then raise exception 'REQUEST_ID_CONFLICT'; end if;
  return old.result;
 end if;
 if expected is null or expected<0 then raise exception 'EXPECTED_REVISION_REQUIRED'; end if;
 if p_action in ('user.update','user.access','user.role') then
  uid:=target::uuid;
  if not exists(select 1 from auth.users where id=uid) then raise exception 'USER_NOT_FOUND'; end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  insert into public.admin_user_state(user_id) values(uid) on conflict do nothing;
  select * into state from public.admin_user_state where user_id=uid for update;
  if expected<>state.revision then raise exception 'REVISION_CONFLICT'; end if;
  if p_action='user.update' then
   if (select updated_at from public.profiles where id=uid) is distinct from (p_payload->>'profileUpdatedAt')::timestamptz then raise exception 'PROFILE_CHANGED'; end if;
   if length(trim(p_payload->>'displayName')) not between 1 and 100 or length(p_payload->>'targetHsk') not between 1 and 100 or (p_payload->>'dailyGoalMinutes')::int not between 1 and 180 then raise exception 'INVALID_PROFILE'; end if;
   insert into public.profiles(id) values(uid) on conflict do nothing;
   update public.profiles set display_name=trim(p_payload->>'displayName'),target_hsk=p_payload->>'targetHsk',daily_goal_minutes=(p_payload->>'dailyGoalMinutes')::int,updated_at=now() where id=uid;
  elsif p_action='user.access' then
   if uid=p_actor then raise exception 'SELF_ACCESS_CHANGE_FORBIDDEN'; end if;
   if jsonb_typeof(p_payload->'suspended') is distinct from 'boolean' or length(coalesce(p_payload->>'reason',''))>500 then raise exception 'INVALID_ACCESS'; end if;
   if (p_payload->>'suspended')::boolean and exists(select 1 from public.platform_admins where user_id=uid) then raise exception 'DEMOTE_ADMIN_BEFORE_SUSPENDING'; end if;
   if (p_payload->>'suspended')::boolean and length(trim(coalesce(p_payload->>'reason','')))=0 then raise exception 'SUSPENSION_REASON_REQUIRED'; end if;
   update public.admin_user_state set suspended=(p_payload->>'suspended')::boolean,reason=coalesce(p_payload->>'reason','') where user_id=uid;
  else
   if uid=p_actor then raise exception 'SELF_ROLE_CHANGE_FORBIDDEN'; end if;
   if p_payload->>'role' not in ('learner','editor','admin') or p_payload->>'role' is null then raise exception 'INVALID_ROLE'; end if;
   if state.suspended and p_payload->>'role'<>'learner' then raise exception 'ACCOUNT_SUSPENDED'; end if;
   delete from public.platform_admins where user_id=uid;
   delete from public.curriculum_admins where user_id=uid;
   if p_payload->>'role'='admin' then insert into public.platform_admins(user_id) values(uid); end if;
   if p_payload->>'role'='editor' then insert into public.curriculum_admins(user_id) values(uid); end if;
  end if;
  update public.admin_user_state set revision=revision+1,updated_at=now() where user_id=uid returning revision into rev;
 elsif p_action='course.save' then
  if target !~ '^[a-z][a-z0-9-]{1,99}$' or target is null or length(trim(p_payload->>'title')) not between 1 and 200 or length(coalesce(p_payload->>'description',''))>5000 or (p_payload->>'sortOrder')::int<0 then raise exception 'INVALID_COURSE'; end if;
  select * into c from public.courses where id=target for update;
  if found then
   if expected<>c.admin_revision then raise exception 'REVISION_CONFLICT'; end if;
   if (p_payload ? 'family' and p_payload->>'family' is distinct from c.curriculum_family) or (p_payload ? 'syllabusVersion' and p_payload->>'syllabusVersion' is distinct from c.syllabus_version) or (p_payload ? 'hskLevel' and (p_payload->>'hskLevel')::int is distinct from c.hsk_level) then raise exception 'COURSE_VERSION_IMMUTABLE'; end if;
   update public.courses set title=trim(p_payload->>'title'),description=coalesce(p_payload->>'description',''),sort_order=(p_payload->>'sortOrder')::int,admin_revision=admin_revision+1 where id=target returning admin_revision into rev;
  else
   if expected<>0 then raise exception 'REVISION_CONFLICT'; end if;
   if p_payload->>'family' not in ('foundation','HSK') or p_payload->>'family' is null or p_payload->>'syllabusVersion' is null or length(p_payload->>'syllabusVersion') not between 1 and 100 then raise exception 'INVALID_SYLLABUS'; end if;
   if (p_payload->>'family'='HSK' and coalesce((p_payload->>'hskLevel')::int,0) not between 1 and 9) or (p_payload->>'family'='foundation' and p_payload->>'hskLevel' is not null) then raise exception 'INVALID_HSK_LEVEL'; end if;
   insert into public.courses(id,title,description,sort_order,syllabus_version,curriculum_family,hsk_level,admin_revision) values(target,trim(p_payload->>'title'),coalesce(p_payload->>'description',''),(p_payload->>'sortOrder')::int,p_payload->>'syllabusVersion',p_payload->>'family',(p_payload->>'hskLevel')::int,1);
   rev:=1;
  end if;
 elsif p_action='chapter.save' then
  if target !~ '^[a-z][a-z0-9-]{1,99}$' or target is null or length(trim(p_payload->>'title')) not between 1 and 200 or (p_payload->>'sortOrder')::int<0 or length(coalesce(p_payload->>'description',''))>5000 then raise exception 'INVALID_CHAPTER'; end if;
  if not exists(select 1 from public.courses where id=p_payload->>'courseId') then raise exception 'COURSE_NOT_FOUND'; end if;
  select * into chapter from public.units where id=target for update;
  if found then
   if expected<>chapter.admin_revision then raise exception 'REVISION_CONFLICT'; end if;
   if chapter.course_id<>p_payload->>'courseId' then raise exception 'COURSE_ID_IMMUTABLE'; end if;
   update public.units set title=trim(p_payload->>'title'),description=coalesce(p_payload->>'description',''),sort_order=(p_payload->>'sortOrder')::int,admin_revision=admin_revision+1 where id=target returning admin_revision into rev;
  else
   if expected<>0 then raise exception 'REVISION_CONFLICT'; end if;
   insert into public.units(id,course_id,title,description,sort_order,admin_revision) values(target,p_payload->>'courseId',trim(p_payload->>'title'),coalesce(p_payload->>'description',''),(p_payload->>'sortOrder')::int,1);
   rev:=1;
  end if;
 elsif p_action='lesson.visibility' then
  select * into lesson from public.lessons where id=target for update;
  if not found then raise exception 'LESSON_NOT_FOUND'; end if;
  if expected<>lesson.admin_revision then raise exception 'REVISION_CONFLICT'; end if;
  if jsonb_typeof(p_payload->'published') is distinct from 'boolean' then raise exception 'INVALID_VISIBILITY'; end if;
  -- Only content that has been published before may be restored here.
  if not lesson.has_been_published then raise exception 'USE_REVIEW_PUBLISH_WORKFLOW'; end if;
  if not (p_payload->>'published')::boolean and exists(select 1 from public.lesson_prerequisites lp join public.lessons l on l.id=lp.lesson_id where lp.requires_lesson_id=target and l.is_published) then raise exception 'PUBLISHED_DEPENDENTS_EXIST'; end if;
  if (p_payload->>'published')::boolean and exists(select 1 from public.lesson_prerequisites lp join public.lessons l on l.id=lp.requires_lesson_id where lp.lesson_id=target and not l.is_published) then raise exception 'PREREQUISITE_NOT_PUBLISHED'; end if;
  update public.lessons set is_published=(p_payload->>'published')::boolean,admin_revision=admin_revision+1 where id=target returning admin_revision into rev;
 elsif p_action='draft.delete' then
  select * into draft from public.curriculum_drafts where lesson_id=target for update;
  if not found then raise exception 'DRAFT_NOT_FOUND'; end if;
  if expected<>draft.revision then raise exception 'REVISION_CONFLICT'; end if;
  if exists(select 1 from public.lessons where id=target) then raise exception 'EXISTING_LESSON_CANNOT_DELETE'; end if;
  if exists(select 1 from public.curriculum_drafts where lesson_id<>target and learning_json->'prerequisites' ? target) then raise exception 'DRAFT_DEPENDENTS_EXIST'; end if;
  delete from public.curriculum_drafts where lesson_id=target;
  rev:=null;
 else raise exception 'UNKNOWN_ACTION'; end if;
 result:=jsonb_build_object('requestId',p_request,'action',p_action,'id',target,'revision',rev);
 insert into public.admin_audit(request_id,actor,action,target,digest,changes,result) values(p_request,p_actor,p_action,target,p_digest,p_payload-'requestId',result);
 return result;
end $$;
revoke all on function public.platform_admin_read(uuid,text,jsonb),public.platform_admin_apply(uuid,uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.platform_admin_read(uuid,text,jsonb),public.platform_admin_apply(uuid,uuid,text,text,jsonb) to service_role;
commit;
