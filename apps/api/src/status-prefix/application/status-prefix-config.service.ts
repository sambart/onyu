import { Injectable, Logger } from '@nestjs/common';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from 'discord.js';

import { DomainException } from '../../common/domain-exception';
import { getErrorStack } from '../../common/util/error.util';
import { StatusPrefixButtonType } from '../domain/status-prefix.types';
import { StatusPrefixButtonOrm } from '../infrastructure/status-prefix-button.orm-entity';
import { StatusPrefixConfigOrm } from '../infrastructure/status-prefix-config.orm-entity';
import { StatusPrefixConfigRepository } from '../infrastructure/status-prefix-config.repository';
import { StatusPrefixDiscordAdapter } from '../infrastructure/status-prefix-discord.adapter';
import { StatusPrefixRedisRepository } from '../infrastructure/status-prefix-redis.repository';
import { StatusPrefixConfigSaveDto } from '../presentation/status-prefix-config-save.dto';

/** Discord 버튼 제약: ActionRow당 최대 버튼 수 */
const BUTTONS_PER_ROW = 5;

@Injectable()
export class StatusPrefixConfigService {
  private readonly logger = new Logger(StatusPrefixConfigService.name);

  constructor(
    private readonly configRepo: StatusPrefixConfigRepository,
    private readonly redisRepo: StatusPrefixRedisRepository,
    private readonly discordAdapter: StatusPrefixDiscordAdapter,
  ) {}

  /**
   * 닉네임에서 등록된 접두사 패턴을 제거하여 순수 닉네임을 추출한다.
   * prefixTemplate에서 {prefix} 자리에 등록된 모든 접두사를 대입하여 매칭 후 제거.
   *
   * 예: template='[{prefix}] {nickname}', prefixes=['관전','대기']
   *   - '[관전] 동현'  → '동현'
   *   - '[관전] [관전] 동현' → '[관전] 동현' → '동현' (반복 제거)
   *   - '동현' → '동현' (변경 없음)
   */
  stripPrefixFromNickname(nickname: string, config: StatusPrefixConfigOrm): string {
    if (!config.buttons?.length) return nickname;

    const prefixes = config.buttons
      .filter((b) => b.type === StatusPrefixButtonType.PREFIX && b.prefix?.trim())
      .map((b) => b.prefix.trim());

    if (prefixes.length === 0) return nickname;

    // 템플릿에서 정규식 패턴 생성
    // '[{prefix}] {nickname}' → '^\\[(?:관전|대기)\\]\\s' (앞부분만 매칭)
    const templateBefore = config.prefixTemplate.split('{nickname}')[0]; // '{prefix}' 포함 앞부분
    const escapedPrefixes = prefixes.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const prefixAlt = escapedPrefixes.join('|');

    // templateBefore의 리터럴 부분을 정규식 이스케이프 후, {prefix}를 접두사 대체 그룹으로 치환
    const escapedTemplate = templateBefore
      .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // 전체 이스케이프
      .replace('\\{prefix\\}', `(?:${prefixAlt})`); // {prefix} 부분만 대체 그룹으로

    const pattern = new RegExp(`^${escapedTemplate}`);

    // 반복 제거 (중첩된 접두사 대응)
    let result = nickname;
    let prev: string;
    do {
      prev = result;
      result = result.replace(pattern, '').trim();
    } while (result !== prev);

    // 스트립 결과가 빈 문자열이면 원본 유지 (닉네임 자체가 접두사 패턴인 극단 케이스)
    return result || nickname;
  }

  /**
   * 설정 조회 (F-STATUS-PREFIX-001).
   * Redis 캐시 우선, 미스 시 DB 조회 후 캐시 저장.
   */
  async getConfig(guildId: string): Promise<StatusPrefixConfigOrm | null> {
    const cached = await this.redisRepo.getConfig(guildId);
    if (cached) return cached;

    const config = await this.configRepo.findByGuildId(guildId);
    if (config) {
      await this.redisRepo.setConfig(guildId, config);
    }
    return config;
  }

  /**
   * 설정 저장 (F-STATUS-PREFIX-002).
   * 처리 순서:
   *   1. DB upsert (StatusPrefixConfig + StatusPrefixButton 버튼 전체 삭제 후 재삽입)
   *   2. Redis 설정 캐시 갱신
   *   3. enabled = true이면 Discord 채널에 Embed + 버튼 메시지 전송/갱신
   *   4. 전송된 messageId를 DB에 저장
   */
  async saveConfig(
    guildId: string,
    dto: StatusPrefixConfigSaveDto,
  ): Promise<StatusPrefixConfigOrm> {
    // 0. PREFIX 타입 버튼 간 접두사 중복 검증
    const prefixButtons = dto.buttons.filter((b) => b.type === StatusPrefixButtonType.PREFIX);
    const seen = new Set<string>();
    for (const btn of prefixButtons) {
      const trimmed = btn.prefix?.trim();
      if (!trimmed) continue;
      if (seen.has(trimmed)) {
        throw new DomainException(`접두사 "${trimmed}"이(가) 중복됩니다.`, 'PREFIX_DUPLICATE');
      }
      seen.add(trimmed);
    }

    // 1. DB upsert
    const config = await this.configRepo.upsert(guildId, dto);

    // 2. Redis 캐시 갱신
    await this.redisRepo.setConfig(guildId, config);

    // 3. enabled = true이고 channelId가 있으면 Discord 메시지 전송/갱신
    if (config.enabled && config.channelId) {
      try {
        const messageId = await this.buildAndSendMessage(config);
        // 4. messageId + lastAppliedAt을 단일 UPDATE로 DB 저장
        const appliedAt = new Date();
        await this.configRepo.updateMessageId(guildId, messageId, appliedAt);
        config.messageId = messageId;
        config.lastAppliedAt = appliedAt;
        // Redis 캐시도 messageId + lastAppliedAt 반영하여 재저장
        await this.redisRepo.setConfig(guildId, config);
      } catch (err) {
        this.logger.error(
          `[STATUS_PREFIX] Failed to send guide message: guild=${guildId}`,
          getErrorStack(err),
        );
        throw err; // 채널/권한 오류는 컨트롤러까지 전파하여 API 오류 반환
      }
    }

    return config;
  }

  /**
   * 현재 저장된 설정으로 Discord 메시지를 재게시한다 (F-3 다시 반영).
   * - config 없음: CONFIG_NOT_FOUND
   * - enabled=false 또는 channelId 없음: NOT_APPLICABLE
   * - buildAndSendMessage 실패: stamp 미갱신, 에러 전파
   */
  async reApply(guildId: string): Promise<StatusPrefixConfigOrm> {
    const config = await this.configRepo.findByGuildId(guildId);
    if (!config) {
      throw new DomainException('설정이 없습니다.', 'CONFIG_NOT_FOUND');
    }
    if (!config.enabled || !config.channelId) {
      throw new DomainException('반영 대상 채널이 없습니다.', 'NOT_APPLICABLE');
    }

    const messageId = await this.buildAndSendMessage(config);
    const appliedAt = new Date();
    await this.configRepo.updateMessageId(guildId, messageId, appliedAt);
    config.messageId = messageId;
    config.lastAppliedAt = appliedAt;
    await this.redisRepo.setConfig(guildId, config);
    return config;
  }

  /**
   * Discord 텍스트 채널에 Embed + 버튼 ActionRow 메시지 전송 또는 갱신.
   * messageId가 존재하면 기존 메시지 edit 시도, 실패 시 신규 전송으로 폴백.
   * 반환값: 전송된 메시지 ID
   */
  private async buildAndSendMessage(config: StatusPrefixConfigOrm): Promise<string> {
    const channelId = config.channelId;
    const fetched = await this.discordAdapter.fetchChannel(channelId);

    if (!fetched) {
      throw new Error(`Channel ${channelId} is not found`);
    }

    const embed = new EmbedBuilder();
    if (config.embedTitle) embed.setTitle(config.embedTitle);
    if (config.embedDescription) embed.setDescription(config.embedDescription);
    if (config.embedColor) {
      // discord.js EmbedBuilder.setColor()는 HEX 문자열('#5865F2')을 직접 지원한다
      embed.setColor(config.embedColor as `#${string}`);
    }

    const sortedButtons = [...config.buttons].sort((a, b) => a.sortOrder - b.sortOrder);
    const components = this.buildActionRows(sortedButtons);

    const payload = { embeds: [embed.toJSON()], components: components.map((r) => r.toJSON()) };

    if (config.messageId) {
      const edited = await this.discordAdapter.editMessage(channelId, config.messageId, payload);
      if (edited) return config.messageId;

      this.logger.warn(
        `[STATUS_PREFIX] Failed to edit message ${config.messageId}, sending new one`,
      );
      // 메시지 삭제됨 등의 이유로 수정 실패 → 신규 전송으로 폴백
    }

    const message = await this.discordAdapter.sendMessage(channelId, payload);
    return message.id;
  }

  /**
   * 버튼 목록을 Discord ActionRow 컴포넌트 배열로 변환.
   * PREFIX 버튼: customId = 'status_prefix:{buttonId}'
   * RESET 버튼: customId = 'status_reset:{buttonId}'
   * style: Primary (파란색) 고정
   */
  private buildActionRows(buttons: StatusPrefixButtonOrm[]): ActionRowBuilder<ButtonBuilder>[] {
    const rows: ActionRowBuilder<ButtonBuilder>[] = [];

    for (let i = 0; i < buttons.length; i += BUTTONS_PER_ROW) {
      const rowButtons = buttons.slice(i, i + BUTTONS_PER_ROW);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        rowButtons.map((btn) => {
          const customId =
            btn.type === StatusPrefixButtonType.PREFIX
              ? `status_prefix:${btn.id}`
              : `status_reset:${btn.id}`;

          const builder = new ButtonBuilder()
            .setCustomId(customId)
            .setLabel(btn.label)
            .setStyle(ButtonStyle.Primary);

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
}
