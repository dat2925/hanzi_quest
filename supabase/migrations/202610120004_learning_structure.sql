-- Additive schema. Existing content, lesson IDs and all progress remain intact.
begin;
alter table public.courses add column curriculum_family text not null default 'sample' check(curriculum_family in ('sample','foundation','HSK'));
create table public.lesson_prerequisites (
 lesson_id text not null references public.lessons(id),
 requires_lesson_id text not null references public.lessons(id),
 primary key(lesson_id,requires_lesson_id), check(lesson_id<>requires_lesson_id)
);
create index prerequisite_reverse on public.lesson_prerequisites(requires_lesson_id);
alter table public.lesson_prerequisites enable row level security;
revoke all on public.lesson_prerequisites from public,anon,authenticated;
grant select on public.lesson_prerequisites to authenticated;
create policy published on public.lesson_prerequisites for select to authenticated using(exists(select 1 from public.lessons l where l.id=lesson_id and l.is_published));
-- Preserve the legacy sample sequence without requiring it for new courses.
insert into public.lesson_prerequisites(lesson_id,requires_lesson_id)
select l.id,p.id from public.lessons l join public.lessons p on p.unit_id=l.unit_id and p.sort_order=l.sort_order-1
where l.content_json->'learning' is null;
create or replace function public.apply_learning_operation(p_operation jsonb) returns void language plpgsql security definer set search_path='' as $$
declare
 u uuid:=auth.uid(); op uuid:=(p_operation->>'id')::uuid; kind text:=p_operation->>'kind'; p jsonb:=p_operation->'payload';
 l public.lessons; q jsonb; trusted jsonb; r jsonb; n int; i int; correct boolean; hits int:=0; score numeric; award int; duration int;
 finished boolean; lid text; targets jsonb:='{}'; target text; c boolean; prev text; today date:=(now() at time zone 'Asia/Ho_Chi_Minh')::date; current_days int; longest int; ended timestamptz; study_day date;
begin
 if u is null then raise exception 'AUTH_REQUIRED'; end if;
 if op is null or kind is null or p is null or octet_length(p_operation::text)>250000 then raise exception 'INVALID_OPERATION'; end if;
 perform pg_advisory_xact_lock(hashtextextended(u::text,0));
 if exists(select 1 from public.sync_operations where user_id=u and id=op) then return; end if;
 perform public.learning_snapshot();
 if kind='profile' then
 update public.profiles set display_name=coalesce(p->>'name',display_name),target_hsk=coalesce(p->>'goal',target_hsk),daily_goal_minutes=coalesce((p->>'daily')::int,daily_goal_minutes),preferred_study_time=coalesce(p->>'time',preferred_study_time),experience=coalesce(p->>'experience',experience),onboarding_completed=coalesce((p->>'onboarded')::boolean,onboarding_completed),dark=coalesce((p->>'dark')::boolean,dark),sound=coalesce((p->>'sound')::boolean,sound),updated_at=now() where id=u;
 elsif kind='note' then
 select content into prev from public.notebook_entries where user_id=u and title='personal';
 if coalesce(prev,'')<>coalesce(p->>'base','') and coalesce(prev,'')<>p->>'value' then raise exception 'CONFLICT_NOTE'; end if;
 insert into public.notebook_entries(user_id,content) values(u,p->>'value') on conflict(user_id,title) do update set content=excluded.content,updated_at=now();
 elsif kind='task' then
 if p->>'key' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'INVALID_TASK'; end if;
 insert into public.notebook_tasks(user_id,task_key,completed) values(u,p->>'key',(p->>'completed')::boolean) on conflict(user_id,task_key) do update set completed=excluded.completed,updated_at=now();
 elsif kind='review' then perform private.word_review(u,p->>'hanzi',(p->>'correct')::boolean);
 elsif kind='difficult' then
 if not exists(select 1 from public.vocabulary where id=p->>'hanzi' and is_published) then raise exception 'UNKNOWN_WORD'; end if;
 insert into public.review_items(user_id,content_id,difficult) values(u,p->>'hanzi',(p->>'value')::boolean) on conflict(user_id,content_type,content_id) do update set difficult=excluded.difficult,updated_at=now();
 elsif kind='stage' then
 lid:=p->'lesson'->>'id';
 if exists(select 1 from public.sync_operations so where so.user_id=u and so.id=(p->>'sessionId')::uuid and so.kind='finish') then return; end if;
 if lid<>'practice' and not exists(select 1 from public.lessons where id=lid and is_published) then raise exception 'UNKNOWN_LESSON'; end if;
 insert into public.stage_progress(user_id,lesson_id,activity_key,state_json) values(u,nullif(lid,'practice'),lid,p)
 on conflict(user_id,activity_key,stage_id) do update set state_json=excluded.state_json,updated_at=now();
 elsif kind='finish' then
 lid:=p->>'lessonId'; duration:=greatest(0,least(14400,(p->>'seconds')::int));
 if duration is null then raise exception 'INVALID_DURATION'; end if;
 n:=jsonb_array_length(p->'questions'); if n is null or n<1 or n>100 then raise exception 'INVALID_ANSWERS'; end if;
 if lid<>'practice' then
 select le.* into l from public.lessons le join public.units un on un.id=le.unit_id join public.courses co on co.id=un.course_id where le.id=lid and le.is_published and co.is_published;
 if not found or n<>jsonb_array_length(l.content_json->'questions') then raise exception 'UNKNOWN_LESSON'; end if;
 -- Explicit prerequisite graph; the optional sample course has its own graph.
 if exists(select 1 from public.lesson_prerequisites req where req.lesson_id=l.id and not exists(select 1 from public.lesson_progress lp where lp.user_id=u and lp.lesson_id=req.requires_lesson_id and lp.completion_status='completed')) then raise exception 'LESSON_LOCKED'; end if;
 end if;
 for i in 0..n-1 loop
 q:=p->'questions'->i;
 if lid='practice' then select question_json into trusted from private.question_bank where question_key=q->>'key';
 else trusted:=l.content_json->'questions'->i; if trusted->>'key'<>q->>'key' then raise exception 'INVALID_QUESTION'; end if; end if;
 if trusted is null then raise exception 'INVALID_QUESTION'; end if;
 correct:=coalesce(q->>'selection'=trusted->>'answer',false) and not coalesce((q->>'assisted')::boolean,false);
 if correct then hits:=hits+1; end if;
 for target in select jsonb_array_elements_text(trusted->'targets') loop
 targets:=jsonb_set(targets,array[target],to_jsonb(coalesce((targets->>target)::boolean,true) and correct));
 end loop;
 end loop;
 score:=hits::numeric/n;
 select exists(select 1 from public.lesson_progress where user_id=u and lesson_id=lid and completion_status='completed') into finished;
 award:=case when finished then 10 else round(20+score*20)::int end;
 -- Rewards are computed from trusted questions. Bound abusive submission volume.
 if lid='practice' then award:=10; end if;
 if (select count(*) from public.sync_operations so where so.user_id=u and so.kind='finish' and so.created_at>now()-interval '1 day')>=1000 then raise exception 'RATE_LIMIT'; end if;
 ended:=coalesce(to_timestamp((p->>'endedAt')::numeric/1000),now());
 if ended>now()+interval '5 minutes' or ended<now()-interval '365 days' then raise exception 'INVALID_STUDY_DATE'; end if;
 study_day:=(ended at time zone 'Asia/Ho_Chi_Minh')::date;
 insert into public.study_sessions(user_id,lesson_id,operation_id,started_at,ended_at,duration_seconds,xp_earned,score) values(u,nullif(lid,'practice'),op,ended-duration*interval '1 second',ended,duration,award,score);
 if lid<>'practice' then
 insert into public.lesson_progress(user_id,lesson_id,completion_status,best_score,attempt_count,completed_at,current_stage) values(u,lid,case when score>=0.7 then 'completed' else 'in_progress' end,score,1,case when score>=0.7 then now() end,case when l.content_json->'learning' is not null then jsonb_array_length(l.content_json->'learning'->'screens') else n+1 end)
 on conflict(user_id,lesson_id) do update set completion_status=case when score>=0.7 then 'completed' else lesson_progress.completion_status end,best_score=greatest(lesson_progress.best_score,score),attempt_count=lesson_progress.attempt_count+1,completed_at=coalesce(lesson_progress.completed_at,case when score>=0.7 then now() end),current_stage=case when l.content_json->'learning' is not null then jsonb_array_length(l.content_json->'learning'->'screens') else n+1 end,updated_at=now();
 end if;
 for target,c in select key,value::text::boolean from jsonb_each(targets) loop perform private.word_review(u,target,c); end loop;
 insert into public.notebook_tasks(user_id,task_key,completed) values(u,study_day::text,true) on conflict(user_id,task_key) do update set completed=true,updated_at=now();
 delete from public.stage_progress where user_id=u and state_json->>'sessionId'=op::text;
 with days as(select distinct (ended_at at time zone 'Asia/Ho_Chi_Minh')::date d from public.study_sessions where user_id=u), groups as(select d,d-row_number() over(order by d)::int grp from days), runs as(select min(d) first_day,max(d) last_day,count(*)::int len from groups group by grp)
 select coalesce(max(len) filter(where last_day>=today-1),0),coalesce(max(len),0) into current_days,longest from runs;
 update public.user_stats set total_xp=total_xp+award,total_study_seconds=total_study_seconds+duration,current_streak=current_days,longest_streak=longest,last_study_date=greatest(last_study_date,study_day),updated_at=now() where user_id=u;
 elsif kind='legacy' then
 -- Preserve full evidence for administrator approval without trusting local XP.
 if length(p->>'sourceId')>100 or p->>'sourceId' is null then raise exception 'INVALID_SOURCE'; end if;
 insert into public.legacy_imports(user_id,source_id,data_json) values(u,p->>'sourceId',p->'data') on conflict(user_id,source_id) do nothing;
 -- Only merge non-achievement data, never overwrite newer remote values.
 if not exists(select 1 from public.notebook_entries where user_id=u and title='personal') and length(coalesce(p->'data'->>'notes',''))>0 then
 insert into public.notebook_entries(user_id,content) values(u,p->'data'->>'notes'); end if;
 for target in select jsonb_array_elements_text(p->'data'->'difficult') loop
 if exists(select 1 from public.vocabulary where id=target and is_published) then insert into public.review_items(user_id,content_id,difficult) values(u,target,true) on conflict(user_id,content_type,content_id) do update set difficult=true; end if;
 end loop;
 else raise exception 'UNKNOWN_OPERATION'; end if;
 insert into public.sync_operations(user_id,id,kind) values(u,op,kind);
end $$;
commit;
