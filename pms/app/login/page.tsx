import { isLive } from "../../src/data";
import { demoLogin } from "../actions";
import LiveLogin from "./LiveLogin";

export default function LoginPage() {
  return (
    <div style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>MICELEECH PMS</h1>
      {isLive ? (
        <LiveLogin />
      ) : (
        <div className="card">
          <h2>체험 모드로 둘러보기</h2>
          <form action={demoLogin} className="stack">
            <button name="user" value="u-admin">관리자(본부장)로 보기 → 대시보드</button>
            <button name="user" value="u-kim" className="ghost">직원으로 보기 → 내 업무</button>
          </form>
        </div>
      )}
    </div>
  );
}
