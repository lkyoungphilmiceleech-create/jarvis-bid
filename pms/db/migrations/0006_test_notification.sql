-- 0006: 본인에게 테스트 알림 보내기 (운영 전환 시 이메일·카카오워크 설정 확인용, 설계안 §41)
create or replace function send_test_notification() returns void
language plpgsql security definer set search_path = public as $$
begin
  if not is_active_user() then raise exception '승인된 사용자만 사용할 수 있습니다'; end if;
  perform enqueue_notification(auth.uid(), 'test', '[테스트] MICELEECH PMS 알림',
    '알림 설정이 정상입니다. 이 메시지가 보이면 이 채널로 업무 알림을 받을 수 있습니다.', '/settings');
end $$;
