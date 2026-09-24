-- 권한(RLS) 검증. 실패 시 예외로 중단된다.
\set ON_ERROR_STOP on
grant usage on schema public, auth to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- 가입 트리거가 프로필을 만든 뒤, 초기 관리자·활성화는 서버 작업(service role)으로 설정
insert into auth.users(id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@x', '{"name":"관리자"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@x', '{"name":"PM"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@x', '{"name":"직원"}');
update profiles set active = true;
update profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000a';
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
  exception when insufficient_privilege or check_violation or raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
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

-- 0002: 회원가입 → 비활성 프로필 → 관리자 승인
insert into auth.users(id, email) values ('00000000-0000-0000-0000-00000000000d', 'd@x');
select pg_temp.check((select not active from profiles where id = '00000000-0000-0000-0000-00000000000d'),
                     '가입 직후 비활성(승인 대기)');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.check((select count(*) from projects) = 0, '승인 전: 프로젝트 열람 불가');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
update profiles set active = true where id = '00000000-0000-0000-0000-00000000000d';  -- RLS로 0건 반영
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.check((select count(*) from projects) = 0, '직원은 타인 가입 승인 불가');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
update profiles set active = true where id = '00000000-0000-0000-0000-00000000000d';
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select pg_temp.check((select count(*) from projects) = 2, '관리자 승인 후 열람 가능');

-- 외화 송금: 환율 정보 없으면 저장 거부
do $$ begin
  begin
    insert into ledger_entries(project_id, paid_on, zero_rated, method, currency, foreign_amount)
      values ('10000000-0000-0000-0000-000000000002', '2026-09-01', 1710113, 'overseas_transfer', 'USD', 1234.56);
    raise exception 'FAIL: 환율 없는 외화 건 저장됨';
  exception when check_violation then
    raise notice 'PASS: 외화 건은 환율·기준일 필수';
  end;
end $$;
insert into ledger_entries(project_id, paid_on, zero_rated, method, currency, foreign_amount,
                           fx_rate, fx_rate_date, fees, fee_total)
  values ('10000000-0000-0000-0000-000000000002', '2026-09-01', 1710113, 'overseas_transfer', 'USD', 1234.56,
          1385.20, '2026-09-01', '[{"label":"송금수수료","krw":10000}]', 10000);
select pg_temp.check(true, '외화 송금 저장');
reset role;
