'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState } from 'react';

interface LandingUser {
  discordId: string;
  username: string;
  avatar: string | null;
}

const LOGO_SIZE = 40;
const AVATAR_SIZE = 32;
const SCROLL_THRESHOLD = 10;

const NAV_LINK_CLASS = 'text-sm font-medium text-gray-700 hover:text-indigo-600 transition-colors';
const LOGIN_BTN_CLASS =
  'px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2';

function UserProfile({ user, onLogout }: { user: LandingUser; onLogout: () => void }) {
  const t = useTranslations('common');
  const avatarUrl = user.avatar
    ? `https://cdn.discordapp.com/avatars/${user.discordId}/${user.avatar}.png`
    : null;
  const initial = user.username.charAt(0).toUpperCase();

  return (
    <div className="flex items-center gap-3">
      <Link
        href="/select-guild?mode=dashboard"
        className="flex items-center gap-2 hover:opacity-80 transition-opacity"
      >
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={user.username}
            width={AVATAR_SIZE}
            height={AVATAR_SIZE}
            className="rounded-full"
            unoptimized
          />
        ) : (
          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
            <span className="text-indigo-600 text-sm font-semibold">{initial}</span>
          </div>
        )}
        <span className="text-sm text-gray-700 hidden sm:inline">{user.username}</span>
      </Link>
      <button
        type="button"
        onClick={onLogout}
        className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
      >
        {t('auth.logout')}
      </button>
    </div>
  );
}

function LoginButton() {
  const t = useTranslations('common');
  return (
    <a href="/auth/discord" className={LOGIN_BTN_CLASS}>
      {t('auth.login')}
    </a>
  );
}

function NavAuthSlot({
  isLoading,
  user,
  onLogout,
}: {
  isLoading: boolean;
  user: LandingUser | null;
  onLogout: () => void;
}) {
  if (isLoading) {
    return <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />;
  }
  if (user) {
    return <UserProfile user={user} onLogout={onLogout} />;
  }
  return <LoginButton />;
}

function NavDesktopLinks({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="hidden md:flex items-center gap-6">
      <a href="#features" className={NAV_LINK_CLASS}>
        {t('nav.features')}
      </a>
      <a href="#setup" className={NAV_LINK_CLASS}>
        {t('nav.setup')}
      </a>
      <Link href="/select-guild?mode=dashboard" className={NAV_LINK_CLASS}>
        {t('nav.dashboard')}
      </Link>
    </div>
  );
}

export default function LandingNav() {
  const t = useTranslations('landing');
  const [isScrolled, setIsScrolled] = useState(false);
  const [user, setUser] = useState<LandingUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    function handleScroll() {
      setIsScrolled(window.scrollY > SCROLL_THRESHOLD);
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    fetch('/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) setUser(data.user);
      })
      .catch(() => {})
      .finally(() => setIsLoading(false));
  }, []);

  const handleLogout = useCallback(async () => {
    await fetch('/auth/logout', { method: 'POST' });
    setUser(null);
  }, []);

  return (
    <header
      className={`fixed top-0 inset-x-0 z-50 h-16 transition-all duration-200 ${isScrolled ? 'bg-white/90 backdrop-blur-sm border-b border-gray-200 shadow-sm' : 'bg-transparent'}`}
    >
      <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-xl text-gray-900 hover:opacity-80 transition-opacity"
        >
          <Image
            src="/discord_onyu_logo_03.png"
            alt="Onyu 로고"
            width={LOGO_SIZE}
            height={LOGO_SIZE}
            priority
            unoptimized
            className="rounded-lg"
          />
          <span>Onyu</span>
        </Link>
        <div className="flex items-center gap-6">
          <NavDesktopLinks t={t} />
          <NavAuthSlot isLoading={isLoading} user={user} onLogout={handleLogout} />
        </div>
      </nav>
    </header>
  );
}
