import { repo } from "../../src/data";
import { requireProfile } from "../../src/data/session";
import { buildTree, type ProjectNode } from "../../src/lib/tree";
import type { ProjectRow } from "../../src/data/types";

export const dynamic = "force-dynamic";

function Node({ node, depth }: { node: ProjectNode<ProjectRow>; depth: number }) {
  const p = node.project;
  return (
    <>
      <div className="row" style={{ paddingLeft: depth * 20 }}>
        <div className="grow">
          <div className="title">{depth > 0 ? "└ " : ""}{p.name}</div>
          <div className="sub">
            {[p.pm_name && `PM ${p.pm_name}`, p.start_date && `${p.start_date} ~ ${p.end_date ?? ""}`].filter(Boolean).join(" · ")}
          </div>
        </div>
      </div>
      {node.children.map((c) => <Node key={c.project.id} node={c} depth={depth + 1} />)}
    </>
  );
}

export default async function Projects() {
  await requireProfile();
  const tree = buildTree(await repo.listProjects());
  return (
    <>
      <h1>프로젝트</h1>
      <section className="card">
        {tree.length === 0 ? <div className="empty">등록된 프로젝트가 없습니다.</div>
          : tree.map((n) => <Node key={n.project.id} node={n} depth={0} />)}
      </section>
    </>
  );
}
