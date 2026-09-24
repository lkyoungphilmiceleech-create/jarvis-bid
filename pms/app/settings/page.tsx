import { repo } from "../../src/data";
import { requireProfile } from "../../src/data/session";
import { saveNotifySettings } from "../actions";

export const dynamic = "force-dynamic";

export default async function Settings({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const me = await requireProfile();
  const [s, sp] = await Promise.all([repo.getNotifySettings(me.id), searchParams]);
  return (
    <>
      <h1>알림 설정</h1>
      {sp.saved && <div className="notice">저장했습니다.</div>}
      <form action={saveNotifySettings} className="card stack">
        <p className="sub">새 업무요청, 요청 처리 결과, 이슈 보고(PM), 마감 D-1·D-DAY를 알려 드립니다.</p>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="checkbox" name="notifyEmail" defaultChecked={s.notifyEmail} style={{ width: "auto" }} />
          이메일 ({me.email})
        </label>
        <label style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <input type="checkbox" name="notifyKakaowork" defaultChecked={s.notifyKakaowork} style={{ width: "auto" }} />
          카카오워크
        </label>
        <label>카카오워크 계정 이메일 (로그인 이메일과 다를 때만)
          <input name="kakaoworkEmail" type="email" defaultValue={s.kakaoworkEmail ?? ""} placeholder={me.email} />
        </label>
        <button>저장</button>
      </form>
    </>
  );
}
