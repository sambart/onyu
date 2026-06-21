'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';

import type { MocoRankItem } from '../../../../../lib/newbie-dashboard-api';

interface MemberProfile {
  userName: string;
  avatarUrl: string | null;
}

interface MocoTopCardsProps {
  items: MocoRankItem[];
  profiles: Record<string, MemberProfile>;
  total: number;
}

const RANK_STYLES = [
  {
    border: 'border-yellow-400',
    bg: 'bg-yellow-50',
    badge: 'bg-yellow-400 text-white',
    rankKey: '1' as const,
    size: 'text-lg',
    ring: 'ring-2 ring-yellow-400',
  },
  {
    border: 'border-gray-400',
    bg: 'bg-gray-50',
    badge: 'bg-gray-400 text-white',
    rankKey: '2' as const,
    size: 'text-base',
    ring: 'ring-2 ring-gray-300',
  },
  {
    border: 'border-amber-600',
    bg: 'bg-amber-50',
    badge: 'bg-amber-600 text-white',
    rankKey: '3' as const,
    size: 'text-base',
    ring: 'ring-2 ring-amber-400',
  },
] as const;

const AVATAR_PLACEHOLDER = 'https://cdn.discordapp.com/embed/avatars/0.png';

function TopCard({
  rank,
  item,
  profile,
}: {
  rank: number;
  item: MocoRankItem;
  profile: MemberProfile | undefined;
}) {
  const t = useTranslations('dashboard');
  const style = RANK_STYLES[rank - 1];
  if (!style) return null;

  const avatarUrl = profile?.avatarUrl ?? AVATAR_PLACEHOLDER;
  const userName = profile?.userName ?? item.hunterId;

  return (
    <div
      className={`flex flex-col items-center gap-2 rounded-xl border-2 ${style.border} ${style.bg} p-4 text-center`}
    >
      <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${style.badge}`}>
        {t(`newbie.moco.rankLabel.${style.rankKey}`)}
      </span>
      <Image
        src={avatarUrl}
        alt={userName}
        width={56}
        height={56}
        className={`rounded-full ${style.ring}`}
      />
      <span className={`font-semibold text-gray-900 ${style.size} max-w-[120px] truncate`}>
        {userName}
      </span>
      <div className="text-sm text-gray-600">
        <span className="font-bold text-indigo-700">{item.score.toLocaleString()}</span>
      </div>
      <div className="flex gap-3 text-xs text-gray-500">
        <span>{t('newbie.moco.stats.huntMinutes', { minutes: item.channelMinutes })}</span>
        <span>{t('newbie.moco.stats.sessions', { count: item.sessionCount })}</span>
        <span>{t('newbie.moco.stats.mocoCount', { count: item.uniqueNewbieCount })}</span>
      </div>
    </div>
  );
}

export default function MocoTopCards({ items, profiles, total }: MocoTopCardsProps) {
  const t = useTranslations('dashboard');
  const topItems = items.slice(0, 3);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">{t('newbie.moco.topHunters')}</h3>
        <span className="text-sm text-gray-500">
          {t('newbie.moco.totalParticipants', { count: total })}
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {topItems.map((item, idx) => (
          <TopCard
            key={item.hunterId}
            rank={idx + 1}
            item={item}
            profile={profiles[item.hunterId]}
          />
        ))}
      </div>
    </div>
  );
}
