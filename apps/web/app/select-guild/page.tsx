'use client';

import { Loader2, Server, Shield } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Suspense, useCallback, useEffect, useState } from 'react';

import type { Guild, User } from '../components/Header';

function SelectGuildContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations('auth');
  const mode = searchParams.get('mode'); // "dashboard" | null (설정)
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const getGuildPath = useCallback(
    (guildId: string) =>
      mode === 'dashboard' ? `/dashboard/guild/${guildId}/voice` : `/settings/guild/${guildId}`,
    [mode],
  );

  useEffect(() => {
    fetch('/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.user) {
          router.replace('/auth/discord');
          return;
        }
        setUser(data.user);
        if (data.user.guilds?.length === 1) {
          localStorage.setItem('selectedGuildId', data.user.guilds[0].id);
          router.replace(getGuildPath(data.user.guilds[0].id));
        }
      })
      .catch(() => router.replace('/'))
      .finally(() => setIsLoading(false));
  }, [router, getGuildPath]);

  const guildIconUrl = (guild: Guild) =>
    guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (!user) return null;

  if (user.guilds.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[calc(100vh-4rem)] bg-gray-50">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('selectGuild.empty')}</h2>
          <p className="text-sm text-gray-500 mb-4">{t('selectGuild.emptyDesc')}</p>
          <p className="text-sm text-gray-500 mb-3">{t('selectGuild.emptyMyVoiceDesc')}</p>
          <Link
            href="/my/voice"
            className="inline-block px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm font-medium"
          >
            {t('selectGuild.emptyMyVoiceLink')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-16">
      <div className="text-center mb-12">
        <Server className="w-12 h-12 text-indigo-500 mx-auto mb-4" />
        <h1 className="text-3xl font-bold text-gray-900 mb-2">{t('selectGuild.title')}</h1>
        <p className="text-gray-500">
          {mode === 'dashboard'
            ? t('selectGuild.subtitleDashboard')
            : t('selectGuild.subtitleSettings')}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {user.guilds.map((guild) => (
          <button
            key={guild.id}
            onClick={() => {
              localStorage.setItem('selectedGuildId', guild.id);
              router.push(getGuildPath(guild.id));
            }}
            className="flex items-center space-x-4 p-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-md transition-all text-left"
          >
            {guildIconUrl(guild) ? (
              <Image
                src={guildIconUrl(guild) ?? ''}
                alt={guild.name}
                width={48}
                height={48}
                className="rounded-full flex-shrink-0"
                unoptimized
              />
            ) : (
              <div className="w-12 h-12 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-indigo-600 text-lg font-semibold">
                  {guild.name.charAt(0)}
                </span>
              </div>
            )}
            <span className="text-sm font-medium text-gray-900 truncate">{guild.name}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SelectGuildPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        </div>
      }
    >
      <SelectGuildContent />
    </Suspense>
  );
}
