import { On } from '@discord-nestjs/core';
import { Injectable, Logger } from '@nestjs/common';
import { BotApiClientService } from '@onyu/bot-api-client';
import { type PartialUser, type User } from 'discord.js';

/**
 * Discord userUpdate 이벤트 수신 후 전역 프로필(username/globalName) 변경 시 API에 통보한다.
 * API 측에서 nick IS NULL인 행만 displayName을 갱신한다.
 * F-GUILD-MEMBER-005: 전역 프로필 변경 동기화.
 */
@Injectable()
export class BotUserUpdateHandler {
  private readonly logger = new Logger(BotUserUpdateHandler.name);

  constructor(private readonly apiClient: BotApiClientService) {}

  @On('userUpdate')
  async handleUserUpdate(oldUser: PartialUser | User, newUser: User): Promise<void> {
    // oldUser가 Partial이면 비교가 불가능하므로 무조건 API 호출한다.
    const isPartial = oldUser.partial;
    const hasUsernameChanged = !isPartial && oldUser.username !== newUser.username;
    const hasGlobalNameChanged = !isPartial && oldUser.globalName !== newUser.globalName;

    if (!isPartial && !hasUsernameChanged && !hasGlobalNameChanged) {
      return;
    }

    try {
      await this.apiClient.updateGuildMemberByUserUpdate({
        userId: newUser.id,
        // globalName이 없으면 username을 displayName으로 사용 (Discord 표시명 규칙)
        displayName: newUser.globalName ?? newUser.username,
        username: newUser.username,
      });
    } catch (err) {
      this.logger.error(
        `[USER-UPDATE] updateGlobalProfile failed: user=${newUser.id}`,
        err instanceof Error ? err.stack : err,
      );
    }
  }
}
