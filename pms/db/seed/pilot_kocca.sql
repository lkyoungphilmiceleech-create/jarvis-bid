-- 파일럿: KOCCA 해외마켓 (설계안 §25 A19, §31)
-- 하위 산출내역은 앱에서 '최초 산출' 버전으로 입력 → 변경 시 '변경안'으로 관리
\set ON_ERROR_STOP on
with parent as (
  insert into projects(name, client_org, status, contract_amount, custom)
  values ('KOCCA 해외마켓', '한국콘텐츠진흥원', 'active', 841000000,
          '{"contract_amount_vat_included": null, "pilot": true}')
  returning id
)
insert into projects(parent_id, name, status)
select parent.id, m.name, 'active'
from parent, (values ('VivaTech'), ('Ai4'), ('SWITCH')) as m(name);

insert into project_aliases(alias, project_id)
select a.alias, p.id from projects p
join (values ('kocca해외마켓', 'KOCCA 해외마켓'), ('해외마켓', 'KOCCA 해외마켓'),
             ('vivatech', 'VivaTech'), ('비바텍', 'VivaTech'),
             ('ai4', 'Ai4'), ('switch', 'SWITCH'), ('스위치', 'SWITCH')) as a(alias, name)
  on a.name = p.name
on conflict (alias) do nothing;
