-- Administrator-only legacy migration. Never grant this function to API roles.
begin;
create function public.approve_legacy_import(import_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare entry public.legacy_imports; p jsonb; h jsonb; r jsonb; w text; d text; i int:=0; operation uuid; xp int; seconds int; stamp timestamptz; day date; cur int; longest int;
begin
 select * into entry from public.legacy_imports where id=import_id for update;
 if not found then raise exception 'IMPORT_NOT_FOUND'; end if;
 if entry.status='approved' then return; end if;
 if entry.status<>'pending' then raise exception 'IMPORT_NOT_PENDING'; end if;
 perform pg_advisory_xact_lock(hashtextextended(entry.user_id::text,0));
 p:=entry.data_json;
 for h in select value from jsonb_array_elements(p->'history') loop
  -- Index disambiguates identical legitimate sessions, hash is stable across re-imports.
  operation:=md5(entry.user_id::text || ':' || i::text || ':' || h::text)::uuid;i:=i+1;
  xp:=greatest(0,least(40,(h->>'xp')::int));seconds:=greatest(0,least(14400,(h->>'minutes')::int*60));
  stamp:=((h->>'date')::date::timestamp+interval '12 hours') at time zone 'Asia/Ho_Chi_Minh';
  if h->>'lesson'='practice' or exists(select 1 from public.lessons where id=h->>'lesson') then
   insert into public.study_sessions(user_id,lesson_id,operation_id,started_at,ended_at,duration_seconds,xp_earned,score)
   values(entry.user_id,nullif(h->>'lesson','practice'),operation,stamp-seconds*interval '1 second',stamp,seconds,xp,greatest(0,least(1,(h->>'accuracy')::numeric))) on conflict(user_id,operation_id) do nothing;
  end if;
 end loop;
 for w in select jsonb_array_elements_text(p->'completed') loop
  if exists(select 1 from public.lessons where id=w) then
   insert into public.lesson_progress(user_id,lesson_id,completion_status,best_score,attempt_count,completed_at) values(entry.user_id,w,'completed',0.7,1,now())
   on conflict(user_id,lesson_id) do update set completion_status='completed',completed_at=coalesce(lesson_progress.completed_at,now()),updated_at=now();
  end if;
 end loop;
 for w,r in select key,value from jsonb_each(p->'reviews') loop
  if exists(select 1 from public.vocabulary where id=w) then
   insert into public.review_items(user_id,content_id,repetition_count,correct_count,interval_days,next_review_at)
   values(entry.user_id,w,greatest(0,(r->>'attempts')::int),greatest(0,(r->>'correct')::int),greatest(0,least(30,(r->>'interval')::numeric)),to_timestamp((r->>'due')::numeric/1000))
   on conflict(user_id,content_type,content_id) do update set
    repetition_count=case when review_items.last_review_at is null then excluded.repetition_count else review_items.repetition_count end,
    correct_count=case when review_items.last_review_at is null then excluded.correct_count else review_items.correct_count end,
    interval_days=case when review_items.last_review_at is null then excluded.interval_days else review_items.interval_days end,
    next_review_at=case when review_items.last_review_at is null then excluded.next_review_at else review_items.next_review_at end;
  end if;
 end loop;
 for d in select jsonb_array_elements_text(p->'written') loop
  if d~'^\d{4}-\d{2}-\d{2}$' then insert into public.notebook_tasks(user_id,task_key,completed) values(entry.user_id,d,true) on conflict(user_id,task_key) do nothing;end if;
 end loop;
 update public.profiles set display_name=left(coalesce(nullif(p->>'name',''),display_name),100),target_hsk=coalesce(p->>'goal',target_hsk),daily_goal_minutes=greatest(1,least(180,(p->>'daily')::int)),preferred_study_time=coalesce(p->>'time',preferred_study_time),experience=coalesce(p->>'experience',experience),onboarding_completed=coalesce((p->>'onboarded')::boolean,false),updated_at=now() where id=entry.user_id and not onboarding_completed;
 day:=(now() at time zone 'Asia/Ho_Chi_Minh')::date;
 with days as(select distinct (ended_at at time zone 'Asia/Ho_Chi_Minh')::date study_date from public.study_sessions where user_id=entry.user_id), groups as(select study_date,study_date-row_number() over(order by study_date)::int grp from days), runs as(select max(study_date) last_day,count(*)::int len from groups group by grp)
 select coalesce(max(len) filter(where last_day>=day-1),0),coalesce(max(len),0) into cur,longest from runs;
 update public.user_stats set total_xp=(select coalesce(sum(xp_earned),0) from public.study_sessions where user_id=entry.user_id),total_study_seconds=(select coalesce(sum(duration_seconds),0) from public.study_sessions where user_id=entry.user_id),current_streak=cur,longest_streak=longest,last_study_date=(select max((ended_at at time zone 'Asia/Ho_Chi_Minh')::date) from public.study_sessions where user_id=entry.user_id),updated_at=now() where user_id=entry.user_id;
 update public.legacy_imports set status='approved' where id=import_id;
end $$;
revoke all on function public.approve_legacy_import(uuid) from public,anon,authenticated;
commit;
