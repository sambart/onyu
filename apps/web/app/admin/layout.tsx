'use client';

import { LogIn, ShieldAlert } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

// 보안 주석: 클라이언트 role/scopes는 UI 분기 전용이다.
// 실제 권한은 API의 RoleGuard/ScopeGuard가 fail-closed로 강제한다 (PRD 비기능 보안 요구사항).

// eslint-disable-next-line max-lines-per-function -- 인증 로딩/네트워크오류/미로그인/role 게이트/서브내비 분기를 단일 레이아웃으로 통합
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations('admin');
  const tAuth = useTranslations('auth');

  const [isLoading, setIsLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [role, setRole] = useState<string | null>(null);
  const [scopes, setScopes] = useState<string[]>([]);
  const [isNetworkError, setIsNetworkError] = useState(false);

  const hasAdminManageScope = scopes.includes('admin:manage');

  useEffect(() => {
    fetch('/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setIsLoggedIn(true);
          setRole(data.user.role ?? null);
          setScopes(data.user.scopes ?? []);
          if (data.user.role == null) {
            router.replace('/');
          }
        }
      })
      .catch((error: unknown) => {
        console.error('[AdminLayout] /auth/me 인증 확인 실패', error);
        setIsNetworkError(true);
      })
      .finally(() => setIsLoading(false));
  }, [router]);

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100vh-4rem)]">
        <main className="flex-1 p-4 md:p-8 bg-gray-50 animate-pulse" />
      </div>
    );
  }

  if (isNetworkError) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gray-50">
        <div className="text-center">
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{tAuth('networkError')}</h2>
          <p className="text-sm text-gray-500 mb-4">{tAuth('networkErrorPrompt')}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium"
          >
            {tAuth('retry')}
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
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{tAuth('loginRequired')}</h2>
          <p className="text-sm text-gray-500 mb-4">{tAuth('loginPrompt')}</p>
          <a
            href={`/auth/discord?returnTo=${encodeURIComponent(pathname)}`}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium inline-block"
          >
            {tAuth('loginButton')}
          </a>
        </div>
      </div>
    );
  }

  if (role == null) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gray-50">
        <div className="text-center">
          <ShieldAlert className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('accessDenied')}</h2>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-4 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <h1 className="text-lg font-bold text-indigo-700">{t('console.title')}</h1>
          <nav className="flex items-center space-x-2">
            <Link
              href="/admin"
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                pathname === '/admin'
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {t('nav.guilds')}
            </Link>
            {hasAdminManageScope && (
              <Link
                href="/admin/admins"
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  pathname === '/admin/admins'
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t('admins.nav')}
              </Link>
            )}
          </nav>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}
