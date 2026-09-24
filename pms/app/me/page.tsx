import Link from "next/link";
import { repo } from "../../src/data";
import { requireProfile } from "../../src/data/session";
import { groupDueItems, localToday } from "../../src/lib/myWork";
import type { RequestRow } from "../../src/data/types";
import DueList from "../_components/DueList";
import { resolveIssue, setRequestStatus } from "../actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL = { requested: "요청됨", accepted: "진행 중", rejected: "반려", done: "완료" } as const;

function RequestItem({ r, received }: { r: RequestRow; received: boolean }) {
  return (
    <div className="row">
      <div className="grow">
        <div className="title">{r.title}</div>
        <div className="sub">
          {[received ? `${r.requesterName} → 나` : `나 → ${r.assigneeName}`, r.projectName, r.dueDate && `기한 ${r.dueDate}`]
            .filter(Boolean).join(" · ")}
        </div>
      </div>
      {received && r.status === "requested" ? (
        <form action={setRequestStatus} className="actions">
          <input type="hidden" name="id" value={r.id} />
          <button className="small" name="status" value="accepted">수락</button>
          <button className="small ghost" name="status" value="rejected">반려</button>
        </form>
      ) : received && r.status === "accepted" ? (
        <form action={setRequestStatus}>
          <input type="hidden" name="id" value={r.id} />
          <button className="small" name="status" value="done">완료</button>
        </form>
      ) : (
        <span className={`pill ${r.status === "done" ? "ok" : r.status === "rejected" ? "danger" : ""}`}>
          {STATUS_LABEL[r.status]}
        </span>
      )}
    </div>
  );
}

export default async function MyWork({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const me = await requireProfile();
  const today = localToday();
  const [due, reqs, pmIssues, sp] = await Promise.all([
    repo.myDueItems(me.id), repo.myRequests(me.id), repo.myPmIssues(me.id), searchParams,
  ]);
  const g = groupDueItems(due, today);
  const openReceived = reqs.received.filter((r) => r.status === "requested" || r.status === "accepted");

  return (
    <>
      <h1>{me.name}님의 오늘</h1>
      {sp.done === "issue" && <div className="notice">이슈를 보고했습니다.</div>}
      {sp.done === "request" && <div className="notice">업무요청을 보냈습니다.</div>}

      <section className="card">
        <h2>오늘 일정·마감 {g.overdue.length > 0 && <span className="pill danger">지연 {g.overdue.length}</span>}</h2>
        <DueList items={[...g.overdue, ...g.today]} today={today} empty="오늘 마감인 일이 없습니다." />
      </section>

      <section className="card">
        <h2>업무요청 <span className="pill">{openReceived.length}</span></h2>
        {reqs.received.length === 0 && reqs.sent.length === 0 && <div className="empty">주고받은 요청이 없습니다.</div>}
        {reqs.received.map((r) => <RequestItem key={r.id} r={r} received />)}
        {reqs.sent.map((r) => <RequestItem key={r.id} r={r} received={false} />)}
      </section>

      {pmIssues.length > 0 && (
        <section className="card">
          <h2>내 프로젝트 이슈 (PM) <span className="pill danger">{pmIssues.length}</span></h2>
          {pmIssues.map((i) => (
            <div className="row" key={i.id} style={{ alignItems: "flex-start", flexWrap: "wrap" }}>
              <div className="grow" style={{ minWidth: 200 }}>
                <div className="title">{i.problem}</div>
                <div className="sub">{[i.projectName, i.reporterName && `보고 ${i.reporterName}`].filter(Boolean).join(" · ")}</div>
                {i.solution && <div className="sub">→ {i.solution}</div>}
              </div>
              <form action={resolveIssue} className="actions" style={{ width: "100%" }}>
                <input type="hidden" name="id" value={i.id} />
                <input name="note" placeholder="해결 내용 (선택)" style={{ flex: 1, minWidth: 140 }} />
                <button className="small">해결 처리</button>
              </form>
            </div>
          ))}
        </section>
      )}

      <section className="card">
        <h2>이번 주</h2>
        <DueList items={g.week} today={today} empty="7일 안에 마감인 일이 없습니다." />
      </section>

      <div className="fab">
        <Link className="btn ghost" href="/requests/new">+ 업무요청</Link>
        <Link className="btn" href="/issues/new">! 이슈 보고</Link>
      </div>
    </>
  );
}
