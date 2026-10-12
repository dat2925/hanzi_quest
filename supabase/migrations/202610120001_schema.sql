-- All mutations go through authenticated, bounded RPCs. No client table writes.
begin;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null default 'bạn' check(length(display_name) between 1 and 100), avatar_url text,
 target_hsk text not null default 'HSK 1', daily_goal_minutes int not null default 15 check(daily_goal_minutes between 1 and 180),
 preferred_study_time text not null default '20:00', onboarding_completed boolean not null default false,
 experience text not null default 'Mới bắt đầu', dark boolean not null default false, sound boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.courses (id text primary key, title text not null, description text not null default '', hsk_level int, syllabus_version text not null, sort_order int not null, is_published boolean not null default false);
create table public.units (id text primary key, course_id text not null references public.courses(id), title text not null, description text not null default '', sort_order int not null, unique(course_id,sort_order));
create table public.lessons (id text primary key, unit_id text not null references public.units(id), title text not null, description text not null default '', estimated_minutes int not null check(estimated_minutes>0), sort_order int not null, content_json jsonb not null, is_published boolean not null default false, unique(unit_id,sort_order));
create table public.vocabulary (id text primary key, hanzi text not null, pinyin text not null, meaning_vi text not null, examples_json jsonb not null default '[]', audio_url text, hsk_level int, syllabus_version text not null, is_published boolean not null default false, unique(hanzi,syllabus_version));
create table public.lesson_progress (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 lesson_id text not null references public.lessons(id), completion_status text not null default 'in_progress' check(completion_status in ('in_progress','completed')),
 current_stage int not null default -1, best_score numeric not null default 0 check(best_score between 0 and 1), attempt_count int not null default 0,
 completed_at timestamptz, updated_at timestamptz not null default now(), unique(user_id,lesson_id)
);
create table public.stage_progress (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, lesson_id text references public.lessons(id),
 activity_key text not null, stage_id text not null default 'current', state_json jsonb not null, score numeric not null default 0,
 completed_at timestamptz, updated_at timestamptz not null default now(), unique(user_id,activity_key,stage_id)
);
create table public.review_items (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, content_type text not null default 'vocabulary',
 content_id text not null references public.vocabulary(id), repetition_count int not null default 0, interval_days numeric not null default 0,
 ease_factor numeric not null default 2, next_review_at timestamptz not null default now(), last_review_at timestamptz, correct_count int not null default 0,
 difficult boolean not null default false, updated_at timestamptz not null default now(), unique(user_id,content_type,content_id)
);
create table public.notebook_entries (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, lesson_id text references public.lessons(id),
 title text not null default 'personal', content text not null default '' check(length(content)<=50000), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,title)
);
create table public.notebook_tasks (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, lesson_id text references public.lessons(id),
 task_key text not null, completed boolean not null default false, updated_at timestamptz not null default now(), unique(user_id,task_key)
);
create table public.study_sessions (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, lesson_id text references public.lessons(id), operation_id uuid not null,
 started_at timestamptz not null, ended_at timestamptz not null, duration_seconds int not null check(duration_seconds between 0 and 14400),
 xp_earned int not null check(xp_earned between 0 and 40), score numeric not null check(score between 0 and 1), unique(user_id,operation_id)
);
create table public.user_stats (
 user_id uuid primary key references auth.users(id) on delete cascade, total_xp bigint not null default 0, current_streak int not null default 0,
 longest_streak int not null default 0, last_study_date date, total_study_seconds bigint not null default 0, updated_at timestamptz not null default now()
);
create table public.sync_operations (user_id uuid not null references auth.users(id) on delete cascade, id uuid not null, kind text not null, created_at timestamptz not null default now(), primary key(user_id,id));
-- Unverifiable pre-account achievements require administrator review; never grant XP from client JSON.
create table public.legacy_imports (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, source_id text not null, data_json jsonb not null, status text not null default 'pending' check(status in ('pending','approved','rejected')), created_at timestamptz not null default now(), unique(user_id,source_id));
create table private.question_bank (question_key text primary key, question_json jsonb not null);
create index units_course on public.units(course_id);
create index lessons_unit on public.lessons(unit_id);
create index lp_lesson on public.lesson_progress(lesson_id);
create index sp_lesson on public.stage_progress(lesson_id);
create index review_due on public.review_items(user_id,next_review_at);
create index sessions_user_date on public.study_sessions(user_id,ended_at);
create index sessions_lesson on public.study_sessions(lesson_id);
create index entries_lesson on public.notebook_entries(lesson_id);
create index tasks_lesson on public.notebook_tasks(lesson_id);
do $$ declare t text; begin
 foreach t in array array['profiles','courses','units','lessons','vocabulary','lesson_progress','stage_progress','review_items','notebook_entries','notebook_tasks','study_sessions','user_stats','sync_operations','legacy_imports'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 if t not in ('courses','units','lessons','vocabulary') then
 execute format('create policy own_read on public.%I for select to authenticated using ((select auth.uid()) = %I)',t,case when t='profiles' then 'id' else 'user_id' end);
 end if;
 end loop;
end $$;
create policy published on public.courses for select to authenticated using(is_published);
create policy published on public.units for select to authenticated using(exists(select 1 from public.courses c where c.id=course_id and c.is_published));
create policy published on public.lessons for select to authenticated using(is_published and exists(select 1 from public.units u where u.id=unit_id));
create policy published on public.vocabulary for select to authenticated using(is_published);
create function private.word_review(u uuid, w text, correct boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not exists(select 1 from public.vocabulary where id=w and is_published) then raise exception 'UNKNOWN_WORD'; end if;
 insert into public.review_items(user_id,content_id,repetition_count,correct_count,interval_days,next_review_at,last_review_at,difficult)
 values(u,w,1,case when correct then 1 else 0 end,case when correct then 1 else 0 end,now()+case when correct then interval '1 day' else interval '10 minutes' end,now(),not correct)
 on conflict(user_id,content_type,content_id) do update set
 repetition_count=review_items.repetition_count+1,correct_count=review_items.correct_count+case when correct then 1 else 0 end,
 interval_days=case when correct then least(30,greatest(1,review_items.interval_days*2)) else 0 end,
 next_review_at=now()+case when correct then least(30,greatest(1,review_items.interval_days*2))*interval '1 day' else interval '10 minutes' end,
 last_review_at=now(),difficult=review_items.difficult or not correct,updated_at=now();
end $$;
create function public.learning_snapshot() returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); p public.profiles; result jsonb;
begin
 if u is null then raise exception 'AUTH_REQUIRED'; end if;
 insert into public.profiles(id,display_name) select u,left(coalesce(nullif(raw_user_meta_data->>'display_name',''),'bạn'),100) from auth.users where id=u on conflict do nothing;
 insert into public.user_stats(user_id) values(u) on conflict do nothing;
 select * into p from public.profiles where id=u;
 select jsonb_build_object('name',p.display_name,'goal',p.target_hsk,'daily',p.daily_goal_minutes,'time',p.preferred_study_time,'experience',p.experience,'onboarded',p.onboarding_completed,'dark',p.dark,'sound',p.sound,
 'xp',(select total_xp from public.user_stats where user_id=u),
 'completed',coalesce((select jsonb_agg(lesson_id order by completed_at) from public.lesson_progress where user_id=u and completion_status='completed'),'[]'),
 'history',coalesce((select jsonb_agg(jsonb_build_object('date',to_char(ended_at at time zone 'Asia/Ho_Chi_Minh','YYYY-MM-DD'),'minutes',greatest(1,round(duration_seconds/60.0)),'xp',xp_earned,'lesson',coalesce(lesson_id,'practice'),'accuracy',score) order by ended_at,id) from public.study_sessions where user_id=u),'[]'),
 'reviews',coalesce((select jsonb_object_agg(content_id,jsonb_build_object('due',extract(epoch from next_review_at)*1000,'interval',interval_days,'attempts',repetition_count,'correct',correct_count)) from public.review_items where user_id=u),'{}'),
 'difficult',coalesce((select jsonb_agg(content_id) from public.review_items where user_id=u and difficult),'[]'),
 'notes',coalesce((select content from public.notebook_entries where user_id=u and title='personal'),''),
 'written',coalesce((select jsonb_agg(task_key) from public.notebook_tasks where user_id=u and completed),'[]')) into result;
 return jsonb_build_object('progress',result,'stages',coalesce((select jsonb_agg(state_json order by updated_at desc) from public.stage_progress where user_id=u),'[]'),'legacyPending',exists(select 1 from public.legacy_imports where user_id=u and status='pending'),'legacyStatus',(select status from public.legacy_imports where user_id=u order by created_at desc limit 1));
end $$;
create function public.apply_learning_operation(p_operation jsonb) returns void language plpgsql security definer set search_path='' as $$
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
 -- Global order is stable within the current published sample course.
 if exists(select 1 from public.lessons prior where prior.unit_id=l.unit_id and prior.sort_order=l.sort_order-1 and not exists(select 1 from public.lesson_progress lp where lp.user_id=u and lp.lesson_id=prior.id and lp.completion_status='completed')) then raise exception 'LESSON_LOCKED'; end if;
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
 insert into public.lesson_progress(user_id,lesson_id,completion_status,best_score,attempt_count,completed_at,current_stage) values(u,lid,case when score>=0.7 then 'completed' else 'in_progress' end,score,1,case when score>=0.7 then now() end,n+1)
 on conflict(user_id,lesson_id) do update set completion_status=case when score>=0.7 then 'completed' else lesson_progress.completion_status end,best_score=greatest(lesson_progress.best_score,score),attempt_count=lesson_progress.attempt_count+1,completed_at=coalesce(lesson_progress.completed_at,case when score>=0.7 then now() end),current_stage=n+1,updated_at=now();
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
revoke all on function private.word_review(uuid,text,boolean) from public,anon,authenticated;
revoke all on function public.learning_snapshot() from public,anon;
revoke all on function public.apply_learning_operation(jsonb) from public,anon;
grant execute on function public.learning_snapshot() to authenticated;
grant execute on function public.apply_learning_operation(jsonb) to authenticated;
commit;
