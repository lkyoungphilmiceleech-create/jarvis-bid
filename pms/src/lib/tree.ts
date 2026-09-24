// 상위·하위 프로젝트 트리 구성

export interface ProjectNode<T extends { id: string; parent_id: string | null }> {
  project: T;
  children: ProjectNode<T>[];
}

export function buildTree<T extends { id: string; parent_id: string | null; name: string }>(
  rows: T[],
): ProjectNode<T>[] {
  const nodes = new Map(rows.map((r) => [r.id, { project: r, children: [] as ProjectNode<T>[] }]));
  const roots: ProjectNode<T>[] = [];
  for (const node of nodes.values()) {
    const parent = node.project.parent_id ? nodes.get(node.project.parent_id) : undefined;
    // 상위가 목록에 없으면(권한·보관 등) 최상위로 표시
    (parent ? parent.children : roots).push(node);
  }
  const sort = (list: ProjectNode<T>[]) => {
    list.sort((a, b) => a.project.name.localeCompare(b.project.name, "ko"));
    list.forEach((n) => sort(n.children));
  };
  sort(roots);
  return roots;
}
