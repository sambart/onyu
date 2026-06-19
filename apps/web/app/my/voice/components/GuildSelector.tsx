'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';

import type { MeVoiceGuild } from '@/app/lib/me-voice-api';

interface Props {
  guilds: MeVoiceGuild[];
  selectedGuildId: string;
  onGuildChange: (guildId: string) => void;
}

function getGuildDisplayName(guild: MeVoiceGuild): string {
  return guild.guildName ?? guild.guildId;
}

export default function GuildSelector({ guilds, selectedGuildId, onGuildChange }: Props) {
  const t = useTranslations('dashboard');

  if (guilds.length === 1) {
    const guild = guilds[0];
    return (
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-500">{t('me.guildSelector.label')}</span>
        {guild.guildIcon && (
          <Image
            src={guild.guildIcon}
            alt={getGuildDisplayName(guild)}
            width={20}
            height={20}
            className="rounded-full"
            unoptimized
          />
        )}
        <span className="text-sm font-medium text-gray-900">{getGuildDisplayName(guild)}</span>
      </div>
    );
  }

  function handleSelectChange(event: React.ChangeEvent<HTMLSelectElement>) {
    onGuildChange(event.target.value);
  }

  return (
    <div className="flex items-center space-x-2">
      <label htmlFor="guild-selector" className="text-sm text-gray-500 shrink-0">
        {t('me.guildSelector.label')}
      </label>
      <select
        id="guild-selector"
        value={selectedGuildId}
        onChange={handleSelectChange}
        className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        {guilds.map((guild) => (
          <option key={guild.guildId} value={guild.guildId}>
            {getGuildDisplayName(guild)}
          </option>
        ))}
      </select>
    </div>
  );
}
