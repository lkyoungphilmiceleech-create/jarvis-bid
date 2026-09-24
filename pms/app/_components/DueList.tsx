import { dday, type DueItem } from "../../src/lib/myWork";

const KIND = { task: "업무", milestone: "마감", request: "요청" } as const;

export default function DueList({ items, today, empty }: { items: DueItem[]; today: string; empty: string }) {
  if (items.length === 0) return <div className="empty">{empty}</div>;
  return (
    <div>
      {items.map((it) => {
        const d = it.dueDate ? dday(it.dueDate, today) : null;
        const tone = d?.startsWith("D+") ? "danger" : d === "D-DAY" ? "warn" : "";
        return (
          <div className="row" key={`${it.kind}-${it.id}`}>
            <span className="pill">{KIND[it.kind]}</span>
            <div className="grow">
              <div className="title">{it.title}</div>
              <div className="sub">{[it.projectName, it.dueDate].filter(Boolean).join(" · ")}</div>
            </div>
            {d && <span className={`pill ${tone}`}>{d}</span>}
          </div>
        );
      })}
    </div>
  );
}
