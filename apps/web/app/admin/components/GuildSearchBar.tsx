'use client';

import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface GuildSearchBarProps {
  value: string;
  onChange: (value: string) => void;
}

export default function GuildSearchBar({ value, onChange }: GuildSearchBarProps) {
  const t = useTranslations('admin');

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value);
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      <input
        type="text"
        value={value}
        onChange={handleSearchChange}
        placeholder={t('guilds.searchPlaceholder')}
        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white"
      />
    </div>
  );
}
