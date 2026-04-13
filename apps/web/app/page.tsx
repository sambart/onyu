import { Shield } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';

import LandingNav from './components/LandingNav';

const BOT_PERMISSIONS = 411108370;
const FOOTER_LOGO_SIZE = 32;
const HERO_LOGO_SIZE = 64;

function getInviteUrl(): string | null {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return null;
  return `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${BOT_PERMISSIONS}&scope=bot+applications.commands`;
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
  icon: string;
  illustration?: string;
  accent: string;
}

const FEATURE_BLOCKS: FeatureBlock[] = [
  { key: 'voiceStats', icon: '/landing/icon_trend.png', accent: 'indigo' },
  { key: 'autoChannel', icon: '/landing/icon_mic.png', accent: 'purple' },
  { key: 'gemini', icon: '/landing/icon_lightning.png', accent: 'blue' },
  {
    key: 'newbie',
    icon: '/landing/icon_adduser.png',
    illustration: '/landing/03_cat_newmember.png',
    accent: 'green',
  },
  { key: 'dashboard', icon: '/landing/icon_settings.png', accent: 'yellow' },
  { key: 'inactiveMember', icon: '/landing/icon_settings.png', accent: 'pink' },
];

function HeroCta({
  t,
  inviteUrl,
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
  inviteUrl: string | null;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-4 justify-center md:justify-start">
      {inviteUrl ? (
        <a
          href={inviteUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center px-8 py-4 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-semibold text-lg focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2"
        >
          {t('hero.cta.invite')}
        </a>
      ) : null}
      <a
        href="#features"
        className={`px-8 py-4 rounded-lg font-semibold text-lg transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
          inviteUrl
            ? 'border border-gray-300 text-gray-700 hover:bg-gray-50'
            : 'bg-indigo-600 text-white hover:bg-indigo-700'
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
}: {
  t: Awaited<ReturnType<typeof getTranslations>>;
  inviteUrl: string | null;
}) {
  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-16">
      <div className="grid md:grid-cols-2 gap-12 items-center">
        <div className="text-center md:text-left">
          <h1 className="flex items-center justify-center md:justify-start gap-4 text-5xl sm:text-6xl font-bold text-gray-900 mb-6 leading-tight">
            <Image
              src="/logo.png"
              alt="Onyu 로고"
              width={HERO_LOGO_SIZE}
              height={HERO_LOGO_SIZE}
              priority
              className="rounded-xl"
            />
            <span>Onyu</span>
          </h1>
          <p className="text-xl text-gray-600 mb-8 leading-relaxed">{t('hero.description')}</p>
          <HeroCta t={t} inviteUrl={inviteUrl} />
        </div>
        <div className="flex justify-center md:justify-end">
          <div
            role="img"
            aria-label="Hero 일러스트 자리"
            className="w-full max-w-md md:max-w-none aspect-[4/3] rounded-2xl bg-gradient-to-br from-indigo-100 via-purple-100 to-pink-100 border-2 border-dashed border-indigo-300 flex items-center justify-center text-indigo-400 font-medium"
          >
            Hero Image
          </div>
        </div>
      </div>
    </section>
  );
}

function FeatureItem({
  block,
  index,
  t,
}: {
  block: FeatureBlock;
  index: number;
  t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const accent = ACCENT_CLASSES[block.accent] ?? ACCENT_CLASSES.indigo;
  const isOdd = index % 2 !== 0;
  const isIllustration = Boolean(block.illustration);

  return (
    <div className={`grid md:grid-cols-2 gap-10 items-center scroll-mt-20`}>
      {/* 이미지 컬럼 (placeholder) */}
      <div className={`flex justify-center ${isOdd ? 'md:order-2' : ''}`}>
        <div className={`${accent.iconBg} rounded-2xl p-8 flex items-center justify-center`}>
          <div
            role="img"
            aria-label={`${block.key} placeholder`}
            className={`${isIllustration ? 'w-64 h-64' : 'w-24 h-24'} border-2 border-dashed border-gray-400 rounded-xl flex items-center justify-center text-gray-500 text-xs font-medium bg-white/60`}
          >
            {isIllustration ? 'Illustration' : 'Icon'}
          </div>
        </div>
      </div>

      {/* 텍스트 컬럼 */}
      <div className={isOdd ? 'md:order-1' : ''}>
        <h3 className="text-2xl font-bold text-gray-900 mb-3">
          {/* next-intl t() 파라미터 타입 — 동적 키 허용 오버로드로 캐스팅 */}
          {t(`features.${block.key}.title` as Parameters<typeof t>[0])}
        </h3>
        <p className={`text-base font-medium mb-3 ${accent.text}`}>
          {t(`features.${block.key}.description` as Parameters<typeof t>[0])}
        </p>
        <p className="text-gray-600 leading-relaxed">
          {t(`features.${block.key}.detail` as Parameters<typeof t>[0])}
        </p>
      </div>
    </div>
  );
}

function FeaturesSection({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
  return (
    <section id="features" className="scroll-mt-20 bg-gradient-to-b from-white to-gray-50 py-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-gray-900">{t('features.sectionTitle')}</h2>
        </div>
        <div className="space-y-20">
          {FEATURE_BLOCKS.map((block, index) => (
            <FeatureItem key={block.key} block={block} index={index} t={t} />
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
        className="inline-flex items-center justify-center px-8 py-4 bg-white text-indigo-700 rounded-xl hover:bg-indigo-50 transition-colors font-bold text-lg shadow-lg focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-indigo-600"
      >
        {t('ctaBand.button')}
      </a>
    );
  }
  return (
    <button
      disabled
      className="px-8 py-4 bg-white/50 text-indigo-400 rounded-xl font-bold text-lg cursor-not-allowed"
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
          <div className="flex justify-center md:justify-end order-first md:order-last">
            <div
              role="img"
              aria-label="CTA 일러스트 자리"
              className="w-48 h-48 md:w-64 md:h-64 rounded-2xl border-2 border-dashed border-white/60 bg-white/10 flex items-center justify-center text-white/80 font-medium"
            >
              CTA Image
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

const FOOTER_FEATURE_KEYS: Array<FeatureBlock['key']> = [
  'voiceStats',
  'autoChannel',
  'gemini',
  'newbie',
  'dashboard',
  'inactiveMember',
];

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

function LandingFooter({ t }: { t: Awaited<ReturnType<typeof getTranslations>> }) {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Image
                src="/logo.png"
                alt="Onyu 로고"
                width={FOOTER_LOGO_SIZE}
                height={FOOTER_LOGO_SIZE}
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
            <h4 className="text-sm font-semibold text-gray-900 mb-3">&nbsp;</h4>
            <ul className="space-y-2">
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

      <HeroSection t={t} inviteUrl={inviteUrl} />
      <FeaturesSection t={t} />
      <SetupSection t={t} />
      <CtaBandSection t={t} inviteUrl={inviteUrl} />
      <LandingFooter t={t} />
    </div>
  );
}
