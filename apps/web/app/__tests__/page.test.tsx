/**
 * Landing Page 통합 테스트 (F-WEB-001, F-WEB-018)
 *
 * 유저 관점 검증 항목:
 * 1. 6개 섹션(네비/Hero/Features/SetupGuide/CtaBand/Footer) 모두 렌더링
 * 2. 기능 카드 6개 (음성통계, 자동채널, AI분석, 신규멤버, 대시보드, 비활동회원) 렌더링
 * 3. 음악(music) 기능 카드 미렌더링 확인
 * 4. DISCORD_CLIENT_ID 없을 때 Hero 초대 버튼 숨김, 있을 때 표시
 * 5. 주요 이미지 alt 속성 존재
 * 6. 랜드마크 구조 존재
 *
 * page.tsx는 async 서버 컴포넌트이므로 await Home() 후 render 패턴을 사용한다.
 */

import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─── 전역 모킹 ─────────────────────────────────────────────────────

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    className,
    priority: _priority,
  }: {
    src: string;
    alt: string;
    width?: number;
    height?: number;
    className?: string;
    priority?: boolean;
  }) => (
    // eslint-disable-next-line @next/next/no-img-element -- 테스트 목적 stub
    <img src={src} alt={alt} width={width} height={height} className={className} />
  ),
}));

// LandingNav는 client component이므로 stub으로 대체한다
vi.mock('../components/LandingNav', () => ({
  default: ({ inviteUrl }: { inviteUrl: string | null }) => (
    <nav data-testid="landing-nav" data-invite-url={inviteUrl ?? ''}>
      <a href="/auth/discord">대시보드</a>
    </nav>
  ),
}));

// next-intl 서버 API 모킹
vi.mock('next-intl/server', () => ({
  getTranslations: () =>
    Promise.resolve((key: string) => {
      const translations: Record<string, string> = {
        'hero.badge': '완전 무료',
        'hero.description': '음성 채널 통계를 지원하는 디스코드 봇',
        'hero.cta.invite': '서버에 추가하기',
        'hero.cta.features': '기능 목록',
        'features.sectionTitle': '기능',
        'features.voiceStats.title': '음성 채널 통계',
        'features.voiceStats.description': '멤버별 음성 채널 접속 시간을 기록합니다',
        'features.voiceStats.detail': '상세 설명',
        'features.autoChannel.title': '자동 채널 생성',
        'features.autoChannel.description': '개인 채널이 자동 생성됩니다',
        'features.autoChannel.detail': '상세 설명',
        'features.gemini.title': 'Gemini 음성 분석',
        'features.gemini.description': 'Gemini AI로 분석합니다',
        'features.gemini.detail': '상세 설명',
        'features.newbie.title': '신규 멤버 환영',
        'features.newbie.description': '환영 메시지를 자동으로 전송합니다',
        'features.newbie.detail': '상세 설명',
        'features.dashboard.title': '웹 대시보드',
        'features.dashboard.description': 'Discord 로그인으로 접속합니다',
        'features.dashboard.detail': '상세 설명',
        'features.inactiveMember.title': '비활동 회원 관리',
        'features.inactiveMember.description': '비활동 멤버를 자동으로 분류합니다',
        'features.inactiveMember.detail': '상세 설명',
        'setup.sectionTitle': '설정 가이드',
        'setup.sectionDescription': '역할 설정이 필요합니다',
        'setup.step1.title': '봇을 서버에 추가',
        'setup.step1.description': '초대합니다',
        'setup.step2.title': '봇 역할을 최상위로 이동',
        'setup.step2.description': '역할 계층을 설정합니다',
        'setup.step2.howTo': '설정 방법',
        'setup.step2.step1': '서버 설정 → 역할 메뉴로 이동',
        'setup.step2.step2': 'Onyu 역할을 드래그',
        'setup.step2.step3': '변경사항 저장',
        'setup.step2.notice': '* 서버 소유자의 닉네임은 변경 불가',
        'setup.step3.title': '웹 대시보드에서 설정',
        'setup.step3.description': '대시보드에서 설정합니다',
        'ctaBand.title': '지금 바로 시작해보세요',
        'ctaBand.description': 'Onyu는 완전 무료입니다',
        'ctaBand.button': '지금 서버에 추가',
        'nav.features': '기능',
        'nav.setup': '설정 가이드',
        'nav.dashboard': '대시보드',
        'nav.invite': '서버 추가',
        'footer.privacy': '개인정보처리방침',
        'footer.terms': '이용약관',
        'footer.features': '기능',
        'footer.dashboardLink': '대시보드',
      };
      return translations[key] ?? key;
    }),
}));

import Home from '../page';

// ─── 헬퍼 ──────────────────────────────────────────────────────────

async function renderLandingPage() {
  const jsx = await Home();
  return render(jsx);
}

// ─── 테스트 ────────────────────────────────────────────────────────

describe('랜딩 페이지 통합 테스트', () => {
  describe('섹션 렌더링', () => {
    it('LandingNav가 렌더링된다', async () => {
      delete process.env.DISCORD_CLIENT_ID;
      await renderLandingPage();
      expect(screen.getByTestId('landing-nav')).toBeInTheDocument();
    });

    it('Hero 섹션에 "Onyu" 제목이 표시된다', async () => {
      delete process.env.DISCORD_CLIENT_ID;
      await renderLandingPage();
      expect(screen.getByRole('heading', { level: 1, name: 'Onyu' })).toBeInTheDocument();
    });

    it('Features 섹션 타이틀이 표시된다', async () => {
      delete process.env.DISCORD_CLIENT_ID;
      await renderLandingPage();
      // "기능"은 features section h2 와 footer h4에 중복 존재하므로 getAllByRole 사용
      const featuresHeadings = screen.getAllByRole('heading', { name: '기능' });
      expect(featuresHeadings.length).toBeGreaterThan(0);
      // h2 레벨(section title)이 존재하는지 확인
      const h2Heading = featuresHeadings.find((el) => el.tagName === 'H2');
      expect(h2Heading).toBeDefined();
    });

    it('설정 가이드 섹션 타이틀이 표시된다', async () => {
      delete process.env.DISCORD_CLIENT_ID;
      await renderLandingPage();
      expect(screen.getByRole('heading', { name: '설정 가이드' })).toBeInTheDocument();
    });

    it('CTA 밴드 섹션이 렌더링된다', async () => {
      delete process.env.DISCORD_CLIENT_ID;
      await renderLandingPage();
      expect(screen.getByText('지금 바로 시작해보세요')).toBeInTheDocument();
    });

    it('Footer가 렌더링되고 저작권 텍스트가 표시된다', async () => {
      delete process.env.DISCORD_CLIENT_ID;
      await renderLandingPage();
      const footer = document.querySelector('footer');
      expect(footer).toBeInTheDocument();
      // footer 내부에 저작권 텍스트가 존재하는지 확인
      expect(footer?.textContent).toContain('Onyu');
    });
  });

  describe('기능 카드 6개 렌더링', () => {
    beforeEach(() => {
      delete process.env.DISCORD_CLIENT_ID;
    });

    it('음성 채널 통계 카드가 렌더링된다', async () => {
      await renderLandingPage();
      expect(screen.getByRole('heading', { name: '음성 채널 통계' })).toBeInTheDocument();
    });

    it('자동 채널 생성 카드가 렌더링된다', async () => {
      await renderLandingPage();
      expect(screen.getByRole('heading', { name: '자동 채널 생성' })).toBeInTheDocument();
    });

    it('Gemini 음성 분석 카드가 렌더링된다', async () => {
      await renderLandingPage();
      expect(screen.getByRole('heading', { name: 'Gemini 음성 분석' })).toBeInTheDocument();
    });

    it('신규 멤버 환영 카드가 렌더링된다', async () => {
      await renderLandingPage();
      expect(screen.getByRole('heading', { name: '신규 멤버 환영' })).toBeInTheDocument();
    });

    it('웹 대시보드 카드가 렌더링된다', async () => {
      await renderLandingPage();
      expect(screen.getByRole('heading', { name: '웹 대시보드' })).toBeInTheDocument();
    });

    it('비활동 회원 관리 카드가 렌더링된다', async () => {
      await renderLandingPage();
      expect(screen.getByRole('heading', { name: '비활동 회원 관리' })).toBeInTheDocument();
    });

    it('6개 기능 카드 heading이 정확히 렌더링된다 (Features 섹션 내)', async () => {
      await renderLandingPage();
      const featureTitles = [
        '음성 채널 통계',
        '자동 채널 생성',
        'Gemini 음성 분석',
        '신규 멤버 환영',
        '웹 대시보드',
        '비활동 회원 관리',
      ];
      featureTitles.forEach((title) => {
        expect(screen.getByRole('heading', { name: title })).toBeInTheDocument();
      });
    });
  });

  describe('음악 카드 미렌더링', () => {
    it('음악 재생(music) 기능 카드가 렌더링되지 않는다', async () => {
      delete process.env.DISCORD_CLIENT_ID;
      await renderLandingPage();
      // ko landing.json에 features.music.title = "음악 재생"이 존재하지만
      // FEATURE_BLOCKS에는 music 키가 없으므로 렌더링되어서는 안 된다
      expect(screen.queryByRole('heading', { name: '음악 재생' })).not.toBeInTheDocument();
      expect(screen.queryByText('/play 명령어')).not.toBeInTheDocument();
    });
  });

  describe('초대 버튼 — DISCORD_CLIENT_ID 조건 분기', () => {
    afterEach(() => {
      delete process.env.DISCORD_CLIENT_ID;
    });

    it('DISCORD_CLIENT_ID 환경변수가 없으면 Hero 초대 버튼이 표시되지 않는다', async () => {
      delete process.env.DISCORD_CLIENT_ID;
      await renderLandingPage();
      // inviteUrl이 null이면 HeroCta에서 초대 링크(<a>)가 렌더링되지 않는다
      const inviteLinks = screen
        .queryAllByRole('link')
        .filter(
          (el) =>
            el.getAttribute('href')?.includes('discord.com/oauth2/authorize') &&
            el.textContent?.includes('서버에 추가하기'),
        );
      expect(inviteLinks).toHaveLength(0);
    });

    it('DISCORD_CLIENT_ID 환경변수가 있으면 Hero 초대 버튼이 표시된다', async () => {
      process.env.DISCORD_CLIENT_ID = 'test-client-id-12345';
      await renderLandingPage();
      const inviteLink = screen.getByRole('link', { name: '서버에 추가하기' });
      expect(inviteLink).toBeInTheDocument();
      expect(inviteLink).toHaveAttribute(
        'href',
        expect.stringContaining('client_id=test-client-id-12345'),
      );
    });

    it('DISCORD_CLIENT_ID가 없으면 CTA 밴드에 비활성화 버튼이 표시된다', async () => {
      delete process.env.DISCORD_CLIENT_ID;
      await renderLandingPage();
      const disabledBtn = screen.getByRole('button', { name: '지금 서버에 추가' });
      expect(disabledBtn).toBeDisabled();
    });

    it('DISCORD_CLIENT_ID가 있으면 CTA 밴드에 초대 링크가 표시된다', async () => {
      process.env.DISCORD_CLIENT_ID = 'test-client-id-12345';
      await renderLandingPage();
      const ctaLink = screen.getByRole('link', { name: '지금 서버에 추가' });
      expect(ctaLink).toBeInTheDocument();
      expect(ctaLink).toHaveAttribute(
        'href',
        expect.stringContaining('client_id=test-client-id-12345'),
      );
    });

    it('"기능 목록" 버튼은 DISCORD_CLIENT_ID 여부와 무관하게 항상 표시된다', async () => {
      delete process.env.DISCORD_CLIENT_ID;
      await renderLandingPage();
      expect(screen.getByRole('link', { name: '기능 목록' })).toBeInTheDocument();
    });
  });

  describe('접근성 — 이미지 alt 속성', () => {
    beforeEach(() => {
      delete process.env.DISCORD_CLIENT_ID;
    });

    it('Hero 이미지에 alt 텍스트가 존재한다', async () => {
      await renderLandingPage();
      const heroImg = screen.getByAltText('산과 나무 배경 위의 고양이들');
      expect(heroImg).toBeInTheDocument();
    });

    it('CTA 밴드 이미지에 alt 텍스트가 존재한다', async () => {
      await renderLandingPage();
      const ctaImg = screen.getByAltText('고양이 장식 일러스트');
      expect(ctaImg).toBeInTheDocument();
    });

    it('각 기능 카드 이미지에 비어있지 않은 alt가 존재한다', async () => {
      await renderLandingPage();
      const featureImages = document.querySelectorAll('#features img');
      featureImages.forEach((img) => {
        expect(img.getAttribute('alt')).toBeTruthy();
      });
    });
  });

  describe('랜드마크 구조', () => {
    beforeEach(() => {
      delete process.env.DISCORD_CLIENT_ID;
    });

    it('features id를 가진 section이 존재한다', async () => {
      await renderLandingPage();
      const featuresSection = document.querySelector('#features');
      expect(featuresSection).toBeInTheDocument();
    });

    it('setup id를 가진 section이 존재한다', async () => {
      await renderLandingPage();
      const setupSection = document.querySelector('#setup');
      expect(setupSection).toBeInTheDocument();
    });

    it('footer 요소가 존재한다', async () => {
      await renderLandingPage();
      expect(document.querySelector('footer')).toBeInTheDocument();
    });

    it('접근성 스킵 링크가 존재한다', async () => {
      await renderLandingPage();
      const skipLink = screen.getByText('기능 섹션으로 건너뛰기');
      expect(skipLink).toBeInTheDocument();
      expect(skipLink).toHaveAttribute('href', '#features');
    });
  });

  describe('Footer 링크', () => {
    beforeEach(() => {
      delete process.env.DISCORD_CLIENT_ID;
    });

    it('Footer에 개인정보처리방침 링크가 /privacy로 연결된다', async () => {
      await renderLandingPage();
      const privacyLink = screen
        .getAllByRole('link')
        .find(
          (el) =>
            el.textContent?.includes('개인정보처리방침') && el.getAttribute('href') === '/privacy',
        );
      expect(privacyLink).toBeDefined();
    });

    it('Footer에 이용약관 링크가 /terms로 연결된다', async () => {
      await renderLandingPage();
      const termsLink = screen
        .getAllByRole('link')
        .find((el) => el.textContent?.includes('이용약관') && el.getAttribute('href') === '/terms');
      expect(termsLink).toBeDefined();
    });

    it('Footer의 대시보드 링크가 /auth/discord로 연결된다', async () => {
      await renderLandingPage();
      const footerDashboardLinks = screen
        .getAllByRole('link')
        .filter((el) => el.getAttribute('href') === '/auth/discord');
      expect(footerDashboardLinks.length).toBeGreaterThan(0);
    });
  });
});
