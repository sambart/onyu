import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { StatusPrefixConfigSaveDto } from '../presentation/status-prefix-config-save.dto';
import { StatusPrefixButtonOrm } from './status-prefix-button.orm-entity';
import { StatusPrefixConfigOrm } from './status-prefix-config.orm-entity';

@Injectable()
export class StatusPrefixConfigRepository {
  constructor(
    @InjectRepository(StatusPrefixConfigOrm)
    private readonly configRepo: Repository<StatusPrefixConfigOrm>,
    @InjectRepository(StatusPrefixButtonOrm)
    private readonly buttonRepo: Repository<StatusPrefixButtonOrm>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * guildId로 설정 단건 조회 (buttons 관계 포함).
   * F-STATUS-PREFIX-001, F-STATUS-PREFIX-005에서 enabled 확인 시 사용.
   */
  async findByGuildId(guildId: string): Promise<StatusPrefixConfigOrm | null> {
    return this.configRepo.findOne({
      where: { guildId },
      relations: { buttons: true },
      order: { buttons: { sortOrder: 'ASC' } },
    });
  }

  /**
   * 버튼 ID로 버튼 단건 조회.
   * 인터랙션 핸들러에서 버튼의 prefix, type 확인용으로 사용 (Unit B).
   */
  async findButtonById(buttonId: number): Promise<StatusPrefixButtonOrm | null> {
    return this.buttonRepo.findOne({
      where: { id: buttonId },
      relations: { config: true }, // prefixTemplate 조회를 위해 config 포함
    });
  }

  /**
   * 설정 upsert:
   *   1. guildId 기준으로 기존 레코드 조회
   *   2. 없으면 INSERT, 있으면 UPDATE
   *   3. 기존 buttons를 DELETE 후 새 buttons INSERT
   *
   * 트랜잭션 내에서 처리하여 부분 실패를 방지한다.
   * messageId는 upsert에서 초기화하지 않고 updateMessageId()로만 변경한다.
   */
  async upsert(guildId: string, dto: StatusPrefixConfigSaveDto): Promise<StatusPrefixConfigOrm> {
    return this.dataSource.transaction(async (manager) => {
      // 1. 기존 설정 조회
      let config = await manager.findOne(StatusPrefixConfigOrm, {
        where: { guildId },
      });

      if (config) {
        // 2a. 기존 설정 업데이트
        config.enabled = dto.enabled;
        config.channelId = dto.channelId ?? null;
        config.embedTitle = dto.embedTitle ?? null;
        config.embedDescription = dto.embedDescription ?? null;
        config.embedColor = dto.embedColor ?? null;
        config.prefixTemplate = dto.prefixTemplate;
        await manager.save(StatusPrefixConfigOrm, config);

        // 2b. 기존 버튼 전체 삭제 (CASCADE로 재삽입)
        await manager.delete(StatusPrefixButtonOrm, { configId: config.id });
      } else {
        // 3. 신규 생성
        config = manager.create(StatusPrefixConfigOrm, {
          guildId,
          enabled: dto.enabled,
          channelId: dto.channelId ?? null,
          embedTitle: dto.embedTitle ?? null,
          embedDescription: dto.embedDescription ?? null,
          embedColor: dto.embedColor ?? null,
          prefixTemplate: dto.prefixTemplate,
          messageId: null,
        });
        config = await manager.save(StatusPrefixConfigOrm, config);
      }

      // 4. 버튼 INSERT
      for (const btnDto of dto.buttons) {
        const button = manager.create(StatusPrefixButtonOrm, {
          configId: config.id,
          label: btnDto.label,
          emoji: btnDto.emoji ?? null,
          prefix: btnDto.prefix ?? null,
          type: btnDto.type,
          sortOrder: btnDto.sortOrder,
        });
        await manager.save(StatusPrefixButtonOrm, button);
      }

      // 5. 최종 상태를 relations 포함하여 반환
      return manager.findOneOrFail(StatusPrefixConfigOrm, {
        where: { id: config.id },
        relations: { buttons: true },
        order: { buttons: { sortOrder: 'ASC' } },
      });
    });
  }

  /**
   * Discord Embed 메시지 ID 및 마지막 반영 시각을 단일 UPDATE로 갱신.
   * F-STATUS-PREFIX-002: 메시지 전송 성공 직후 호출.
   * messageId와 lastAppliedAt을 1회 UPDATE로 묶어 정합성을 보장한다.
   */
  async updateMessageId(guildId: string, messageId: string, lastAppliedAt: Date): Promise<void> {
    await this.configRepo.update({ guildId }, { messageId, lastAppliedAt });
  }
}
