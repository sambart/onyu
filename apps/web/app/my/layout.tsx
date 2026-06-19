/**
 * /my/* 독립 레이아웃.
 * - 운영자 사이드바(DashboardSidebar) 미포함.
 * - 길드 멤버십 가드 미적용 — 일반 멤버 통과.
 * - 인증은 middleware 토큰 체크에 의존.
 * - 공통 Header/Footer 는 root layout 이 렌더링하므로 여기서는 추가하지 않는다.
 */
export default function MyLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
