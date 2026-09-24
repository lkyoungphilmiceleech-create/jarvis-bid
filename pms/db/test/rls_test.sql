-- 권한(RLS) 검증. 실패 시 예외로 중단된다.
\set ON_ERROR_STOP on
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

insert into auth.users values
  ('00000000-0000-0000-0000-00000000000a'),  -- 관리자
  ('00000000-0000-0000-0000-00000000000b'),  -- 예산 권한자(상위 프로젝트)
  ('00000000-0000-0000-0000-00000000000c');  -- 일반 직원
insert into profiles(id, name, email, role) values
  ('00000000-0000-0000-0000-00000000000a', '관리자', 'a@x', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'PM', 'b@x', 'member'),
  ('00000000-0000-0000-0000-00000000000c', '직원', 'c@x', 'member');
insert into projects(id, name) values ('10000000-0000-0000-0000-000000000001', 'KOCCA 해외마켓');
insert into projects(id, parent_id, name) values
  ('10000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'VivaTech');
insert into project_members(project_id, user_id, budget_access) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', true);
insert into budget_lines(project_id, category, item, taxable, zero_rated, vat) values
  ('10000000-0000-0000-0000-000000000002', '운영비', '부스', 1000000, 500000, 100000);

create function pg_temp.check(cond boolean, msg text) returns void language plpgsql as $$
begin if not cond then raise exception 'FAIL: %', msg; end if; raise notice 'PASS: %', msg; end $$;

set role authenticated;

-- 일반 직원
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check((select count(*) from projects) = 2, '직원: 프로젝트 전체 열람');
select pg_temp.check((select count(*) from budget_lines) = 0, '직원: 산출내역서 비공개');
insert into ledger_entries(project_id, paid_on, taxable, vat, method)
  values ('10000000-0000-0000-0000-000000000002', '2026-09-01', 10000, 1000, 'corp_card');
select pg_temp.check((select count(*) from ledger_entries) = 1, '직원: 본인 지출 입력·조회');
do $$ begin
  begin
    insert into project_members(project_id, user_id, budget_access)
      values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', true);
    raise exception 'FAIL: 직원이 예산 권한을 스스로 부여함';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: 직원은 예산 권한 부여 불가';
  end;
end $$;
do $$ begin
  begin
    update profiles set role = 'admin' where id = auth.uid();
    raise exception 'FAIL: 직원이 스스로 관리자 승격';
  exception when insufficient_privilege or check_violation then
    raise notice 'PASS: 직원은 관리자 승격 불가';
  end;
end $$;

-- 상위 프로젝트 예산 권한자 → 하위 프로젝트 상속
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) from budget_lines) = 1, 'PM: 하위 프로젝트 산출내역서 상속 열람');
select pg_temp.check((select supply_total from budget_lines) = 1500000, '합계 = 과세 + 영세');
select pg_temp.check((select count(*) from ledger_entries) = 1, 'PM: 프로젝트 장부 열람');

-- 관리자
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
insert into project_members(project_id, user_id, budget_access)
  values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000c', true);
select pg_temp.check(true, '관리자: 예산 권한 부여');
reset role;
