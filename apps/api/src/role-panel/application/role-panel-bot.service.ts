import { Injectable } from '@nestjs/common';

import { RolePanelConfigRepository } from '../infrastructure/role-panel-config.repository';
import type { BotRolePanelConfigDto } from '../presentation/role-panel-response.dto';

/**
 * 봇 폴백 config 조회 서비스 (read-only).
 * 봇 인터랙션 핸들러가 캐시 미스 시 DB 폴백으로 호출.
 */
@Injectable()
export class RolePanelBotService {
  constructor(private readonly configRepo: RolePanelConfigRepository) {}

  /**
   * 봇 폴백용 길드 패널 설정 조회 (DB 직접 조회, 캐시 미사용).
   * 버튼 클릭 처리 최소 데이터만 반환.
   */
  async getConfigForBot(guildId: string): Promise<BotRolePanelConfigDto[]> {
    const configs = await this.configRepo.findByGuildId(guildId);

    return configs.map((config) => ({
      panelId: config.id,
      buttons: (config.buttons ?? []).map((btn) => ({
        buttonId: btn.id,
        roleId: btn.roleId,
        // RolePanelButtonMode enum 값은 'GRANT'|'TOGGLE' 문자열과 동일 — bot-api-client types.ts와의 계약상 리터럴 유니온 필요
        mode: btn.mode as 'GRANT' | 'TOGGLE',
      })),
    }));
  }
}
