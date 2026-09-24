import { repo } from "../../../src/data";
import { requireProfile } from "../../../src/data/session";
import { createIssue } from "../../actions";

export default async function NewIssue() {
  await requireProfile();
  const projects = await repo.listProjects();
  return (
    <>
      <h1>이슈 보고</h1>
      <form action={createIssue} className="card stack">
        <label>프로젝트
          <select name="projectId" required defaultValue="">
            <option value="" disabled>선택</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>문제점<textarea name="problem" required placeholder="무슨 일이 생겼나요?" /></label>
        <label>영향<input name="impact" placeholder="일정·예산·품질에 미치는 영향 (선택)" /></label>
        <label>해결안<textarea name="solution" placeholder="제안하는 해결 방법 (선택)" /></label>
        <button>보고하기</button>
      </form>
    </>
  );
}
