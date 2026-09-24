import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { isLive, repo } from "../src/data";
import { logout } from "./actions";

export const metadata: Metadata = {
  title: "MICELEECH PMS",
  description: "공공기관 입찰용역 프로젝트 관리",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "MICELEECH PMS" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2456d6" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const profile = await repo.currentProfile();
  const signedIn = profile?.active;
  return (
    <html lang="ko">
      <body>
        {!isLive && <div className="demo">체험 모드 — 예시 데이터이며 저장 내용은 서버 재시작 시 사라집니다</div>}
        {signedIn && (
          <header className="topbar">
            <div className="inner">
              <Link href="/" className="brand">MICELEECH PMS</Link>
              <nav className="nav">
                {profile.role === "admin" && <Link href="/dashboard">대시보드</Link>}
                <Link href="/me">내 업무</Link>
                <Link href="/projects">프로젝트</Link>
              </nav>
              <form action={logout}><button className="small ghost">로그아웃</button></form>
            </div>
          </header>
        )}
        <main>{children}</main>
      </body>
    </html>
  );
}
