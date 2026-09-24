-- 0004: 계약금액 과세·영세·부가세 수기 분리, 산출 변경안 관리자 승인 (설계안 v0.7 §33)

-- ── 계약금액 분리 ─────────────────────────────────────────────
-- 과세·영세 비율에 따라 부가세가 총액의 정확히 10%가 아니므로 계약서 기준으로 직접 입력한다.
alter table projects
  add column contract_taxable    bigint,   -- 계약 과세 공급가액
  add column contract_zero_rated bigint,   -- 계약 영세
  add column contract_vat        bigint,   -- 계약 부가세
  add constraint contract_split_sum check (
    contract_taxable is null or contract_zero_rated is null or contract_vat is null
    or contract_amount is null
    or contract_amount = contract_taxable + contract_zero_rated + contract_vat
  );

drop view budget_rollup;
create view budget_rollup with (security_invoker = true) as
with cur as (
  select l.project_id, sum(l.supply_total) as supply_total, sum(l.vat) as vat
  from budget_lines l join budget_versions v on v.id = l.version_id and v.status = 'current'
  group by l.project_id
)
select p.id as project_id,
       p.name,
       p.contract_amount,                                   -- 계약 총액(부가세 포함)
       p.contract_taxable + p.contract_zero_rated as contract_supply,  -- 계약 공급가액(미입력 시 null)
       p.contract_vat,
       coalesce(c.supply_total, 0)                       as own_budget_supply,
       coalesce(c.vat, 0)                                as own_budget_vat,
       coalesce(ch.children_supply, 0)                   as children_budget_supply,
       p.contract_taxable + p.contract_zero_rated - coalesce(ch.children_supply, 0) as unallocated_supply
from projects p
left join cur c on c.project_id = p.id
left join lateral (
  select sum(cc.supply_total) as children_supply
  from projects k join cur cc on cc.project_id = k.id
  where k.parent_id = p.id
) ch on true
where has_budget_access(p.id);

-- ── 산출 변경안: 작성 → 승인 요청 → 관리자 확정/반려 ─────────────
alter table budget_versions
  add column submitted_by  uuid references profiles(id),
  add column submitted_at  timestamptz,
  add column review_note   text;          -- 반려 사유 등

-- 버전 상태 변경은 아래 함수로만. 직접 수정은 관리자만, 직접 생성은 작성 중 상태만.
drop policy budget_versions_write on budget_versions;
drop policy budget_versions_update on budget_versions;
create policy budget_versions_insert on budget_versions for insert
  with check (status = 'draft' and submitted_at is null and has_budget_access(project_id));
create policy budget_versions_update on budget_versions for update using (is_admin()) with check (is_admin());

-- 승인 요청 중인 변경안의 산출 행도 잠금 (작성 중 + 미요청일 때만 편집)
create or replace function guard_budget_line() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_status budget_version_status; v_submitted timestamptz;
begin
  select status, submitted_at into v_status, v_submitted from budget_versions
   where id = coalesce(new.version_id, old.version_id);
  -- 프로젝트·버전 삭제에 따른 연쇄 삭제는 허용
  if tg_op = 'DELETE' and (v_status is null
                           or not exists (select 1 from projects where id = old.project_id)) then
    return old;
  end if;
  if v_status is distinct from 'draft' then
    raise exception '확정된 산출내역은 수정할 수 없습니다. 변경안을 만들어 수정하세요';
  end if;
  if v_submitted is not null then
    raise exception '승인 요청 중인 변경안입니다. 반려된 뒤 수정할 수 있습니다';
  end if;
  return coalesce(new, old);
end $$;

create or replace function submit_budget_version(p_version uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  select project_id into v_project from budget_versions
   where id = p_version and status = 'draft' and submitted_at is null;
  if v_project is null then raise exception '승인 요청할 수 있는 변경안이 아닙니다'; end if;
  if not has_budget_access(v_project) then raise exception '산출내역 권한이 없습니다'; end if;
  update budget_versions set submitted_by = auth.uid(), submitted_at = now(), review_note = null
   where id = p_version;
end $$;

create or replace function reject_budget_version(p_version uuid, p_note text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception '관리자만 반려할 수 있습니다'; end if;
  update budget_versions set submitted_at = null, review_note = p_note
   where id = p_version and status = 'draft' and submitted_at is not null;
  if not found then raise exception '승인 요청 중인 변경안이 아닙니다'; end if;
end $$;

-- 확정은 관리자만 (승인 요청 건 또는 관리자가 직접 작성한 변경안)
create or replace function confirm_budget_version(p_version uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_project uuid;
begin
  if not is_admin() then raise exception '산출 변경 확정은 관리자 승인이 필요합니다'; end if;
  select project_id into v_project from budget_versions where id = p_version and status = 'draft';
  if v_project is null then raise exception '작성 중인 변경안이 아닙니다'; end if;
  update budget_versions set status = 'superseded' where project_id = v_project and status = 'current';
  update budget_versions set status = 'current', confirmed_by = auth.uid(), confirmed_at = now()
   where id = p_version;
end $$;
