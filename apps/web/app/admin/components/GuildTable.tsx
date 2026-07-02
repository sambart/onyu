'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';

import { type AdminGuild, getGuildIconUrl } from '@/app/lib/admin-api';
import { formatDate, formatNumber } from '@/app/lib/format-utils';

const GUILD_ICON_SIZE = 32;

interface GuildTableProps {
  guilds: AdminGuild[];
}

interface GuildRowProps {
  guild: AdminGuild;
}

function GuildRow({ guild }: GuildRowProps) {
  const t = useTranslations('admin');
  const locale = useLocale();
  const iconUrl = getGuildIconUrl(guild.id, guild.icon);

  return (
    <tr className="hover:bg-gray-50 transition-colors">
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center space-x-3">
          {iconUrl ? (
            <Image
              src={iconUrl}
              alt={guild.name}
              width={GUILD_ICON_SIZE}
              height={GUILD_ICON_SIZE}
              className="rounded-full flex-shrink-0"
              unoptimized
            />
          ) : (
            <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-indigo-600 text-sm font-semibold">{guild.name.charAt(0)}</span>
            </div>
          )}
          <span className="text-sm font-medium text-gray-900 max-w-xs truncate">{guild.name}</span>
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-sm text-gray-500 font-mono">{guild.id}</span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-sm text-gray-700">
          {guild.memberCount === null
            ? t('guilds.memberCountUnknown')
            : formatNumber(guild.memberCount, locale)}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-sm text-gray-700">
          {guild.joinedAt === null ? '—' : formatDate(guild.joinedAt, locale)}
        </span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <Link
          href={`/dashboard/guild/${guild.id}/overview`}
          className="text-sm font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
        >
          {t('guilds.view')}
        </Link>
      </td>
    </tr>
  );
}

export default function GuildTable({ guilds }: GuildTableProps) {
  const t = useTranslations('admin');

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              {t('guilds.colName')}
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              {t('guilds.colId')}
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              {t('guilds.colMembers')}
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              {t('guilds.colJoinedAt')}
            </th>
            <th
              scope="col"
              className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
            >
              {t('guilds.colAction')}
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {guilds.map((guild) => (
            <GuildRow key={guild.id} guild={guild} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
