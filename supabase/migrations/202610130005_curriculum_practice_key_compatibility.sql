-- Manual deployment after 202610130004. No content or learner rows are modified.
-- Legacy sample practice keys may target component characters as well as the whole word.
-- Reuse their unchanged grading/SRS only for canonical generated vocabulary practice.
begin;
create function private.curriculum_generated_practice(q jsonb) returns boolean
language sql immutable set search_path='' as $$
 select coalesce(
  q->'question'->>'contentId' is null
  and length(q->'question'->>'audio')>0
  and q->'question'->'targets'=jsonb_build_array(q->'question'->>'audio')
  and (q->>'key')::jsonb=jsonb_build_array(q->'question'->>'type',q->'question'->>'prompt',q->'question'->>'audio')
  and (
   (q->'question'->>'type'='quiz' and q->'question'->>'prompt' in (
    '“'||(q->'question'->>'audio')||'” có nghĩa là gì?',
    'Pinyin của '||(q->'question'->>'audio')||' là gì?'))
   or (q->'question'->>'type'='listen' and q->'question'->>'prompt'='Nghe và chọn chữ Hán'
    and q->'question'->>'answer'=q->'question'->>'audio')
  ),false);
$$;
revoke all on function private.curriculum_generated_practice(jsonb) from public,anon,authenticated;
create or replace function public.curriculum_admin_apply(p_actor uuid,p_request uuid,p_action text,p_digest text,p_rows jsonb,p_refs jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare r jsonb; ref jsonb; d public.curriculum_drafts; l public.lessons; q jsonb; w jsonb; dep text; result jsonb; previous jsonb;
begin
 perform private.require_curriculum_admin(p_actor);
 perform pg_advisory_xact_lock(72631012);
 previous:=public.curriculum_admin_replay(p_actor,p_request,p_action,p_digest);
 if previous is not null then return previous; end if;
 if p_action not in ('save','review','publish') or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 20
 or octet_length(p_rows::text)>4000000 or length(p_digest)<>64 then raise exception 'INVALID_BATCH'; end if;
 if (select count(distinct x->>'id') from jsonb_array_elements(p_rows) x)<>jsonb_array_length(p_rows) then raise exception 'DUPLICATE_LESSON_ID'; end if;
 for ref in select * from jsonb_array_elements(p_refs) loop
  if ref->>'kind'='draft' then
   if not exists(select 1 from public.curriculum_drafts where lesson_id=ref->>'id' and revision=(ref->>'revision')::int and learning_json=ref->'learning') then raise exception 'REFERENCE_MISMATCH: %',ref->>'id'; end if;
  else
   if not exists(select 1 from public.lessons where id=ref->>'id' and content_json=ref->'content' and is_published=(ref->>'published')::boolean) then raise exception 'REFERENCE_MISMATCH: %',ref->>'id'; end if;
  end if;
 end loop;
 for r in select * from jsonb_array_elements(p_rows) loop
  if r->>'id' is null or r->>'id'<>r->'learning'->>'id' or r->'learning'->>'schemaVersion'<>'2' or r->'learning'->>'status'<>'draft'
   or jsonb_array_length(r->'learning'->'screens')<7 then raise exception 'INVALID_LEARNING'; end if;
  select * into l from public.lessons where id=r->>'id';
  if found and (l.is_published or l.content_json->'learning' is null) then raise exception 'PUBLISHED_OR_LEGACY_IMMUTABLE'; end if;
  if l.id is not null and (
   exists(select 1 from public.lesson_progress where lesson_id=l.id) or
   exists(select 1 from public.stage_progress where lesson_id=l.id) or
   exists(select 1 from public.study_sessions where lesson_id=l.id) or
   exists(select 1 from public.notebook_entries where lesson_id=l.id) or
   exists(select 1 from public.notebook_tasks where lesson_id=l.id)
  ) then raise exception 'LESSON_HAS_PROGRESS'; end if;
  select * into d from public.curriculum_drafts where lesson_id=r->>'id';
  if p_action='save' then
   if d.lesson_id is not null then
    if (r->>'expected_revision')::int is distinct from d.revision then raise exception 'DRAFT_REVISION_CONFLICT'; end if;
    if d.course_id<>r->'course'->>'id' then raise exception 'COURSE_ID_IMMUTABLE'; end if;
   elsif l.id is not null then
    if (r->>'expected_revision')::int is distinct from 0 or l.content_json is distinct from r->'base_content' then raise exception 'LESSON_ID_EXISTS_USE_NEW_REVISION'; end if;
   elsif r->>'expected_revision' is not null then raise exception 'DRAFT_REVISION_CONFLICT'; end if;
   if exists(select 1 from public.courses where id=r->'course'->>'id' and (syllabus_version<>r->'course'->'syllabus'->>'version' or curriculum_family<>r->'course'->'syllabus'->>'family' or hsk_level is distinct from (r->'course'->'syllabus'->>'level')::int)) then raise exception 'COURSE_VERSION_CONFLICT'; end if;
   if exists(select 1 from public.units where id=r->'chapter'->>'id' and course_id<>r->'course'->>'id') then raise exception 'CHAPTER_ID_CONFLICT'; end if;
   if exists(select 1 from public.curriculum_drafts where course_id=r->'course'->>'id' and course_json->'syllabus'<>r->'course'->'syllabus') then raise exception 'COURSE_VERSION_CONFLICT'; end if;
   if exists(select 1 from public.curriculum_drafts where chapter_json->>'id'=r->'chapter'->>'id' and course_id<>r->'course'->>'id') then raise exception 'CHAPTER_ID_CONFLICT'; end if;
   insert into public.curriculum_drafts(lesson_id,course_id,course_json,chapter_json,learning_json,base_content,updated_by)
   values(r->>'id',r->'course'->>'id',r->'course',r->'chapter',r->'learning',case when l.id is not null then l.content_json else null end,p_actor)
   on conflict(lesson_id) do update set course_json=excluded.course_json,chapter_json=excluded.chapter_json,learning_json=excluded.learning_json,
    revision=curriculum_drafts.revision+1,reviewed_revision=null,reviewed_content=null,reviewed_by=null,reviewed_at=null,updated_by=p_actor,updated_at=now();
  else
   if d.lesson_id is null or d.revision is distinct from (r->>'expected_revision')::int or d.learning_json<>r->'learning' then raise exception 'DRAFT_REVISION_CONFLICT'; end if;
   if r->'content'->'learning'<>d.learning_json then raise exception 'DRAFT_CONTENT_MISMATCH'; end if;
   if p_action='review' then
    update public.curriculum_drafts set reviewed_revision=revision,reviewed_content=r->'content',reviewed_by=p_actor,reviewed_at=now() where lesson_id=d.lesson_id;
   else
    if d.reviewed_revision is distinct from d.revision or d.reviewed_content is distinct from r->'content' then raise exception 'REVIEW_REQUIRED'; end if;
    if l.id is not null and l.content_json is distinct from d.base_content then raise exception 'DRAFT_CONTENT_MISMATCH'; end if;
    for dep in select jsonb_array_elements_text(d.learning_json->'prerequisites') loop
     if not exists(select 1 from public.lessons where id=dep and is_published) and not exists(select 1 from jsonb_array_elements(p_rows) x where x->>'id'=dep) then raise exception 'PREREQUISITE_NOT_PUBLISHED'; end if;
    end loop;
    if exists(select 1 from public.courses where id=d.course_id and (syllabus_version<>d.course_json->'syllabus'->>'version' or curriculum_family<>d.course_json->'syllabus'->>'family' or hsk_level is distinct from (d.course_json->'syllabus'->>'level')::int)) then raise exception 'COURSE_VERSION_CONFLICT'; end if;
    insert into public.courses(id,title,syllabus_version,curriculum_family,hsk_level,sort_order,is_published)
    values(d.course_id,d.course_json->>'title',d.course_json->'syllabus'->>'version',d.course_json->'syllabus'->>'family',(d.course_json->'syllabus'->>'level')::int,(select coalesce(max(sort_order),-1)+1 from public.courses),true) on conflict(id) do nothing;
    if exists(select 1 from public.units where id=d.chapter_json->>'id' and course_id<>d.course_id) then raise exception 'CHAPTER_ID_CONFLICT'; end if;
    insert into public.units(id,course_id,title,description,sort_order) values(d.chapter_json->>'id',d.course_id,d.chapter_json->>'title',d.chapter_json->>'description',(select coalesce(max(sort_order),-1)+1 from public.units where course_id=d.course_id)) on conflict(id) do nothing;
    for w in select * from jsonb_array_elements(r->'content'->'words') loop
     if exists(select 1 from public.vocabulary where id=w->>'hanzi' and (pinyin<>w->>'pinyin' or meaning_vi<>w->>'meaning')) then raise exception 'VOCABULARY_CONFLICT_REVIEW_READING_AND_MEANING'; end if;
     insert into public.vocabulary(id,hanzi,pinyin,meaning_vi,syllabus_version,is_published)
      values(w->>'hanzi',w->>'hanzi',w->>'pinyin',w->>'meaning',d.course_json->'syllabus'->>'version',true) on conflict(id) do nothing;
     update public.vocabulary set is_published=true where id=w->>'hanzi' and not is_published;
    end loop;
    for q in select * from jsonb_array_elements(r->'bank') loop
     if exists(select 1 from private.question_bank where question_key=q->>'key' and
       case when q->'question'->>'contentId' is null then
        question_json->'answer' is distinct from q->'question'->'answer' or (question_json->'targets' is distinct from q->'question'->'targets' and not private.curriculum_generated_practice(q))
        or question_json->'type' is distinct from q->'question'->'type' or question_json->'prompt' is distinct from q->'question'->'prompt'
        or coalesce(question_json->>'audio','')<>coalesce(q->'question'->>'audio','')
       else question_json<>q->'question' end) then
      if l.id is null or coalesce(q->'question'->>'contentId','') not like l.id||':%'
       or not exists(select 1 from jsonb_array_elements(l.content_json->'questions') old where old->>'key'=q->>'key')
       or exists(select 1 from public.lessons published cross join lateral jsonb_array_elements(published.content_json->'questions') item where published.is_published and item->>'key'=q->>'key')
      then raise exception 'QUESTION_KEY_CONFLICT: %',q->>'key'; end if;
      update private.question_bank set question_json=q->'question' where question_key=q->>'key';
     end if;
     insert into private.question_bank(question_key,question_json) values(q->>'key',q->'question') on conflict do nothing;
    end loop;
    if l.id is null then
     insert into public.lessons(id,unit_id,title,description,estimated_minutes,sort_order,content_json,is_published)
     values(d.lesson_id,d.chapter_json->>'id',d.learning_json->>'title',d.learning_json->>'description',(d.learning_json->>'minutes')::int,(select coalesce(max(sort_order),-1)+1 from public.lessons where unit_id=d.chapter_json->>'id'),jsonb_set(r->'content','{learning,status}','"published"'),true);
    else
     update public.lessons set unit_id=d.chapter_json->>'id',title=d.learning_json->>'title',description=d.learning_json->>'description',estimated_minutes=(d.learning_json->>'minutes')::int,
      content_json=jsonb_set(r->'content','{learning,status}','"published"'),is_published=true where id=d.lesson_id;
    end if;
    update public.courses set is_published=true where id=d.course_id and not is_published;
   end if;
  end if;
 end loop;
 if p_action='publish' then
  for r in select * from jsonb_array_elements(p_rows) loop
   delete from public.lesson_prerequisites where lesson_id=r->>'id';
   for dep in select jsonb_array_elements_text(r->'learning'->'prerequisites') loop
    insert into public.lesson_prerequisites(lesson_id,requires_lesson_id) values(r->>'id',dep);
   end loop;
  end loop;
 end if;
 result:=jsonb_build_object('action',p_action,'ids',(select jsonb_agg(x->>'id') from jsonb_array_elements(p_rows) x),'requestId',p_request);
 insert into public.curriculum_admin_operations(request_id,actor,action,digest,result) values(p_request,p_actor,p_action,p_digest,result);
 return result;
end $$;
commit;
