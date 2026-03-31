'use client';

import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  BarChart3,
  BrainCircuit,
  HeartPulse,
  Mic,
  Music,
  Pin,
  Radio,
  Settings,
  Tag,
  Users,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { Guild } from './Header';
import { useSidebar } from './SidebarContext';
import SidebarDrawer from './SidebarDrawer';

interface SettingsSidebarProps {
  guilds: Guild[];
  selectedGuildId: string;
}

interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

export default function SettingsSidebar({ guilds, selectedGuildId }: SettingsSidebarProps) {
  const t = useTranslations('common');
  const pathname = usePathname();
  const { close } = useSidebar();

  const selectedGuild = guilds.find((g) => g.id === selectedGuildId);

  const guildIconUrl = (guild: Guild): string | null =>
    guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null;

  const selectedGuildIconUrl = selectedGuild ? guildIconUrl(selectedGuild) : null;

  const menuGroups: MenuGroup[] = [
    {
      label: t('sidebar.settingsGroup.serverSettings'),
      items: [
        {
          href: `/settings/guild/${selectedGuildId}`,
          label: t('settings.general'),
          icon: Settings,
        },
        {
          href: `/settings/guild/${selectedGuildId}/music`,
          label: t('settings.music'),
          icon: Music,
        },
      ],
    },
    {
      label: t('sidebar.settingsGroup.voiceChannel'),
      items: [
        { href: `/settings/guild/${selectedGuildId}/voice`, label: t('settings.voice'), icon: Mic },
        {
          href: `/settings/guild/${selectedGuildId}/voice-health`,
          label: t('settings.voiceHealth'),
          icon: HeartPulse,
        },
        {
          href: `/settings/guild/${selectedGuildId}/auto-channel`,
          label: t('settings.autoChannel'),
          icon: Radio,
        },
      ],
    },
    {
      label: t('sidebar.settingsGroup.memberManagement'),
      items: [
        {
          href: `/settings/guild/${selectedGuildId}/newbie`,
          label: t('settings.newbie'),
          icon: Users,
        },
        {
          href: `/settings/guild/${selectedGuildId}/inactive-member`,
          label: t('settings.inactiveMember'),
          icon: UserX,
        },
        {
          href: `/settings/guild/${selectedGuildId}/status-prefix`,
          label: t('settings.statusPrefix'),
          icon: Tag,
        },
        {
          href: `/settings/guild/${selectedGuildId}/sticky-message`,
          label: t('settings.stickyMessage'),
          icon: Pin,
        },
      ],
    },
    {
      label: t('sidebar.settingsGroup.analytics'),
      items: [
        {
          href: `/settings/guild/${selectedGuildId}/diagnosis`,
          label: t('settings.diagnosis'),
          icon: BrainCircuit,
        },
      ],
    },
  ];

  const sidebarContent = (
    <div className="p-4">
      {/* 선택된 길드 표시 */}
      <div className="mb-6">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          {t('sidebar.server')}
        </h2>
        <div className="flex items-center space-x-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
          {selectedGuildIconUrl ? (
            <img
              src={selectedGuildIconUrl}
              alt={selectedGuild?.name ?? ''}
              width={20}
              height={20}
              className="rounded-full flex-shrink-0"
            />
          ) : (
            <div className="w-5 h-5 bg-indigo-100 rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-indigo-600 text-[10px] font-semibold">
                {selectedGuild?.name?.charAt(0) ?? '?'}
              </span>
            </div>
          )}
          <span className="text-sm text-gray-900 truncate flex-1">
            {selectedGuild?.name ?? 'Unknown'}
          </span>
        </div>
        {guilds.length > 1 && (
          <Link
            href="/select-guild"
            onClick={close}
            className="flex items-center space-x-2 mt-2 px-3 py-1.5 text-xs text-gray-500 hover:text-indigo-600 hover:bg-gray-50 rounded transition-colors"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>{t('sidebar.switchServer')}</span>
          </Link>
        )}
      </div>

      {/* 설정 메뉴 */}
      {menuGroups.map((group, groupIndex) => (
        <div key={group.label} className={groupIndex > 0 ? 'mt-4' : ''}>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-3">
            {group.label}
          </h2>
          <nav className="space-y-1">
            {group.items.map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={close}
                  className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-indigo-50 text-indigo-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      ))}

      {/* 대시보드로 이동 */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <Link
          href={`/dashboard/guild/${selectedGuildId}/voice`}
          onClick={close}
          className="flex items-center space-x-3 px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <BarChart3 className="w-5 h-5" />
          <span>{t('sidebar.toDashboard')}</span>
        </Link>
      </div>
    </div>
  );

  return <SidebarDrawer>{sidebarContent}</SidebarDrawer>;
}
