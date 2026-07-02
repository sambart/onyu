'use client';

import { LogIn } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import type { Guild } from '../../components/Header';
import { UnsavedChangesProvider } from '../../components/settings/UnsavedChangesContext';
import SettingsSidebar from '../../components/SettingsSidebar';
import { SettingsProvider } from '../SettingsContext';

const LOCAL_STORAGE_GUILD_KEY = 'selectedGuildId';

export default function MeSettingsLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isNetworkError, setIsNetworkError] = useState(false);

  useEffect(() => {
    fetch('/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { user?: { guilds?: Guild[] } } | null) => {
        if (data?.user) {
          setIsLoggedIn(true);
          const userGuilds: Guild[] = data.user.guilds ?? [];
          setGuilds(userGuilds);

          // localStorage에서 선호 길드 ID를 읽어 초기값으로 설정 ('use client' 보장으로 window 항상 존재)
          const storedId = localStorage.getItem(LOCAL_STORAGE_GUILD_KEY) ?? '';
          const hasStoredGuild = userGuilds.some((g) => g.id === storedId);
          const initialGuildId = hasStoredGuild ? storedId : (userGuilds[0]?.id ?? '');
          setSelectedGuildId(initialGuildId);
        } else {
          // 미인증 → 로그인 페이지로 리다이렉트
          router.replace(`/auth/discord?returnTo=${encodeURIComponent(pathname)}`);
        }
      })
      .catch(() => {
        setIsNetworkError(true);
      })
      .finally(() => setIsLoading(false));
  }, [pathname, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)]">
        <div className="hidden md:block w-64 bg-white border-r border-gray-200 animate-pulse" />
        <div className="flex-1 p-4 md:p-8 bg-gray-50" />
      </div>
    );
  }

  if (isNetworkError) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gray-50">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">서버에 연결할 수 없습니다</h2>
          <p className="text-sm text-gray-500 mb-4">네트워크 연결을 확인하고 다시 시도해주세요.</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            다시 시도
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
          <h2 className="text-lg font-semibold text-gray-900 mb-2">로그인이 필요합니다</h2>
          <p className="text-sm text-gray-500 mb-4">
            설정을 관리하려면 Discord 계정으로 로그인하세요.
          </p>
          <a
            href={`/auth/discord?returnTo=${encodeURIComponent(pathname)}`}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium inline-block"
          >
            로그인
          </a>
        </div>
      </div>
    );
  }

  return (
    <UnsavedChangesProvider>
      <div className="flex">
        <SettingsSidebar guilds={guilds} selectedGuildId={selectedGuildId} />
        <main className="flex-1 p-4 md:p-8 bg-gray-50">
          <SettingsProvider value={{ guilds, selectedGuildId }}>{children}</SettingsProvider>
        </main>
      </div>
    </UnsavedChangesProvider>
  );
}
