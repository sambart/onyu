'use client';

import type { LucideIcon } from 'lucide-react';
import {
  ArrowLeftRight,
  BrainCircuit,
  GitFork,
  HelpCircle,
  LayoutDashboard,
  Mic,
  Settings,
  Sprout,
  UserX,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

import type { Guild } from './Header';
import { useSidebar } from './SidebarContext';
import SidebarDrawer from './SidebarDrawer';

interface DashboardSidebarProps {
  guilds: Guild[];
  selectedGuildId: string;
}

interface MenuItem {
  href: string;
  label: string;
  icon: LucideIcon;
  settingsHref?: string;
}

interface MenuGroup {
  label: string;
  items: MenuItem[];
}

export default function DashboardSidebar({ guilds, selectedGuildId }: DashboardSidebarProps) {
  const t = useTranslations('common');
  const pathname = usePathname();
  const { close } = useSidebar();

  const selectedGuild = guilds.find((g) => g.id === selectedGuildId);

  const guildIconUrl = (guild: Guild): string | null =>
    guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null;

  const selectedGuildIconUrl = selectedGuild ? guildIconUrl(selectedGuild) : null;

  const menuGroups: MenuGroup[] = [
    {
      label: t('sidebar.dashboardGroup.overview'),
      items: [
        {
          href: `/dashboard/guild/${selectedGuildId}/overview`,
          label: t('sidebar.overview'),
          icon: LayoutDashboard,
        },
      ],
    },
    {
      label: t('sidebar.dashboardGroup.memberActivity'),
      items: [
        {
          href: `/dashboard/guild/${selectedGuildId}/voice`,
          label: t('sidebar.voice'),
          icon: Mic,
          settingsHref: `/settings/guild/${selectedGuildId}/voice`,
        },
        {
          href: `/dashboard/guild/${selectedGuildId}/co-presence`,
          label: t('sidebar.coPresence'),
          icon: GitFork,
        },
        {
          href: `/dashboard/guild/${selectedGuildId}/newbie`,
          label: t('sidebar.newbie'),
          icon: Sprout,
          settingsHref: `/settings/guild/${selectedGuildId}/newbie`,
        },
        {
          href: `/dashboard/guild/${selectedGuildId}/inactive-member`,
          label: t('sidebar.inactiveMember'),
          icon: UserX,
          settingsHref: `/settings/guild/${selectedGuildId}/inactive-member`,
        },
      ],
    },
    {
      label: t('sidebar.dashboardGroup.analytics'),
      items: [
        {
          href: `/dashboard/guild/${selectedGuildId}/diagnosis`,
          label: t('sidebar.diagnosis'),
          icon: BrainCircuit,
          settingsHref: `/settings/guild/${selectedGuildId}/diagnosis`,
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
            href="/select-guild?mode=dashboard"
            onClick={close}
            className="flex items-center space-x-2 mt-2 px-3 py-1.5 text-xs text-gray-500 hover:text-indigo-600 hover:bg-gray-50 rounded transition-colors"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span>{t('sidebar.switchServer')}</span>
          </Link>
        )}
      </div>

      {/* 대시보드 메뉴 */}
      {menuGroups.map((group, groupIndex) => (
        <div key={group.label} className={groupIndex > 0 ? 'mt-4' : ''}>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1 px-3">
            {group.label}
          </h2>
          <nav className="space-y-1">
            {group.items.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              const Icon = item.icon;
              return (
                <div key={item.href} className="flex items-center">
                  <Link
                    href={item.href}
                    onClick={close}
                    className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors flex-1 ${
                      isActive
                        ? 'bg-indigo-50 text-indigo-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </Link>
                  {item.settingsHref && (
                    <Link
                      href={item.settingsHref}
                      onClick={close}
                      title={t('sidebar.crosslink.settings')}
                      className="p-1.5 text-gray-400 hover:text-indigo-600 transition-colors"
                    >
                      <Settings className="w-4 h-4" />
                    </Link>
                  )}
                </div>
              );
            })}
          </nav>
        </div>
      ))}

      {/* 설정으로 이동 */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <Link
          href={`/settings/guild/${selectedGuildId}`}
          onClick={close}
          className="flex items-center space-x-3 px-3 py-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        >
          <Settings className="w-5 h-5" />
          <span>{t('sidebar.settings')}</span>
        </Link>
        <div className="mt-1 pt-2 border-t border-gray-100">
          <Link
            href={`/dashboard/guild/${selectedGuildId}/help`}
            onClick={close}
            className={`flex items-center space-x-3 px-3 py-2 rounded-lg transition-colors ${
              pathname === `/dashboard/guild/${selectedGuildId}/help`
                ? 'bg-indigo-50 text-indigo-700 font-medium'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            <HelpCircle className="w-5 h-5" />
            <span>{t('sidebar.help')}</span>
          </Link>
        </div>
      </div>
    </div>
  );

  return <SidebarDrawer>{sidebarContent}</SidebarDrawer>;
}
