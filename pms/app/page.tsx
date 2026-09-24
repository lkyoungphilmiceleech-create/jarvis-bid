import { redirect } from "next/navigation";
import { repo } from "../src/data";
import { landingPath } from "../src/lib/landing";

export const dynamic = "force-dynamic";

export default async function Home() {
  redirect(landingPath(await repo.currentProfile()));
}
