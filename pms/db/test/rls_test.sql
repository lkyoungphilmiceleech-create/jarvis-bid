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
update projects set contract_amount = 841000000, contract_taxable = 700000000, contract_zero_rated = 71000000,
                    contract_vat = 70000000 where id = '10000000-0000-0000-0000-000000000001';
insert into budget_versions(id, project_id, version_no, label) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 1, '최초 산출');
insert into budget_lines(project_id, version_id, category, item, taxable, zero_rated, vat) values
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', '운영비', '부스', 1000000, 500000, 100000);
update budget_versions set status = 'current' where id = '20000000-0000-0000-0000-000000000001';

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

-- 0003: 산출내역 변경 이력
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  begin
    update budget_lines set taxable = 1 where version_id = '20000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: 확정 산출내역이 직접 수정됨';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: 확정 산출내역 직접 수정 불가';
  end;
end $$;
select new_budget_draft('10000000-0000-0000-0000-000000000002', '1차 변경', '부스 규모 확대') as draft \gset
select pg_temp.check((select count(*) from budget_lines where version_id = :'draft') = 1, '변경안: 확정본 복사');
update budget_lines set taxable = 2000000, vat = 200000 where version_id = :'draft';
insert into ledger_entries(project_id, paid_on, category, item, taxable, vat, method)
  values ('10000000-0000-0000-0000-000000000002', '2026-09-02', '운영비', '부스', 800000, 80000, 'domestic_transfer');
select submit_budget_version(:'draft');
do $$ begin
  begin
    update budget_lines set taxable = 1 where version_id = (select id from budget_versions where submitted_at is not null);
    raise exception 'FAIL: 승인 요청 중 변경안이 수정됨';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: 승인 요청 중에는 수정 잠금';
  end;
end $$;
do $$ begin
  begin
    perform confirm_budget_version((select id from budget_versions where submitted_at is not null));
    raise exception 'FAIL: 비관리자가 산출 변경 확정';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: 비관리자는 확정 불가';
  end;
end $$;
update budget_versions set status = 'current' where id = :'draft';  -- RLS로 0건
select pg_temp.check((select status from budget_versions where id = :'draft') = 'draft', '비관리자 상태 직접 변경 불가');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select reject_budget_version(:'draft', '근거 자료 첨부 필요');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
update budget_lines set item = '부스' where version_id = :'draft';
select pg_temp.check(true, '반려 후 다시 수정 가능');
select submit_budget_version(:'draft');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select confirm_budget_version(:'draft');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select status from budget_versions where version_no = 1
                        and project_id = '10000000-0000-0000-0000-000000000002') = 'superseded', '확정 후 이전 버전 보존');
select pg_temp.check((select initial_supply = 1500000 and current_supply = 2500000 and spent_supply = 800000
                        and remaining_supply = 1700000
                      from budget_vs_actual where category = '운영비' and item = '부스'),
                     '최초 vs 현재 vs 집행 비교');
select pg_temp.check((select contract_supply = 771000000 and children_budget_supply = 2500000
                        and unallocated_supply = 768500000
                      from budget_rollup where project_id = '10000000-0000-0000-0000-000000000001'),
                     '계약 공급가(수기 분리) 대비 하위 배정·미배정 잔액');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
do $$ begin
  begin
    perform new_budget_draft('10000000-0000-0000-0000-000000000001', '무단 변경');
    raise exception 'FAIL: 권한 없는 변경안 생성';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: 권한 없으면 변경안 생성 불가';
  end;
end $$;
select pg_temp.check((select count(*) from budget_rollup where project_id = '10000000-0000-0000-0000-000000000001') = 0,
                     '권한 없으면 상위 예산 현황 비공개');
reset role;
insert into projects(id, name) values ('10000000-0000-0000-0000-000000000009', '삭제용');
insert into budget_versions(id, project_id, version_no, label) values
  ('20000000-0000-0000-0000-000000000009', '10000000-0000-0000-0000-000000000009', 1, '최초 산출');
insert into budget_lines(project_id, version_id, category, item, taxable) values
  ('10000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000009', '운영비', '부스', 1);
update budget_versions set status = 'current' where id = '20000000-0000-0000-0000-000000000009';
delete from projects where id = '10000000-0000-0000-0000-000000000009';
select pg_temp.check(true, '확정 예산 있는 프로젝트 삭제 시 연쇄 삭제');
do $$ begin
  begin
    delete from projects where id = '10000000-0000-0000-0000-000000000002';
    raise exception 'FAIL: 장부 있는 프로젝트가 삭제됨';
  exception when foreign_key_violation then
    raise notice 'PASS: 장부 있는 프로젝트는 삭제 불가(보관 원칙)';
  end;
end $$;

do $$ begin
  begin
    update projects set contract_vat = 1 where id = '10000000-0000-0000-0000-000000000001';
    raise exception 'FAIL: 계약 분리 합계 불일치 허용';
  exception when check_violation then
    raise notice 'PASS: 과세+영세+부가세 = 계약 총액 검증';
  end;
end $$;

-- 0005: 이슈 해결은 PM만 / 알림 발송함
update projects set pm_id = '00000000-0000-0000-0000-00000000000b' where id = '10000000-0000-0000-0000-000000000001';
update profiles set kakaowork_email = 'b-kw@x' where id = '00000000-0000-0000-0000-00000000000b';
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into issues(project_id, problem, solution) values
  ('10000000-0000-0000-0000-000000000002', '통관 서류 누락', '재발급 요청');
select pg_temp.check((select count(*) from notifications) = 0, '알림은 본인 것만 조회(직원에게 PM 알림 안 보임)');
do $$ begin
  begin
    update issues set status = 'resolved' where problem = '통관 서류 누락';
    raise exception 'FAIL: PM 아닌 직원이 이슈 해결 처리';
  exception when raise_exception then
    if sqlerrm like 'FAIL:%' then raise; end if;
    raise notice 'PASS: PM 아니면 해결 처리 불가';
  end;
end $$;
update issues set status = 'in_progress' where problem = '통관 서류 누락';
select pg_temp.check(true, '직원도 진행 상태 변경은 가능');
do $$ begin
  begin
    perform enqueue_notification('00000000-0000-0000-0000-00000000000b', 'x', 'spam', 'spam', null);
    raise exception 'FAIL: 사용자가 알림 적재 함수 직접 호출';
  exception when insufficient_privilege then
    raise notice 'PASS: 알림 적재 함수 직접 호출 불가';
  end;
end $$;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) from notifications where kind = 'issue_new') = 2,
                     '이슈 보고 → 상위 PM(상속)에게 이메일·카카오워크 알림 적재');
update issues set status = 'resolved', resolution_note = '재발급 완료' where problem = '통관 서류 누락';
select pg_temp.check((select resolved_at is not null from issues where problem = '통관 서류 누락'), 'PM 해결 처리 + 해결 일시 기록');
insert into requests(assignee_id, title, due_date) values ('00000000-0000-0000-0000-00000000000c', '자료 요청', current_date);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check((select count(*) from notifications where kind = 'request_new') = 2, '새 업무요청 → 받는 사람 알림');
update requests set status = 'accepted' where title = '자료 요청';
reset role;
select pg_temp.check((select count(*) from notifications where kind = 'request_status'
                        and user_id = '00000000-0000-0000-0000-00000000000b') = 2, '요청 수락 → 요청자 알림');
update profiles set notify_email = false where id = '00000000-0000-0000-0000-00000000000c';
select pg_temp.check(enqueue_due_reminders(current_date) >= 1, '마감 임박 알림 적재');
select pg_temp.check(enqueue_due_reminders(current_date) >= 1
                     and (select count(*) from notifications where kind = 'due_soon'
                            and user_id = '00000000-0000-0000-0000-00000000000c') = 1,
                     '마감 알림 중복 방지 + 이메일 끔 설정 반영');
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
insert into issues(project_id, problem) values ('10000000-0000-0000-0000-000000000002', '호텔 블록 부족');
select pg_temp.check((select count(*) from my_pm_issues) = 0, 'PM 아니면 내 PM 이슈 목록 비어 있음');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select pg_temp.check((select count(*) from my_pm_issues where problem = '호텔 블록 부족') = 1, 'PM(상속)의 미해결 이슈 목록');
update profiles set notify_kakaowork = false, kakaowork_email = 'new@x' where id = auth.uid();
select pg_temp.check((select not notify_kakaowork from profiles where id = auth.uid()), '본인 알림 설정 변경');
reset role;
