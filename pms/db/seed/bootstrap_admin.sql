-- 최초 관리자 지정 (서버 권한으로 1회 실행)
-- 사용법: 본부장 계정으로 앱에서 먼저 가입한 뒤
--   psql "$DATABASE_URL" -v admin_email='가입한이메일' -f db/seed/bootstrap_admin.sql
\set ON_ERROR_STOP on
update profiles set role = 'admin', active = true where email = :'admin_email';
select case when count(*) = 1 then '최초 관리자 지정 완료'
            else '해당 이메일로 가입된 계정이 없습니다' end as result
from profiles where email = :'admin_email' and role = 'admin';

-- 파일럿(KOCCA 해외마켓) 총괄·하위 3개 마켓 PM = 최초 관리자 (설계안 §32 A29)
update projects set pm_id = (select id from profiles where email = :'admin_email')
 where name = 'KOCCA 해외마켓' or parent_id in (select id from projects where name = 'KOCCA 해외마켓');
