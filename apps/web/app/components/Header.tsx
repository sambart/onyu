'use client';

import { Home, LayoutDashboard, Menu, PanelLeft, Settings, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

import LocaleSwitcher from './LocaleSwitcher';
import { useSidebar } from './SidebarContext';

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export interface User {
  discordId: string;
  username: string;
  avatar: string | null;
  guilds: Guild[];
}

function getGuildPath(mode: 'dashboard' | 'settings'): string {
  const savedGuildId =
    // eslint-disable-next-line no-negated-condition -- SSR/클라이언트 환경 구분을 위한 필수 패턴
    typeof window !== 'undefined' ? localStorage.getItem('selectedGuildId') : null;
  if (savedGuildId) {
    return mode === 'dashboard'
      ? `/dashboard/guild/${savedGuildId}/voice`
      : `/settings/guild/${savedGuildId}`;
  }
  return mode === 'dashboard' ? '/select-guild?mode=dashboard' : '/select-guild';
}

export default function Header() {
  const t = useTranslations('common');
  const router = useRouter();
  const pathname = usePathname();
  const { toggle: toggleSidebar } = useSidebar();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const hasSidebar =
    pathname.startsWith('/dashboard/guild/') || pathname.startsWith('/settings/guild/');
  const isLandingPage = pathname === '/';

  useEffect(() => {
    fetch('/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleNavigate = useCallback(
    (mode: 'dashboard' | 'settings') => {
      const path = getGuildPath(mode);
      if (user) {
        router.push(path);
      } else {
        window.location.href = `/auth/discord?returnTo=${encodeURIComponent(path)}`;
      }
    },
    [user, router],
  );

  const handleLogin = useCallback(() => {
    window.location.href = '/auth/discord';
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch('/auth/logout', { method: 'POST' });
    localStorage.removeItem('selectedGuildId');
    setUser(null);
  }, []);

  const avatarUrl = user?.avatar
    ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`
    : null;

  const displayInitial = user?.username?.charAt(0).toUpperCase() ?? 'U';

  if (isLandingPage) return null;

  return (
    <>
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50 shadow-sm">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* 왼쪽: 사이드바 토글 + 로고 + 네비게이션 */}
            <div className="flex items-center space-x-8">
              <div className="flex items-center space-x-2">
                {hasSidebar && (
                  <button
                    onClick={toggleSidebar}
                    className="md:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100 transition-colors"
                    aria-label={t('sidebar.open')}
                  >
                    <PanelLeft className="w-5 h-5 text-gray-700" />
                  </button>
                )}
                <Link href="/" className="flex items-center space-x-2">
                  <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center">
                    <span className="text-white font-bold text-xl">D</span>
                  </div>
                  <span className="font-bold text-xl text-gray-900 hidden sm:block">Onyu</span>
                </Link>
              </div>

              <div className="hidden md:flex items-center space-x-4">
                <Link
                  href="/"
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <Home className="w-4 h-4" />
                  <span>{t('nav.home')}</span>
                </Link>

                <button
                  onClick={() => handleNavigate('dashboard')}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>{t('nav.dashboard')}</span>
                </button>

                <button
                  onClick={() => handleNavigate('settings')}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors"
                >
                  <Settings className="w-4 h-4" />
                  <span>{t('nav.settings')}</span>
                </button>
              </div>
            </div>

            {/* 오른쪽: 언어 선택 + 로그인/사용자 정보 */}
            <div className="hidden md:flex items-center space-x-4">
              <LocaleSwitcher />
              {isLoading ? (
                <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />
              ) : user ? (
                <>
                  <div className="flex items-center space-x-3">
                    {avatarUrl ? (
                      <img
                        src={avatarUrl}
                        alt={user.username}
                        width={32}
                        height={32}
                        className="rounded-full"
                      />
                    ) : (
                      <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
                        <span className="text-indigo-600 text-sm font-semibold">
                          {displayInitial}
                        </span>
                      </div>
                    )}
                    <span className="text-sm text-gray-700">{user.username}</span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                  >
                    {t('auth.logout')}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleLogin}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
                >
                  {t('auth.login')}
                </button>
              )}
            </div>

            {/* 모바일 메뉴 버튼 */}
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="md:hidden p-2 rounded-lg hover:bg-gray-100"
            >
              {isMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>

          {/* 모바일 메뉴 */}
          {isMenuOpen && (
            <div className="md:hidden py-4 border-t border-gray-200">
              <div className="flex flex-col space-y-2">
                <Link
                  href="/"
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100"
                  onClick={() => setIsMenuOpen(false)}
                >
                  <Home className="w-4 h-4" />
                  <span>{t('nav.home')}</span>
                </Link>

                <button
                  onClick={() => {
                    handleNavigate('dashboard');
                    setIsMenuOpen(false);
                  }}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 text-left"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>{t('nav.dashboard')}</span>
                </button>

                <button
                  onClick={() => {
                    handleNavigate('settings');
                    setIsMenuOpen(false);
                  }}
                  className="flex items-center space-x-2 px-3 py-2 rounded-lg text-gray-700 hover:bg-gray-100 text-left"
                >
                  <Settings className="w-4 h-4" />
                  <span>{t('nav.settings')}</span>
                </button>

                <div className="pt-4 border-t border-gray-200">
                  {user ? (
                    <button
                      onClick={() => {
                        handleLogout();
                        setIsMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 text-left text-gray-700 hover:bg-gray-100 rounded-lg"
                    >
                      {t('auth.logout')}
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        handleLogin();
                        setIsMenuOpen(false);
                      }}
                      className="w-full px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                    >
                      {t('auth.login')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </nav>
      </header>
    </>
  );
}
