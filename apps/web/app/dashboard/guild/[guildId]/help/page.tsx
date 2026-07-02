import HelpContent from './HelpContent';

// 서버 컴포넌트에서 런타임 env를 읽어 클라이언트로 전달한다.
// NEXT_PUBLIC_* 클라이언트 빌드타임 인라인에 의존하면 운영 빌드(build-arg 미주입)에서 값이 비므로,
// 서버 런타임 주입 방식으로 푸터(getSupportUrl)와 동일하게 처리한다. 미설정 시 버튼은 숨겨진다.
export default function HelpPage() {
  return <HelpContent supportUrl={process.env.NEXT_PUBLIC_DISCORD_SUPPORT_URL ?? null} />;
}
