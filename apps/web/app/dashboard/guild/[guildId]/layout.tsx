'use client';

import { LogIn } from 'lucide-react';
import { useParams, usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import DashboardSidebar from '../../../components/DashboardSidebar';
import type { Guild } from '../../../components/Header';
import { resolveAdminGuild } from '../../../lib/admin-api';

export default function DashboardGuildLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ guildId: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('auth');
  const guildId = params.guildId;

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isNetworkError, setIsNetworkError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function loadGuildContext() {
      try {
        const res = await fetch('/auth/me');
        const data = res.ok ? await res.json() : null;
        if (cancelled || !data?.user) return;
        setIsLoggedIn(true);
        const userGuilds: Guild[] = data.user.guilds ?? [];
        const isAdminViewer = data.user.role != null;
        const isMember = userGuilds.some((g) => g.id === guildId);
        // 관리자(슈퍼/운영자)는 비운영 길드도 read-only 열람 가능 (API GuildMembershipGuard가 role!=null GET 우회 허용)
        if (!isAdminViewer && !isMember) {
          router.replace('/select-guild?mode=dashboard');
          return;
        }
        setGuilds(userGuilds);
        if (isAdminViewer && !isMember) {
          // 비운영 길드의 사이드바 표시명은 비차단으로 백그라운드 resolve — 페이지 로딩을 막지 않는다
          void resolveAdminGuild(guildId).then((resolved) => {
            if (cancelled) return;
            setGuilds((prev) =>
              prev.some((g) => g.id === resolved.id) ? prev : [...prev, resolved],
            );
          });
        }
      } catch {
        if (!cancelled) setIsNetworkError(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    void loadGuildContext();
    return () => {
      cancelled = true;
    };
  }, [guildId, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)]">
        <div className="hidden md:block w-64 bg-white border-r border-gray-200 animate-pulse" />
        <main className="flex-1 p-4 md:p-8 bg-gray-50" />
      </div>
    );
  }

  if (isNetworkError) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gray-50">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('networkError')}</h2>
          <p className="text-sm text-gray-500 mb-4">{t('networkErrorPrompt')}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            {t('retry')}
          </button>
        </div>
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gray-50">
        <div className="text-center">
          <LogIn className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('loginRequired')}</h2>
          <p className="text-sm text-gray-500 mb-4">{t('loginPrompt')}</p>
          <a
            href={`/auth/discord?returnTo=${encodeURIComponent(pathname)}`}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium inline-block"
          >
            {t('loginButton')}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex">
      <DashboardSidebar guilds={guilds} selectedGuildId={guildId} />
      <main className="flex-1 bg-gray-50 overflow-auto">{children}</main>
    </div>
  );
}
