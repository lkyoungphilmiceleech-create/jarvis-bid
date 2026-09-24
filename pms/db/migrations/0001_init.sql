-- MICELEECH PMS 초기 스키마 (설계안 v0.4 §3, §15, §16, §18, §19)
-- 대상: Supabase(PostgreSQL 15+). auth.users / auth.uid() 는 Supabase 제공.

create extension if not exists pgcrypto;

-- ── 사용자 ─────────────────────────────────────────────────────
create type app_role as enum ('admin', 'member');

create table profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text not null,
  email       text not null unique,
  role        app_role not null default 'member',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ── 프로젝트 (하위 프로젝트는 parent_id로 무제한 중첩) ─────────
create type project_status as enum ('pipeline', 'active', 'on_hold', 'closing', 'archived');

create table projects (
  id                uuid primary key default gen_random_uuid(),
  parent_id         uuid references projects(id) on delete cascade,
  name              text not null,
  client_org        text,                         -- 발주기관
  bid_notice_no     text,                         -- 나라장터 공고번호(jarvis-bid 수집 데이터 연결)
  status            project_status not null default 'active',
  pm_id             uuid references profiles(id), -- null이면 상위 프로젝트 PM 상속
  contract_amount   bigint,                       -- 계약금액(공급가액)
  start_date        date,
  end_date          date,
  drive_folder_url  text,                         -- 구글 드라이브 원본 폴더
  sheet_url         text,                         -- 프로젝트 구글 스프레드시트
  custom            jsonb not null default '{}',  -- 사용자 정의 필드
  archived_at       timestamptz,
  lessons_learned   text,
  created_at        timestamptz not null default now(),
  check (parent_id is distinct from id)
);
create index on projects(parent_id);

-- 프로젝트 참여자. budget_access=true 이면 산출내역서·장부·수익 열람/수정 가능(하위 프로젝트에 상속)
create table project_members (
  project_id     uuid not null references projects(id) on delete cascade,
  user_id        uuid not null references profiles(id) on delete cascade,
  role_label     text,                 -- 예: PM, PL, 현장운영
  budget_access  boolean not null default false,
  start_date     date,
  end_date       date,
  primary key (project_id, user_id)
);

-- ── 과업·업무 ─────────────────────────────────────────────────
create type work_status as enum ('todo', 'doing', 'done', 'blocked');

create table work_items (           -- 과업지시서 항목
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  title       text not null,
  weight      numeric not null default 1 check (weight >= 0),  -- 공정률 가중치(기본: 배정 예산)
  progress    numeric not null default 0 check (progress between 0 and 100),
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);

create table tasks (
  id            uuid primary key default gen_random_uuid(),
  work_item_id  uuid not null references work_items(id) on delete cascade,
  title         text not null,
  assignee_id   uuid references profiles(id),
  due_date      date,
  status        work_status not null default 'todo',
  created_at    timestamptz not null default now()
);

create table milestones (            -- 보고회·납품·검수 등 주요 마감
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  title       text not null,
  due_date    date not null,
  done        boolean not null default false
);

-- 문제점·해결안 보고
create type issue_status as enum ('open', 'in_progress', 'resolved');

create table issues (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  problem      text not null,
  impact       text,
  solution     text,
  owner_id     uuid references profiles(id),
  status       issue_status not null default 'open',
  reported_by  uuid references profiles(id) default auth.uid(),
  reported_at  timestamptz not null default now(),
  resolved_at  timestamptz
);

-- 조직원 간 업무요청
create type request_status as enum ('requested', 'accepted', 'rejected', 'done');

create table requests (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade,
  requester_id  uuid not null references profiles(id) default auth.uid(),
  assignee_id   uuid not null references profiles(id),
  title         text not null,
  body          text,
  due_date      date,
  status        request_status not null default 'requested',
  created_at    timestamptz not null default now()
);

-- ── 바이어·파트너사 공용 DB ───────────────────────────────────
create type partner_kind as enum ('buyer', 'partner', 'company', 'vendor');

create table partners (
  id          uuid primary key default gen_random_uuid(),
  kind        partner_kind not null,
  name        text not null,
  country     text,
  contact     jsonb not null default '{}',
  notes       text,
  created_at  timestamptz not null default now()
);

create table project_partners (
  project_id  uuid not null references projects(id) on delete cascade,
  partner_id  uuid not null references partners(id) on delete cascade,
  role_note   text,
  primary key (project_id, partner_id)
);

-- ── 산출내역서(예산)·정산 장부: 권한자만 ─────────────────────
create table budget_lines (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  category     text not null,              -- 구분
  item         text not null,              -- 항목
  taxable      bigint not null default 0,  -- 과세(공급가액)
  zero_rated   bigint not null default 0,  -- 영세
  vat          bigint not null default 0,  -- 부가세
  supply_total bigint generated always as (taxable + zero_rated) stored,  -- 합계
  sort_order   int not null default 0
);

create type pay_method as enum ('corp_card', 'personal_card', 'domestic_transfer', 'overseas_transfer');
create type entry_source as enum ('app', 'sheet');

create table ledger_entries (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid references projects(id) on delete restrict,  -- null = 미분류함
  work_item_id    uuid references work_items(id) on delete set null,
  paid_on         date not null,                    -- 출금일
  category        text,                             -- 구분
  item            text,                             -- 항목
  taxable         bigint not null default 0,        -- 과세(공급가액)
  zero_rated      bigint not null default 0,        -- 영세
  vat             bigint not null default 0,        -- 부가세
  supply_total    bigint generated always as (taxable + zero_rated) stored,  -- 합계
  method          pay_method not null,              -- 지급형태
  payee           text,                             -- 지급처
  note            text,                             -- 비고
  currency        text not null default 'KRW',
  fx_rate         numeric,
  original_amount numeric,
  receipt_path    text,                             -- 증빙 파일(스토리지 경로)
  source          entry_source not null default 'app',
  source_row_key  text,                             -- 시트 원본 행 식별자(중복 방지)
  created_by      uuid not null references profiles(id) default auth.uid(),
  created_at      timestamptz not null default now(),
  unique (source, source_row_key)
);
create index on ledger_entries(project_id, paid_on);

-- ── 권한 함수 ─────────────────────────────────────────────────
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and active);
$$;

-- 해당 프로젝트 또는 상위 프로젝트 중 하나라도 budget_access 가 있으면 true
create or replace function has_budget_access(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  with recursive chain as (
    select id, parent_id from projects where id = p_project
    union all
    select p.id, p.parent_id from projects p join chain c on p.id = c.parent_id
  )
  select is_admin() or exists (
    select 1 from project_members m join chain c on m.project_id = c.id
    where m.user_id = auth.uid() and m.budget_access
  );
$$;

create or replace function is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and active);
$$;

-- ── RLS ──────────────────────────────────────────────────────
alter table profiles          enable row level security;
alter table projects          enable row level security;
alter table project_members   enable row level security;
alter table work_items        enable row level security;
alter table tasks             enable row level security;
alter table milestones        enable row level security;
alter table issues            enable row level security;
alter table requests          enable row level security;
alter table partners          enable row level security;
alter table project_partners  enable row level security;
alter table budget_lines      enable row level security;
alter table ledger_entries    enable row level security;

-- 공개(사내 전원) 영역: 열람·편집 가능, 삭제는 관리자
do $$
declare t text;
begin
  foreach t in array array['projects','project_members','work_items','tasks','milestones',
                           'issues','requests','partners','project_partners'] loop
    execute format('create policy %I on %I for select using (is_active_user())', t||'_read', t);
    execute format('create policy %I on %I for insert with check (is_active_user())', t||'_insert', t);
    execute format('create policy %I on %I for update using (is_active_user())', t||'_update', t);
    execute format('create policy %I on %I for delete using (is_admin())', t||'_delete', t);
  end loop;
end $$;

-- 예산 권한은 관리자만 부여 가능(참여자 추가는 누구나, budget_access 변경은 트리거로 차단)
create or replace function guard_budget_access() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() 가 없는 서버·마이그레이션 작업(service role)은 허용
  if new.budget_access and auth.uid() is not null and not is_admin()
     and (tg_op = 'INSERT' or not old.budget_access) then
    raise exception '예산 권한은 관리자만 부여할 수 있습니다';
  end if;
  return new;
end $$;
create trigger project_members_guard before insert or update on project_members
  for each row execute function guard_budget_access();

create policy profiles_read   on profiles for select using (is_active_user());
create policy profiles_self   on profiles for update using (id = auth.uid() or is_admin())
  with check (is_admin() or role = (select role from profiles where id = auth.uid()));
create policy profiles_admin  on profiles for insert with check (is_admin());

-- 산출내역서: 권한자만
create policy budget_rw on budget_lines for all
  using (has_budget_access(project_id)) with check (has_budget_access(project_id));

-- 장부: 권한자는 해당 프로젝트 전체, 직원은 본인 입력 건만
create policy ledger_read on ledger_entries for select
  using (created_by = auth.uid() or (project_id is not null and has_budget_access(project_id)) or is_admin());
create policy ledger_insert on ledger_entries for insert
  with check (is_active_user() and created_by = auth.uid());
create policy ledger_update on ledger_entries for update
  using (created_by = auth.uid() or (project_id is not null and has_budget_access(project_id)) or is_admin());
create policy ledger_delete on ledger_entries for delete
  using (is_admin() or (project_id is not null and has_budget_access(project_id)));

-- ── 대시보드 뷰 ───────────────────────────────────────────────
-- 공정률 = Σ(가중치×진척) / Σ가중치
create view project_progress with (security_invoker = true) as
select p.id as project_id,
       case when sum(w.weight) > 0
            then round(sum(w.weight * w.progress) / sum(w.weight), 1) end as progress_pct
from projects p left join work_items w on w.project_id = p.id
group by p.id;
