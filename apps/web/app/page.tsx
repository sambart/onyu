import type { LucideIcon } from 'lucide-react';
import { LayoutDashboard, Mic, Moon, Shield, Sparkles, TrendingUp, UserPlus } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import LandingNav from './components/LandingNav';

const BOT_PERMISSIONS = 411108370;
const FOOTER_LOGO_SIZE = 40;

// Hero 마스코트 크기 — 모바일 기준 / PC에서 더 크게 표시
const HERO_MASCOT_SIZE = 220;

// cat-group 배너 표시 크기
const CAT_GROUP_HEIGHT = 320;

// CTA 고양이 크기
const CTA_CAT_SIZE = 160;

// Setup 안내냥 크기
const SETUP_CAT_SIZE = 120;

// 기능 카드 내 일러스트 크기
const FEATURE_ILLUST_SIZE = 100;

function getInviteUrl(): string | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return null;
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${BOT_PERMISSIONS}&scope=bot+applications.commands`;
}

// 디스코드 공개 문의 채널 초대 URL — 미설정 시 푸터 문의 링크를 숨긴다
function getSupportUrl(): string | null {
  return process.env.NEXT_PUBLIC_DISCORD_SUPPORT_URL ?? null;
}

// Tailwind JIT 동적 클래스 safelist 회피 — accent 별 사전 정의 매핑
const ACCENT_CLASSES: Record<string, { bg: string; text: string; iconBg: string }> = {
  indigo: { bg: 'bg-indigo-50', text: 'text-indigo-600', iconBg: 'bg-indigo-100' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600', iconBg: 'bg-purple-100' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', iconBg: 'bg-blue-100' },
  green: { bg: 'bg-green-50', text: 'text-green-600', iconBg: 'bg-green-100' },
  yellow: { bg: 'bg-yellow-50', text: 'text-yellow-600', iconBg: 'bg-yellow-100' },
  pink: { bg: 'bg-pink-50', text: 'text-pink-600', iconBg: 'bg-pink-100' },
};

interface FeatureBlock {
  key: 'voiceStats' | 'autoChannel' | 'gemini' | 'newbie' | 'dashboard' | 'inactiveMember';
  icon: LucideIcon;
  illustration: string | null;
  accent: string;
}

const FEATURE_BLOCKS = [
  { key: 'voiceStats', icon: TrendingUp, accent: 'indigo', illustration: null },
  { key: 'autoChannel', icon: Mic, accent: 'blue', illustration: null },
  { key: 'gemini', icon: Sparkles, accent: 'purple', illustration: null },
  { key: 'newbie', icon: UserPlus, accent: 'green', illustration: '/landing/cat-flag.png' },
  { key: 'dashboard', icon: LayoutDashboard, accent: 'yellow', illustration: null },
  { key: 'inactiveMember', icon: Moon, accent: 'pink', illustration: '/landing/cat-sleeping.png' },
] satisfies ReadonlyArray<FeatureBlock>;

const FOOTER_FEATURE_KEYS: Array<FeatureBlock['key']> = [
  'voiceStats',
  'autoChannel',
  'gemini',
  'newbie',
  'dashboard',
  'inactiveMember',
];

function HeroCta({
  t,
  inviteUrl,
  supportUrl,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
  inviteUrl: string | null;
  supportUrl: string | null;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
      {inviteUrl ? (
        <a
          href={inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-8 py-4 bg-indigo-600 text-white rounded-full hover:brightness-110 hover:scale-[1.02] active:scale-95 transition font-semibold text-lg focus-visible:ring-2 focus-visible:ring-indigo-600 focus-visible:ring-offset-2"
        >
          {t('hero.cta.invite')}
        </a>
      ) : null}
      {supportUrl ? (
        <a
          href={supportUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-8 py-4 bg-[#5865F2] text-white rounded-full hover:brightness-110 hover:scale-[1.02] active:scale-95 transition font-semibold text-lg focus-visible:ring-2 focus-visible:ring-[#5865F2] focus-visible:ring-offset-2"
        >
          {t('hero.cta.discord')}
        </a>
      ) : null}
      <a
        href="#features"
        className={`px-8 py-4 rounded-full font-semibold text-lg transition focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
          inviteUrl
            ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
            : 'bg-indigo-600 text-white hover:brightness-110'
        }`}
      >
        {t('hero.cta.features')}
      </a>
    </div>
  );
}

function HeroSection({
  t,
  inviteUrl,
  supportUrl,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
  inviteUrl: string | null;
  supportUrl: string | null;
}) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-0">
      <div className="grid md:grid-cols-2 gap-12 items-center">
        {/* 텍스트 컬럼 */}
        <div className="text-center md:text-left">
          {/* 비-무료 후킹 배지 */}
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-amber-100 text-amber-700 text-sm font-semibold mb-5">
            ✦ {t('hero.badge')} ✦
          </span>

          {/* 가치제안 h1 — 브랜드명 아닌 가치 제안 텍스트 */}
          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight tracking-tight text-gray-900 mb-5">
            {t('hero.headline')}
          </h1>

          <p className="text-base md:text-lg text-gray-600 mb-8 leading-relaxed">
            {t('hero.description')}
          </p>

          <HeroCta t={t} inviteUrl={inviteUrl} supportUrl={supportUrl} />
        </div>

        {/* 마스코트 컬럼 */}
        <div className="flex justify-center md:justify-end">
          <Image
            src="/brand/img_onyu_cat.png"
            alt="Onyu 마스코트 고양이"
            width={HERO_MASCOT_SIZE}
            height={HERO_MASCOT_SIZE}
            priority
            unoptimized
            className="animate-[float_4s_ease-in-out_infinite] motion-reduce:animate-none drop-shadow-2xl"
          />
        </div>
      </div>

      {/* Hero 하단 배너 — cat-group (누끼 처리된 투명 PNG, 라이트 배경 위에 직접 노출) */}
      <div className="mt-12 flex justify-center">
        <Image
          src="/landing/cat-group.png"
          alt="음성 채널에 모인 고양이들"
          width={1280}
          height={CAT_GROUP_HEIGHT}
          unoptimized
          className="w-full max-w-3xl h-auto"
        />
      </div>
    </section>
  );
}

function FeatureCard({
  block,
  t,
}: {
  block: FeatureBlock;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const accent = ACCENT_CLASSES[block.accent] ?? ACCENT_CLASSES.indigo;
  // lucide 컴포넌트는 대문자 변수로 받아 JSX로 렌더 (타입 안전)
  const IconComponent = block.icon;

  return (
    <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm transition hover:-translate-y-1 hover:shadow-lg motion-reduce:hover:translate-y-0 flex flex-col gap-4">
      {/* 아이콘 박스 — 액센트색은 lucide 아이콘 컨테이너에만 적용 */}
      <div className={`inline-flex rounded-2xl p-3 ${accent.iconBg} self-start`}>
        <IconComponent className={`h-6 w-6 ${accent.text}`} aria-hidden />
      </div>

      <div>
        <h3 className="text-xl font-bold text-gray-900 mb-2">
          {/* next-intl t() 파라미터 타입 — 동적 키 허용 오버로드로 캐스팅 */}
          {t(`features.${block.key}.title` as Parameters<typeof t>[0])}
        </h3>
        <p className={`text-sm font-medium mb-2 ${accent.text}`}>
          {t(`features.${block.key}.description` as Parameters<typeof t>[0])}
        </p>
        <p className="text-gray-600 text-sm leading-relaxed">
          {t(`features.${block.key}.detail` as Parameters<typeof t>[0])}
        </p>
      </div>

      {/* 일러스트 동반 카드(newbie·inactiveMember): 흰 카드 본문 위에 직접 배치(누끼 불필요) */}
      {block.illustration ? (
        <div className="flex justify-end mt-auto pt-2">
          <Image
            src={block.illustration}
            alt={t(`features.${block.key}.title` as Parameters<typeof t>[0])}
            width={FEATURE_ILLUST_SIZE}
            height={FEATURE_ILLUST_SIZE}
            unoptimized
          />
        </div>
      ) : null}
    </div>
  );
}

function FeaturesSection({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
  // 대표 카드(voiceStats)와 나머지 5개로 분리해 리듬 부여
  const [featuredBlock, ...gridBlocks] = FEATURE_BLOCKS;

  return (
    <section id="features" className="scroll-mt-20 bg-gradient-to-b from-white to-gray-50 py-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900">{t('features.sectionTitle')}</h2>
        </div>

        {/* 대표 카드 — 풀폭 split (voiceStats) */}
        {featuredBlock ? (
          <div className="grid md:grid-cols-2 gap-8 items-center bg-white rounded-3xl p-6 md:p-10 border border-gray-100 shadow-sm mb-8">
            <div>
              <div
                className={`inline-flex rounded-2xl p-3 ${ACCENT_CLASSES[featuredBlock.accent]?.iconBg ?? ACCENT_CLASSES.indigo.iconBg} mb-4`}
              >
                <featuredBlock.icon
                  className={`h-10 w-10 ${ACCENT_CLASSES[featuredBlock.accent]?.text ?? ACCENT_CLASSES.indigo.text}`}
                  aria-hidden
                />
              </div>
              <h3 className="text-2xl font-bold text-gray-900 mb-3">
                {t(`features.${featuredBlock.key}.title` as Parameters<typeof t>[0])}
              </h3>
              <p
                className={`text-base font-medium mb-3 ${ACCENT_CLASSES[featuredBlock.accent]?.text ?? ACCENT_CLASSES.indigo.text}`}
              >
                {t(`features.${featuredBlock.key}.description` as Parameters<typeof t>[0])}
              </p>
              <p className="text-gray-600 leading-relaxed">
                {t(`features.${featuredBlock.key}.detail` as Parameters<typeof t>[0])}
              </p>
            </div>
            {/* 미니 차트 목업 자리 — 향후 실제 차트로 교체 가능 */}
            <div className="hidden md:flex items-center justify-center">
              <div className="w-full h-48 rounded-2xl bg-gradient-to-br from-indigo-50 to-indigo-100 flex items-center justify-center">
                <TrendingUp className="h-16 w-16 text-indigo-300" aria-hidden />
              </div>
            </div>
          </div>
        ) : null}

        {/* 나머지 5개 그리드 카드 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {gridBlocks.map((block) => (
            <FeatureCard key={block.key} block={block} t={t} />
          ))}
        </div>
      </div>
    </section>
  );
}

function SetupStep2Detail({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <div className="bg-white rounded-xl p-4 border border-amber-200">
      <p className="text-sm font-medium text-gray-900 mb-2">{t('setup.step2.howTo')}</p>
      <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
        <li>{t('setup.step2.step1')}</li>
        <li>{t('setup.step2.step2')}</li>
        <li>{t('setup.step2.step3')}</li>
      </ol>
      <p className="text-xs text-amber-700 mt-3">{t('setup.step2.notice')}</p>
    </div>
  );
}

function SetupCards({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="bg-gradient-to-br from-indigo-50 to-white p-6 rounded-2xl shadow-sm border border-indigo-100 hover:shadow-lg transition-shadow">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-white font-bold shadow-sm">
            1
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{t('setup.step1.title')}</h3>
            <p className="text-gray-600">{t('setup.step1.description')}</p>
          </div>
        </div>
      </div>
      <div className="flex justify-center">
        <div className="w-0.5 h-6 bg-gray-300" />
      </div>
      <div className="bg-amber-50 p-6 rounded-2xl shadow-sm border border-amber-200 hover:shadow-lg transition-shadow">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-amber-500 rounded-full flex items-center justify-center text-white font-bold shadow-sm">
            2
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <h3 className="text-lg font-semibold text-gray-900">{t('setup.step2.title')}</h3>
              <Shield className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-gray-600 mb-3">{t('setup.step2.description')}</p>
            <SetupStep2Detail t={t} />
          </div>
        </div>
      </div>
      <div className="flex justify-center">
        <div className="w-0.5 h-6 bg-gray-300" />
      </div>
      <div className="bg-gradient-to-br from-green-50 to-white p-6 rounded-2xl shadow-sm border border-green-100 hover:shadow-lg transition-shadow">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0 w-10 h-10 bg-green-600 rounded-full flex items-center justify-center text-white font-bold shadow-sm">
            3
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">{t('setup.step3.title')}</h3>
            <p className="text-gray-600">{t('setup.step3.description')}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SetupSection({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <section id="setup" className="scroll-mt-20 border-t border-gray-200 bg-white py-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          {/* 안내냥(cat-wave)을 섹션 헤더 옆에 배치 — 흰 섹션 위라 누끼 불필요 */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <Image
              src="/landing/cat-wave.png"
              alt="안내하는 Onyu 고양이"
              width={SETUP_CAT_SIZE}
              height={SETUP_CAT_SIZE}
              unoptimized
            />
          </div>
          <h2 className="text-4xl font-bold text-gray-900 mb-4">{t('setup.sectionTitle')}</h2>
          <p className="text-lg text-gray-600">{t('setup.sectionDescription')}</p>
        </div>
        <SetupCards t={t} />
      </div>
    </section>
  );
}

function CtaBandButton({
  t,
  inviteUrl,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
  inviteUrl: string | null;
}) {
  if (inviteUrl) {
    return (
      <a
        href={inviteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center px-8 py-4 bg-white text-indigo-700 rounded-full hover:bg-indigo-50 transition-colors font-bold text-lg shadow-lg focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
      >
        {t('ctaBand.button')}
      </a>
    );
  }
  return (
    <button
      disabled
      className="px-8 py-4 bg-white/50 text-indigo-400 rounded-full font-bold text-lg cursor-not-allowed"
      aria-disabled="true"
    >
      {t('ctaBand.button')}
    </button>
  );
}

function CtaBandSection({
  t,
  inviteUrl,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
  inviteUrl: string | null;
}) {
  return (
    <section className="bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 py-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid md:grid-cols-2 gap-10 items-center">
          <div className="text-center md:text-left">
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">{t('ctaBand.title')}</h2>
            <p className="text-lg text-white/80 mb-8">{t('ctaBand.description')}</p>
            <CtaBandButton t={t} inviteUrl={inviteUrl} />
          </div>
          {/* cat-cheer — 누끼(투명 PNG) 전제로 컬러 밴드 위에 직접 노출 */}
          <div className="flex justify-center md:justify-end">
            <Image
              src="/landing/cat-cheer.png"
              alt="환호하는 Onyu 고양이"
              width={CTA_CAT_SIZE}
              height={CTA_CAT_SIZE}
              unoptimized
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function FooterFeatureColumn({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <div>
      <h4 className="text-sm font-semibold text-gray-900 mb-3">{t('footer.features')}</h4>
      <ul className="space-y-2">
        {FOOTER_FEATURE_KEYS.map((key) => (
          <li key={key}>
            <a
              href="#features"
              className="text-sm text-gray-500 hover:text-indigo-600 transition-colors"
            >
              {/* next-intl t() 파라미터 타입 — 동적 키 허용 오버로드로 캐스팅 */}
              {t(`features.${key}.title` as Parameters<typeof t>[0])}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function LandingFooter({
  t,
  supportUrl,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
  supportUrl: string | null;
}) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Image
                src="/brand/img_onyu_cat.png"
                alt="Onyu 로고"
                width={FOOTER_LOGO_SIZE}
                height={FOOTER_LOGO_SIZE}
                unoptimized
                className="rounded-lg"
              />
              <span className="font-bold text-lg text-gray-900">Onyu</span>
            </div>
            <p className="text-sm text-gray-500">© {year} Onyu</p>
          </div>
          <FooterFeatureColumn t={t} />
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">
              {t('footer.dashboardLink')}
            </h4>
            <ul className="space-y-2">
              <li>
                <Link
                  href="/select-guild?mode=dashboard"
                  className="text-sm text-gray-500 hover:text-indigo-600 transition-colors"
                >
                  {t('nav.dashboard')}
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-gray-900 mb-3">{t('footer.support')}</h4>
            <ul className="space-y-2">
              {supportUrl ? (
                <li>
                  <a
                    href={supportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-gray-500 hover:text-indigo-600 transition-colors"
                  >
                    {t('footer.contactDiscord')}
                  </a>
                </li>
              ) : null}
              <li>
                <Link
                  href="/privacy"
                  className="text-sm text-gray-500 hover:text-indigo-600 transition-colors"
                >
                  {t('footer.privacy')}
                </Link>
              </li>
              <li>
                <Link
                  href="/terms"
                  className="text-sm text-gray-500 hover:text-indigo-600 transition-colors"
                >
                  {t('footer.terms')}
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default async function Home() {
  const t = await getTranslations('landing');
  const inviteUrl = getInviteUrl();
  const supportUrl = getSupportUrl();

  return (
    <div className="bg-gradient-to-br from-indigo-50 via-white to-sky-50">
      {/* 접근성 스킵 링크 */}
      <a
        href="#features"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-indigo-600 focus:text-white focus:rounded-lg"
      >
        기능 섹션으로 건너뛰기
      </a>

      <LandingNav />

      <HeroSection t={t} inviteUrl={inviteUrl} supportUrl={supportUrl} />
      <FeaturesSection t={t} />
      <SetupSection t={t} />
      <CtaBandSection t={t} inviteUrl={inviteUrl} />
      <LandingFooter t={t} supportUrl={supportUrl} />
    </div>
  );
}
