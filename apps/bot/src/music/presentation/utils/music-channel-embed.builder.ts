import type { MusicButtonConfigItem, MusicChannelConfigResponse } from '@onyu/bot-api-client';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';
import type { KazagumoTrack } from 'kazagumo';

import {
  EMBED_COLOR_PAUSED,
  EMBED_COLOR_PLAYING,
  PROGRESS_BAR_EMPTY,
  PROGRESS_BAR_FILLED,
  PROGRESS_BAR_HEAD,
  PROGRESS_BAR_LENGTH,
} from '../../music.constants';

/** 음악 채널 임베드 기본값 */
const MUSIC_CHANNEL_DEFAULT_TITLE = '음악 채널';
const MUSIC_CHANNEL_DEFAULT_DESCRIPTION = '버튼을 눌러 음악을 재생하거나, 검색어를 입력하세요.';
const MUSIC_CHANNEL_DEFAULT_COLOR = '#5865F2' as `#${string}`;
const MUSIC_CHANNEL_BUTTON_CUSTOM_ID_PREFIX = 'music_channel:';
const DISCORD_MAX_BUTTONS_PER_ROW = 5;

/**
 * 대기 상태 임베드를 생성한다.
 * embedTitle, embedDescription, embedColor, embedThumbnailUrl을 적용한다.
 */
export function buildIdleMusicChannelEmbed(config: MusicChannelConfigResponse): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setTitle(config.embedTitle ?? MUSIC_CHANNEL_DEFAULT_TITLE)
    .setDescription(config.embedDescription ?? MUSIC_CHANNEL_DEFAULT_DESCRIPTION)
    // discord.js setColor는 `#${string}` 리터럴 타입을 요구하나,
    // API 응답 값은 string이므로 형식 보장을 위해 단언 사용 (저장 시 # 접두사 강제)
    .setColor((config.embedColor ?? MUSIC_CHANNEL_DEFAULT_COLOR) as `#${string}`);

  if (config.embedThumbnailUrl) {
    embed.setThumbnail(config.embedThumbnailUrl);
  }

  return embed;
}

/**
 * 재생 중 임베드를 생성한다.
 * 제목(링크), 아티스트, 썸네일, 상태 텍스트, 색상을 포함한다.
 */
export function buildPlayingMusicChannelEmbed(options: {
  track: KazagumoTrack;
  isPaused: boolean;
  fallbackThumbnailUrl?: string | null;
}): EmbedBuilder {
  const { track, isPaused, fallbackThumbnailUrl } = options;
  const statusLabel = isPaused ? '⏸️ 일시정지' : '▶️ 재생 중';
  const color = isPaused ? EMBED_COLOR_PAUSED : EMBED_COLOR_PLAYING;

  const durationMs = track.length ?? 0;
  const durationText = durationMs > 0 ? formatTime(durationMs) : 'LIVE';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(track.title)
    .setURL(track.uri ?? null)
    .addFields(
      { name: '아티스트', value: track.author ?? 'Unknown', inline: true },
      { name: '길이', value: durationText, inline: true },
      { name: '상태', value: statusLabel, inline: true },
    );

  const thumbnail = track.thumbnail ?? fallbackThumbnailUrl ?? null;
  if (thumbnail) {
    embed.setThumbnail(thumbnail);
  }

  return embed;
}

/**
 * 버튼 행을 빌드한다.
 * config.buttonConfig.buttons에서 enabled=true인 것만 필터 → row별 그룹핑.
 */
export function buildMusicChannelButtons(
  config: MusicChannelConfigResponse,
): ActionRowBuilder<ButtonBuilder>[] {
  const enabledButtons = config.buttonConfig.buttons.filter((b) => b.enabled);

  // row 번호별 그룹핑
  const rowMap = new Map<number, MusicButtonConfigItem[]>();
  for (const btn of enabledButtons) {
    const existing = rowMap.get(btn.row) ?? [];
    existing.push(btn);
    rowMap.set(btn.row, existing);
  }

  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const sortedRowNums = [...rowMap.keys()].sort((a, b) => a - b);

  for (const rowNum of sortedRowNums) {
    const rowButtons = (rowMap.get(rowNum) ?? []).slice(0, DISCORD_MAX_BUTTONS_PER_ROW);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      rowButtons.map((btn) => {
        const builder = new ButtonBuilder()
          .setCustomId(`${MUSIC_CHANNEL_BUTTON_CUSTOM_ID_PREFIX}${btn.type}`)
          .setLabel(btn.label)
          .setStyle(ButtonStyle.Secondary);

        if (btn.emoji?.trim()) {
          try {
            builder.setEmoji(btn.emoji.trim());
          } catch {
            // 유효하지 않은 이모지 무시
          }
        }

        return builder;
      }),
    );
    rows.push(row);
  }

  return rows;
}

/** ms를 M:SS 또는 H:MM:SS 형식으로 변환. */
export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, '0');

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${minutes}:${pad(seconds)}`;
}

/** 진행바 문자열 생성 (20칸 기준). */
export function formatProgressBar(positionMs: number, durationMs: number): string {
  if (durationMs <= 0) return PROGRESS_BAR_EMPTY.repeat(PROGRESS_BAR_LENGTH);

  const ratio = Math.min(positionMs / durationMs, 1);
  const filledCount = Math.min(Math.floor(ratio * PROGRESS_BAR_LENGTH), PROGRESS_BAR_LENGTH - 1);
  const emptyCount = PROGRESS_BAR_LENGTH - filledCount - 1;

  return (
    PROGRESS_BAR_FILLED.repeat(filledCount) +
    PROGRESS_BAR_HEAD +
    PROGRESS_BAR_EMPTY.repeat(Math.max(emptyCount, 0))
  );
}
