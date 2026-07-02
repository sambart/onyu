'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import {
  type AdminGuild,
  fetchAdminGuilds,
  fetchPlatformHealth,
  type PlatformHealth,
} from '@/app/lib/admin-api';

import GuildSearchBar from './components/GuildSearchBar';
import GuildTable from './components/GuildTable';
import PlatformHealthPanel from './components/PlatformHealthPanel';

export default function AdminPage() {
  const t = useTranslations('admin');

  const [guilds, setGuilds] = useState<AdminGuild[]>([]);
  const [isGuildsLoading, setIsGuildsLoading] = useState(true);
  const [guildsError, setGuildsError] = useState<string | null>(null);

  const [health, setHealth] = useState<PlatformHealth | null>(null);
  const [isHealthLoading, setIsHealthLoading] = useState(true);
  const [isHealthError, setIsHealthError] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      // 길드 목록과 헬스를 병렬로 조회한다. 헬스 실패는 목록과 독립적으로 처리.
      const [guildsResult, healthResult] = await Promise.allSettled([
        fetchAdminGuilds(),
        fetchPlatformHealth(),
      ]);

      if (cancelled) return;

      if (guildsResult.status === 'fulfilled') {
        setGuilds(guildsResult.value);
      } else {
        setGuildsError(t('loadFailed'));
      }
      setIsGuildsLoading(false);

      if (healthResult.status === 'fulfilled') {
        setHealth(healthResult.value);
      } else {
        setIsHealthError(true);
      }
      setIsHealthLoading(false);
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const filteredGuilds = guilds.filter((guild) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return guild.name.toLowerCase().includes(term) || guild.id.includes(term);
  });

  const isEmptyTotal = !isGuildsLoading && !guildsError && guilds.length === 0;
  const isEmptyFiltered =
    !isGuildsLoading && !guildsError && guilds.length > 0 && filteredGuilds.length === 0;

  return (
    <div className="space-y-6">
      {/* 플랫폼 상태 패널 */}
      <PlatformHealthPanel health={health} isLoading={isHealthLoading} isError={isHealthError} />

      {/* 길드 목록 섹션 */}
      <div className="space-y-4">
        <GuildSearchBar value={searchTerm} onChange={setSearchTerm} />

        {isGuildsLoading ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-gray-500">{t('loading')}</p>
          </div>
        ) : guildsError ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-red-500">{guildsError}</p>
          </div>
        ) : isEmptyTotal ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-gray-500">{t('guilds.empty')}</p>
          </div>
        ) : isEmptyFiltered ? (
          <div className="flex items-center justify-center py-20">
            <p className="text-sm text-gray-500">{t('guilds.noResults')}</p>
          </div>
        ) : (
          <GuildTable guilds={filteredGuilds} />
        )}
      </div>
    </div>
  );
}
