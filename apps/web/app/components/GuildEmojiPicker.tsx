'use client';

import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

import type { DiscordEmoji } from '../lib/discord-api';
import { formatEmojiString, getEmojiCdnUrl } from '../lib/discord-api';

interface GuildEmojiPickerProps {
  emojis: DiscordEmoji[];
  onSelect: (emojiString: string) => void;
  disabled?: boolean;
}

export default function GuildEmojiPicker({ emojis, onSelect, disabled }: GuildEmojiPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      // EventTarget → Node 좁히기 (contains() 호출에 필요)
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (emojis.length === 0) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        title="커스텀 이모지 선택"
        className="px-2 py-1.5 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        😀
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-64 max-h-48 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-6 gap-1">
          {emojis.map((emoji) => (
            <button
              key={emoji.id}
              type="button"
              onClick={() => {
                onSelect(formatEmojiString(emoji));
                setOpen(false);
              }}
              title={`:${emoji.name}:`}
              className="w-9 h-9 flex items-center justify-center rounded hover:bg-gray-100 transition-colors"
            >
              <Image
                src={getEmojiCdnUrl(emoji.id, emoji.animated)}
                alt={emoji.name}
                width={24}
                height={24}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
