-- 0002: 개인 회원가입(관리자 승인), 외화 송금·수수료, 법인카드 공용 시트 매핑 (설계안 v0.5 §26~28)

-- ── 개인 등록 → 관리자 승인 ───────────────────────────────────
-- 가입 시 비활성 프로필 자동 생성, 관리자가 active=true 로 승인해야 사용 가능
alter table profiles alter column active set default false;

create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles(id, name, email, active)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
          new.email,
          false)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- 본인은 이름만 수정, 승인·역할 변경은 관리자만
create or replace function guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not is_admin()
     and (new.active is distinct from old.active or new.role is distinct from old.role
          or new.email is distinct from old.email) then
    raise exception '승인·역할 변경은 관리자만 할 수 있습니다';
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles
  for each row execute function guard_profile_update();

-- ── 외화 송금 (영세) ─────────────────────────────────────────
-- zero_rated(영세, 원화) = foreign_amount × fx_rate / fx_rate_unit 반올림 (앱 money.ts 에서 계산)
-- 실제 원화 출금액이 다르면 zero_rated 를 통장 출금액으로 수정하고 차액은 비고에 남긴다.
alter table ledger_entries rename column original_amount to foreign_amount;
alter table ledger_entries
  add column fx_rate_unit  int  not null default 1 check (fx_rate_unit in (1, 100)),
  add column fx_rate_date  date,                 -- 송금일 기준 환율 일자
  add column fx_rate_basis text,                 -- 전신환매도율 / 매매기준율 등
  add column fees          jsonb not null default '[]',  -- [{label, krw}] 송금수수료·전신료·중계은행수수료
  add column fee_total     bigint not null default 0,
  add constraint ledger_fx_complete check (
    currency = 'KRW' or (foreign_amount is not null and fx_rate is not null and fx_rate_date is not null)
  );

-- ── 법인카드 공용 시트: 탭(카드 소지자) ↔ 직원 매핑 ───────────
create table card_sheet_tabs (
  spreadsheet_id  text not null,
  tab_name        text not null,
  holder_id       uuid not null references profiles(id),
  primary key (spreadsheet_id, tab_name)
);

-- 시트 '프로젝트' 칸의 표기 → PMS 프로젝트 (표기가 달라도 같은 프로젝트로 인식)
create table project_aliases (
  alias       text primary key,
  project_id  uuid not null references projects(id) on delete cascade
);

alter table card_sheet_tabs enable row level security;
alter table project_aliases enable row level security;
create policy card_tabs_read  on card_sheet_tabs for select using (is_active_user());
create policy card_tabs_admin on card_sheet_tabs for all using (is_admin()) with check (is_admin());
create policy alias_read  on project_aliases for select using (is_active_user());
create policy alias_write on project_aliases for all using (is_active_user()) with check (is_active_user());
