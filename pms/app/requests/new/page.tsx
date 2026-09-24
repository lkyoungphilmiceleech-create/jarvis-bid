import { repo } from "../../../src/data";
import { requireProfile } from "../../../src/data/session";
import { createRequest } from "../../actions";

export default async function NewRequest() {
  const me = await requireProfile();
  const [projects, people] = await Promise.all([repo.listProjects(), repo.listProfiles()]);
  return (
    <>
      <h1>업무요청</h1>
      <form action={createRequest} className="card stack">
        <label>받는 사람
          <select name="assigneeId" required defaultValue="">
            <option value="" disabled>선택</option>
            {people.filter((p) => p.id !== me.id).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>제목<input name="title" required placeholder="요청 내용 한 줄" /></label>
        <label>프로젝트
          <select name="projectId" defaultValue="">
            <option value="">(선택 안 함)</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label>기한<input name="dueDate" type="date" /></label>
        <label>상세<textarea name="body" placeholder="필요한 자료, 배경 등 (선택)" /></label>
        <button>요청 보내기</button>
      </form>
    </>
  );
}
