import { logout } from "../actions";

export default function Pending() {
  return (
    <div className="card" style={{ maxWidth: 420, margin: "40px auto" }}>
      <h1>승인 대기 중</h1>
      <p>가입 신청이 접수되었습니다. 관리자가 승인하면 이용할 수 있습니다.</p>
      <form action={logout}><button className="ghost">로그아웃</button></form>
    </div>
  );
}
