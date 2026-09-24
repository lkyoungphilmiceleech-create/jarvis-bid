import { repo } from "../../src/data";
import { requireProfile } from "../../src/data/session";
import { executionRate } from "../../src/lib/money";
import { localToday } from "../../src/lib/myWork";
import DueList from "../_components/DueList";

export const dynamic = "force-dynamic";

const won = (n: number) => `${Math.round(n / 10_000).toLocaleString("ko-KR")}만`;

export default async function Dashboard() {
  await requireProfile({ adminOnly: true });
  const today = localToday();
  const d = await repo.dashboard(today);

  return (
    <>
      <h1>경영 대시보드</h1>
      <div className="grid two">
        <section className="card">
          <h2>① 프로젝트별 공정률</h2>
          {d.projects.map((p) => (
            <div className="row" key={p.id}>
              <div className="grow">
                <div className="title">{p.parentName ? `└ ${p.name}` : p.name}</div>
                <div className="bar"><span style={{ width: `${Math.min(p.progressPct ?? 0, 100)}%` }} /></div>
              </div>
              <span className="num">{p.progressPct == null ? "—" : `${p.progressPct}%`}</span>
            </div>
          ))}
        </section>

        <section className="card">
          <h2>② 문제점·해결안 <span className="pill danger">{d.openIssues.length}</span></h2>
          {d.openIssues.length === 0 ? <div className="empty">미해결 이슈가 없습니다.</div> : d.openIssues.map((i) => (
            <div className="row" key={i.id}>
              <div className="grow">
                <div className="title">{i.problem}</div>
                <div className="sub">{i.projectName}{i.ownerName ? ` · ${i.ownerName}` : ""}</div>
                {i.solution && <div className="sub">→ {i.solution}</div>}
              </div>
              <span className={`pill ${i.status === "open" ? "danger" : "warn"}`}>{i.status === "open" ? "미착수" : "조치 중"}</span>
            </div>
          ))}
        </section>

        <section className="card">
          <h2>③ 주요 마감·일정 (14일)</h2>
          <DueList items={d.upcoming} today={today} empty="14일 안에 마감이 없습니다." />
        </section>

        <section className="card">
          <h2>④ 예산 집행 (공급가 기준)</h2>
          <div className="scroll">
            <table>
              <thead><tr><th>프로젝트</th><th>산출</th><th>집행</th><th>집행률</th></tr></thead>
              <tbody>
                {d.projects.filter((p) => p.budget && p.budget.budgetSupply > 0).map((p) => {
                  const rate = executionRate(p.budget!.spentSupply, p.budget!.budgetSupply);
                  return (
                    <tr key={p.id}>
                      <td>{p.name}</td>
                      <td className="num">{won(p.budget!.budgetSupply)}</td>
                      <td className="num">{won(p.budget!.spentSupply)}</td>
                      <td className="num">
                        <div className={`bar${rate != null && rate > (p.progressPct ?? 0) + 15 ? " over" : ""}`}>
                          <span style={{ width: `${Math.min(rate ?? 0, 100)}%` }} />
                        </div>
                        {rate ?? "—"}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="sub">수익금액·수익률은 회사 계산식 확정 후 표시합니다. 막대가 빨간색이면 집행률이 공정률보다 15%p 이상 앞선 경우입니다.</p>
        </section>

        <section className="card">
          <h2>⑤ 인력 배치</h2>
          {d.staffing.map((s) => (
            <div className="row" key={s.personName}>
              <div className="grow">
                <div className="title">{s.personName}</div>
                <div className="sub">
                  {s.projects.length === 0 ? "배정 없음" : s.projects.map((p) => `${p.name}${p.role ? `(${p.role})` : ""}`).join(", ")}
                </div>
              </div>
              <span className="pill">{s.projects.length}건</span>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
