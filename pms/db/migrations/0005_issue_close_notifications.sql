-- 0005: 이슈 해결 처리는 PM만, 알림 발송함(이메일·카카오워크) (설계안 v0.9 §38~39)

-- ── 실질 PM: 프로젝트에 PM이 없으면 상위 프로젝트 PM 상속 ─────────
create or replace function effective_pm(p_project uuid) returns uuid
language sql stable security definer set search_path = public as $$
  with recursive chain as (
    select id, parent_id, pm_id, 0 as depth from projects where id = p_project
    union all
    select p.id, p.parent_id, p.pm_id, c.depth + 1 from projects p join chain c on p.id = c.parent_id
  )
  select pm_id from chain where pm_id is not null order by depth limit 1;
$$;

-- 이슈 '해결됨' 전환·재오픈은 해당 프로젝트 PM(관리자는 예외 처리 권한)
create or replace function guard_issue_status() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status
     and (new.status = 'resolved' or old.status = 'resolved') then
    if auth.uid() is not null and auth.uid() is distinct from effective_pm(new.project_id) and not is_admin() then
      raise exception '이슈 해결 처리는 프로젝트 PM만 할 수 있습니다';
    end if;
    new.resolved_at := case when new.status = 'resolved' then now() end;
  end if;
  return new;
end $$;
create trigger issues_status_guard before update on issues
  for each row execute function guard_issue_status();

alter table issues add column resolution_note text;   -- 해결 내용

-- ── 알림 설정 ────────────────────────────────────────────────
alter table profiles
  add column notify_email     boolean not null default true,
  add column notify_kakaowork boolean not null default true,
  add column kakaowork_email  text;     -- 카카오워크 계정 이메일이 다를 때만 입력

-- ── 알림 발송함: DB 이벤트가 쌓고, 서버 작업(cron)이 발송 ────────
create type notify_channel as enum ('email', 'kakaowork');

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  channel     notify_channel not null,
  kind        text not null,            -- request_new, request_status, issue_new, due_soon
  title       text not null,
  body        text not null,
  link        text,                     -- 앱 내 경로 (/me 등)
  dedupe_key  text,                     -- 같은 알림 중복 방지 (예: due_soon:task:<id>:<date>)
  created_at  timestamptz not null default now(),
  sent_at     timestamptz,
  attempts    int not null default 0,
  last_error  text,
  unique (channel, dedupe_key)
);
create index notifications_pending on notifications(created_at) where sent_at is null;

alter table notifications enable row level security;
-- 본인 알림만 열람. 생성·발송 처리는 트리거·서버 작업(service role)만
create policy notifications_own on notifications for select using (user_id = auth.uid());

-- 사용자 설정에 따라 채널별로 적재
create or replace function enqueue_notification(
  p_user uuid, p_kind text, p_title text, p_body text, p_link text, p_dedupe text default null
) returns void language plpgsql security definer set search_path = public as $$
declare pr profiles;
begin
  select * into pr from profiles where id = p_user and active;
  if not found then return; end if;
  if pr.notify_email then
    insert into notifications(user_id, channel, kind, title, body, link, dedupe_key)
    values (p_user, 'email', p_kind, p_title, p_body, p_link, p_dedupe)
    on conflict (channel, dedupe_key) do nothing;
  end if;
  if pr.notify_kakaowork then
    insert into notifications(user_id, channel, kind, title, body, link, dedupe_key)
    values (p_user, 'kakaowork', p_kind, p_title, p_body, p_link, p_dedupe)
    on conflict (channel, dedupe_key) do nothing;
  end if;
end $$;

-- 업무요청: 새 요청 → 받는 사람, 상태 변경 → 요청한 사람
create or replace function notify_request() returns trigger
language plpgsql security definer set search_path = public as $$
declare who text;
begin
  if tg_op = 'INSERT' then
    select name into who from profiles where id = new.requester_id;
    perform enqueue_notification(new.assignee_id, 'request_new', '[업무요청] ' || new.title,
      coalesce(who, '') || '님이 업무를 요청했습니다.' ||
      coalesce(' 기한: ' || new.due_date::text, ''), '/me');
  elsif new.status is distinct from old.status then
    select name into who from profiles where id = new.assignee_id;
    perform enqueue_notification(new.requester_id, 'request_status', '[업무요청] ' || new.title,
      coalesce(who, '') || '님이 요청을 ' ||
      case new.status when 'accepted' then '수락' when 'rejected' then '반려' when 'done' then '완료' else new.status::text end ||
      '했습니다.', '/me');
  end if;
  return new;
end $$;
create trigger requests_notify after insert or update on requests
  for each row execute function notify_request();

-- 이슈 보고 → 프로젝트 PM
create or replace function notify_issue() returns trigger
language plpgsql security definer set search_path = public as $$
declare pm uuid; pname text;
begin
  pm := effective_pm(new.project_id);
  if pm is null or pm = new.reported_by then return new; end if;
  select name into pname from projects where id = new.project_id;
  perform enqueue_notification(pm, 'issue_new', '[이슈] ' || coalesce(pname, '') || ' — ' || left(new.problem, 60),
    new.problem || coalesce(E'\n해결안: ' || new.solution, ''), '/me');
  return new;
end $$;
create trigger issues_notify after insert on issues
  for each row execute function notify_issue();

-- 마감 임박(D-1·D-DAY) 알림 적재: 서버 작업이 매일 아침 호출
create or replace function enqueue_due_reminders(p_today date) returns int
language plpgsql security definer set search_path = public as $$
declare n int := 0; r record;
begin
  for r in
    select t.id, t.title, t.due_date, t.assignee_id as uid, 'task' as kind
      from tasks t where t.status <> 'done' and t.assignee_id is not null
       and t.due_date between p_today and p_today + 1
    union all
    select m.id, m.title, m.due_date, effective_pm(m.project_id), 'milestone'
      from milestones m where not m.done and m.due_date between p_today and p_today + 1
    union all
    select q.id, q.title, q.due_date, q.assignee_id, 'request'
      from requests q where q.status in ('requested', 'accepted') and q.due_date between p_today and p_today + 1
  loop
    continue when r.uid is null;
    perform enqueue_notification(r.uid, 'due_soon',
      '[마감 ' || case when r.due_date = p_today then 'D-DAY' else 'D-1' end || '] ' || r.title,
      '마감일: ' || r.due_date::text, '/me', 'due_soon:' || r.kind || ':' || r.id || ':' || r.due_date);
    n := n + 1;
  end loop;
  return n;
end $$;
-- 적재 함수는 트리거·서버 작업 전용 (사용자가 직접 호출해 타인에게 알림을 보내지 못하게)
do $$
declare r text;
begin
  foreach r in array array['public', 'anon', 'authenticated'] loop
    if r = 'public' or exists (select 1 from pg_roles where rolname = r) then
      execute format('revoke execute on function enqueue_notification(uuid, text, text, text, text, text) from %s', r);
      execute format('revoke execute on function enqueue_due_reminders(date) from %s', r);
    end if;
  end loop;
end $$;

-- 내가 (실질) PM인 프로젝트의 미해결 이슈 — '내 업무' 화면용
create view my_pm_issues with (security_invoker = true) as
select i.id, i.project_id, p.name as project_name, i.problem, i.solution, i.status, i.reported_at,
       rp.name as reporter_name
from issues i
join projects p on p.id = i.project_id
left join profiles rp on rp.id = i.reported_by
where i.status <> 'resolved' and effective_pm(i.project_id) = auth.uid();
