'use client';

import {
  Bell,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  Mic,
  Shield,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

// ─── 상수 ──────────────────────────────────────────────────────────────────

const STEP_COUNT = 4;

// ─── 스텝 컴포넌트들 ──────────────────────────────────────────────────────

function StepBotPermission() {
  const t = useTranslations('dashboard');
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      setIsLoading(true);
      try {
        const res = await fetch('/api/health', { cache: 'no-store' });
        const data = (await res.json()) as { status?: string };
        if (!cancelled) setIsOnline(data.status === 'ok');
      } catch {
        if (!cancelled) setIsOnline(false);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadStatus();
    return () => {
      cancelled = true;
    };
  }, []);

  const checks = [
    t('gettingStarted.botPermission.permissions.readMembers'),
    t('gettingStarted.botPermission.permissions.detectVoice'),
    t('gettingStarted.botPermission.permissions.sendMessage'),
    t('gettingStarted.botPermission.permissions.sendEmbed'),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
        <Shield className="h-8 w-8 flex-shrink-0 text-indigo-500" />
        <div>
          <p className="font-medium text-gray-900">
            {t('gettingStarted.botPermission.connectionTitle')}
          </p>
          {isLoading ? (
            <p className="text-sm text-gray-400">{t('gettingStarted.botPermission.checking')}</p>
          ) : isOnline ? (
            <p className="text-sm text-emerald-600">{t('gettingStarted.botPermission.online')}</p>
          ) : (
            <p className="text-sm text-red-500">{t('gettingStarted.botPermission.offline')}</p>
          )}
        </div>
        <div className="ml-auto flex-shrink-0">
          {isLoading ? (
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
          ) : isOnline ? (
            <CheckCircle2 className="h-6 w-6 text-emerald-500" />
          ) : (
            <XCircle className="h-6 w-6 text-red-400" />
          )}
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-gray-700">
          {t('gettingStarted.botPermission.permissionsTitle')}
        </p>
        <ul className="space-y-2">
          {checks.map((check) => (
            <li key={check} className="flex items-center gap-3 text-sm text-gray-600">
              <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-400" />
              {check}
            </li>
          ))}
        </ul>
      </div>

      {!isLoading && !isOnline && (
        <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {t('gettingStarted.botPermission.offlineWarning')}
        </div>
      )}
    </div>
  );
}

interface StepVoiceTrackingProps {
  guildId: string;
}

function StepVoiceTracking({ guildId }: StepVoiceTrackingProps) {
  const t = useTranslations('dashboard');

  const dataItems = [
    t('gettingStarted.voiceTracking.dataItems.joinLeave'),
    t('gettingStarted.voiceTracking.dataItems.channelDuration'),
    t('gettingStarted.voiceTracking.dataItems.stats'),
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-4 rounded-xl border border-indigo-100 bg-indigo-50 p-4">
        <Mic className="mt-0.5 h-6 w-6 flex-shrink-0 text-indigo-500" />
        <div>
          <p className="font-medium text-gray-900">{t('gettingStarted.voiceTracking.autoTitle')}</p>
          <p className="mt-1 text-sm text-gray-600">{t('gettingStarted.voiceTracking.autoDesc')}</p>
        </div>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium text-gray-700">
          {t('gettingStarted.voiceTracking.dataTitle')}
        </p>
        {dataItems.map((item) => (
          <div key={item} className="flex items-center gap-3 text-sm text-gray-600">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-indigo-400" />
            {item}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <p className="mb-2 text-sm font-medium text-gray-900">
          {t('gettingStarted.voiceTracking.excludeTitle')}
        </p>
        <p className="mb-3 text-sm text-gray-500">
          {t('gettingStarted.voiceTracking.excludeDesc')}
        </p>
        <Link
          href={`/settings/guild/${guildId}/voice`}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          {t('gettingStarted.voiceTracking.excludeLink')}
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}

interface StepNotificationChannelProps {
  guildId: string;
}

function StepNotificationChannel({ guildId }: StepNotificationChannelProps) {
  const t = useTranslations('dashboard');

  const notifications = [
    {
      title: t('gettingStarted.notifications.newbie.title'),
      description: t('gettingStarted.notifications.newbie.description'),
      href: `/settings/guild/${guildId}/newbie`,
      label: t('gettingStarted.notifications.newbie.link'),
    },
    {
      title: t('gettingStarted.notifications.inactive.title'),
      description: t('gettingStarted.notifications.inactive.description'),
      href: `/settings/guild/${guildId}/inactive-member`,
      label: t('gettingStarted.notifications.inactive.link'),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-xl border border-amber-100 bg-amber-50 p-4">
        <Bell className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
        <p className="text-sm text-amber-800">{t('gettingStarted.notifications.optionalNote')}</p>
      </div>

      {notifications.map((n) => (
        <div key={n.title} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
          <p className="mb-1 font-medium text-gray-900">{n.title}</p>
          <p className="mb-3 text-sm text-gray-500">{n.description}</p>
          <Link
            href={n.href}
            className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
          >
            {n.label}
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      ))}
    </div>
  );
}

interface StepCompleteProps {
  guildId: string;
}

function StepComplete({ guildId }: StepCompleteProps) {
  const t = useTranslations('dashboard');

  const features = [
    {
      href: `/dashboard/guild/${guildId}/overview`,
      label: t('gettingStarted.complete.features.overview.label'),
      desc: t('gettingStarted.complete.features.overview.desc'),
    },
    {
      href: `/dashboard/guild/${guildId}/voice`,
      label: t('gettingStarted.complete.features.voice.label'),
      desc: t('gettingStarted.complete.features.voice.desc'),
    },
    {
      href: `/dashboard/guild/${guildId}/newbie`,
      label: t('gettingStarted.complete.features.newbie.label'),
      desc: t('gettingStarted.complete.features.newbie.desc'),
    },
    {
      href: `/dashboard/guild/${guildId}/inactive-member`,
      label: t('gettingStarted.complete.features.inactive.label'),
      desc: t('gettingStarted.complete.features.inactive.desc'),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50">
          <CheckCircle2 className="h-9 w-9 text-emerald-500" />
        </div>
        <div>
          <p className="text-lg font-semibold text-gray-900">
            {t('gettingStarted.complete.title')}
          </p>
          <p className="mt-1 text-sm text-gray-500">{t('gettingStarted.complete.description')}</p>
        </div>
      </div>

      <div>
        <p className="mb-3 text-sm font-medium text-gray-700">
          {t('gettingStarted.complete.featuresTitle')}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {features.map((f) => (
            <Link
              key={f.href}
              href={f.href}
              className="flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 transition-colors hover:border-indigo-200 hover:bg-indigo-50"
            >
              <LayoutDashboard className="mt-0.5 h-4 w-4 flex-shrink-0 text-indigo-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">{f.label}</p>
                <p className="text-xs text-gray-500">{f.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ────────────────────────────────────────────────────────────

export default function GettingStartedPage() {
  const t = useTranslations('dashboard');
  const params = useParams();
  // Next.js 동적 라우트 세그먼트는 단일 값임이 라우트 정의에 의해 보장된다
  const guildId = params.guildId as string;
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState(1);

  const steps = [
    {
      id: 1,
      title: t('gettingStarted.steps.1.title'),
      subtitle: t('gettingStarted.steps.1.subtitle'),
    },
    {
      id: 2,
      title: t('gettingStarted.steps.2.title'),
      subtitle: t('gettingStarted.steps.2.subtitle'),
    },
    {
      id: 3,
      title: t('gettingStarted.steps.3.title'),
      subtitle: t('gettingStarted.steps.3.subtitle'),
    },
    {
      id: 4,
      title: t('gettingStarted.steps.4.title'),
      subtitle: t('gettingStarted.steps.4.subtitle'),
    },
  ];

  function handleNext() {
    if (currentStep < STEP_COUNT) {
      setCurrentStep((prev) => prev + 1);
    }
  }

  function handlePrev() {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
    }
  }

  function handleFinish() {
    router.push(`/dashboard/guild/${guildId}/overview`);
  }

  const currentMeta = steps[currentStep - 1];
  const isLastStep = currentStep === STEP_COUNT;

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-2xl">
        {/* 헤더 */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{t('gettingStarted.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('gettingStarted.subtitle')}</p>
        </div>

        {/* 스텝 인디케이터 */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            {steps.map((step, idx) => {
              const isCompleted = currentStep > step.id;
              const isActive = currentStep === step.id;

              return (
                <div key={step.id} className="flex flex-1 items-center">
                  <div className="flex flex-col items-center">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold transition-colors ${
                        isCompleted
                          ? 'bg-indigo-600 text-white'
                          : isActive
                            ? 'border-2 border-indigo-600 bg-white text-indigo-600'
                            : 'border-2 border-gray-200 bg-white text-gray-400'
                      }`}
                    >
                      {isCompleted ? <CheckCircle2 className="h-4 w-4" /> : <span>{step.id}</span>}
                    </div>
                    <span
                      className={`mt-1.5 hidden text-xs sm:block ${
                        isActive ? 'font-medium text-indigo-600' : 'text-gray-400'
                      }`}
                    >
                      {step.title}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <div
                      className={`mx-1 h-0.5 flex-1 transition-colors sm:mx-2 ${
                        currentStep > step.id ? 'bg-indigo-600' : 'bg-gray-200'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* 스텝 카드 */}
        <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm md:p-8">
          <div className="mb-6">
            <p className="text-xs font-medium uppercase tracking-wider text-indigo-500">
              {t('gettingStarted.stepOf', { current: currentStep, total: STEP_COUNT })}
            </p>
            <h2 className="mt-1 text-xl font-bold text-gray-900">{currentMeta.title}</h2>
            <p className="mt-1 text-sm text-gray-500">{currentMeta.subtitle}</p>
          </div>

          <div className="min-h-[220px]">
            {currentStep === 1 && <StepBotPermission />}
            {currentStep === 2 && <StepVoiceTracking guildId={guildId} />}
            {currentStep === 3 && <StepNotificationChannel guildId={guildId} />}
            {currentStep === 4 && <StepComplete guildId={guildId} />}
          </div>

          {/* 네비게이션 버튼 */}
          <div className="mt-8 flex items-center justify-between border-t border-gray-100 pt-6">
            <button
              onClick={handlePrev}
              disabled={currentStep === 1}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
              {t('gettingStarted.prev')}
            </button>

            {isLastStep ? (
              <button
                onClick={handleFinish}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                {t('gettingStarted.finish')}
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
              >
                {t('gettingStarted.next')}
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
