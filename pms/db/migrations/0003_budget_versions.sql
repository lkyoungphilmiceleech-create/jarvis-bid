-- 0003: 산출내역서 변경 이력(버전) + 상·하위 예산 배분 현황 (설계안 v0.6 §31)
-- 하위 프로젝트 산출은 사전에 확정되지만 진행 중 자주 바뀐다.
-- → 확정된 산출내역은 수정하지 않고, '변경안'을 만들어 확정하는 방식으로 이력을 모두 남긴다.

create type budget_version_status as enum ('draft', 'current', 'superseded');

create table budget_versions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  version_no    int  not null,
  label         text not null,                 -- 예: 최초 산출, 1차 변경
  reason        text,                          -- 변경 사유
  status        budget_version_status not null default 'draft',
  created_by    uuid references profiles(id) default auth.uid(),
  created_at    timestamptz not null default now(),
  confirmed_by  uuid references profiles(id),
  confirmed_at  timestamptz,
  unique (project_id, version_no),
  unique (id, project_id)
);
-- 프로젝트당 확정본은 1개, 작성 중 변경안도 1개
create unique index budget_versions_one_current on budget_versions(project_id) where status = 'current';
create unique index budget_versions_one_draft   on budget_versions(project_id) where status = 'draft';

alter table budget_lines add column version_id uuid not null;
alter table budget_lines add constraint budget_lines_version_fk
  foreign key (version_id, project_id) references budget_versions(id, project_id) on delete cascade;
create index on budget_lines(version_id);

alter table budget_versions enable row level security;
create policy budget_versions_read on budget_versions for select using (has_budget_access(project_id));
create policy budget_versions_write on budget_versions for insert with check (has_budget_access(project_id));
create policy budget_versions_update on budget_versions for update using (has_budget_access(project_id));
create policy budget_versions_delete on budget_versions for delete
  using (status = 'draft' and has_budget_access(project_id));

-- 확정·이전 버전의 산출 행은 수정 불가 (작성 중 변경안만 편집)
create or replace function guard_budget_line() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status budget_version_status;
begin
  select status into v_status from budget_versions
   where id = coalesce(new.version_id, old.version_id);
  -- 프로젝트·버전 삭제에 따른 연쇄 삭제는 허용
  if tg_op = 'DELETE' and (v_status is null
                           or not exists (select 1 from projects where id = old.project_id)) then
    return old;
  end if;
  if v_status is distinct from 'draft' then
    raise exception '확정된 산출내역은 수정할 수 없습니다. 변경안을 만들어 수정하세요';
  end if;
  return coalesce(new, old);
end $$;
create trigger budget_lines_guard before insert or update or delete on budget_lines
  for each row execute function guard_budget_line();

-- 변경안 만들기: 현재 확정본을 복사한 작성 중 버전 생성 (확정본이 없으면 빈 '최초 산출')
create or replace function new_budget_draft(p_project uuid, p_label text, p_reason text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_new uuid; v_cur uuid; v_no int;
begin
  if not has_budget_access(p_project) then
    raise exception '산출내역 권한이 없습니다';
  end if;
  select coalesce(max(version_no), 0) + 1 into v_no from budget_versions where project_id = p_project;
  select id into v_cur from budget_versions where project_id = p_project and status = 'current';
  insert into budget_versions(project_id, version_no, label, reason, created_by)
    values (p_project, v_no, p_label, p_reason, auth.uid())
    returning id into v_new;
  insert into budget_lines(project_id, version_id, category, item, taxable, zero_rated, vat, sort_order)
    select project_id, v_new, category, item, taxable, zero_rated, vat, sort_order
      from budget_lines where version_id = v_cur;
  return v_new;
end $$;

-- 변경안 확정: 기존 확정본 → 이전 버전, 변경안 → 확정본
create or replace function confirm_budget_version(p_version uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  select project_id into v_project from budget_versions where id = p_version and status = 'draft';
  if v_project is null then
    raise exception '작성 중인 변경안이 아닙니다';
  end if;
  if not has_budget_access(v_project) then
    raise exception '산출내역 권한이 없습니다';
  end if;
  update budget_versions set status = 'superseded' where project_id = v_project and status = 'current';
  update budget_versions set status = 'current', confirmed_by = auth.uid(), confirmed_at = now()
   where id = p_version;
end $$;

-- ── 상·하위 예산 배분 현황 ────────────────────────────────────
-- 상위 계약금액 대비 하위 프로젝트 확정 산출 합계, 미배정 잔액
create view budget_rollup with (security_invoker = true) as
with cur as (
  select l.project_id, sum(l.supply_total) as supply_total, sum(l.vat) as vat
  from budget_lines l join budget_versions v on v.id = l.version_id and v.status = 'current'
  group by l.project_id
)
select p.id as project_id,
       p.name,
       p.contract_amount,
       coalesce(c.supply_total, 0)                       as own_budget_supply,
       coalesce(c.vat, 0)                                as own_budget_vat,
       coalesce(ch.children_supply, 0)                   as children_budget_supply,
       p.contract_amount - coalesce(ch.children_supply, 0) as unallocated_supply
from projects p
left join cur c on c.project_id = p.id
left join lateral (
  select sum(cc.supply_total) as children_supply
  from projects k join cur cc on cc.project_id = k.id
  where k.parent_id = p.id
) ch on true
where has_budget_access(p.id);

-- 항목별 최초 산출 vs 현재 산출 vs 집행 (장부의 구분·항목 기준)
create view budget_vs_actual with (security_invoker = true) as
with lines as (
  select l.project_id, l.category, l.item,
         sum(l.supply_total) filter (where v.status = 'current') as current_supply,
         sum(l.supply_total) filter (where v.version_no = 1)     as initial_supply
  from budget_lines l join budget_versions v on v.id = l.version_id
  group by l.project_id, l.category, l.item
),
spent as (
  select project_id, category, item, sum(supply_total) as spent_supply
  from ledger_entries where project_id is not null
  group by project_id, category, item
)
select coalesce(l.project_id, s.project_id) as project_id,
       coalesce(l.category, s.category)     as category,
       coalesce(l.item, s.item)             as item,
       coalesce(l.initial_supply, 0)        as initial_supply,
       coalesce(l.current_supply, 0)        as current_supply,
       coalesce(s.spent_supply, 0)          as spent_supply,
       coalesce(l.current_supply, 0) - coalesce(s.spent_supply, 0) as remaining_supply
from lines l
full join spent s on s.project_id = l.project_id
                 and s.category is not distinct from l.category
                 and s.item is not distinct from l.item
where has_budget_access(coalesce(l.project_id, s.project_id));
