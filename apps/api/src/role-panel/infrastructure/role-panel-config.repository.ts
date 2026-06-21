import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import type { RolePanelButtonInputDto } from '../presentation/create-role-panel.dto';
import { RolePanelButtonOrm } from './role-panel-button.orm-entity';
import { RolePanelConfigOrm } from './role-panel-config.orm-entity';

@Injectable()
export class RolePanelConfigRepository {
  constructor(
    @InjectRepository(RolePanelConfigOrm)
    private readonly configRepo: Repository<RolePanelConfigOrm>,
    @InjectRepository(RolePanelButtonOrm)
    private readonly buttonRepo: Repository<RolePanelButtonOrm>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * guildId로 전체 패널 목록 조회 (버튼 관계 포함, sortOrder ASC).
   * 캐시 미스 워밍업 및 목록 API용.
   */
  async findByGuildId(guildId: string): Promise<RolePanelConfigOrm[]> {
    return this.configRepo.find({
      where: { guildId },
      relations: { buttons: true },
      order: { buttons: { sortOrder: 'ASC' } },
    });
  }

  /**
   * panelId + guildId로 단건 조회 (버튼 관계 포함).
   * guildId 소유 검증: 다른 길드 패널 ID 접근 차단.
   */
  async findByIdAndGuild(panelId: number, guildId: string): Promise<RolePanelConfigOrm | null> {
    return this.configRepo.findOne({
      where: { id: panelId, guildId },
      relations: { buttons: true },
      order: { buttons: { sortOrder: 'ASC' } },
    });
  }

  /**
   * 패널 생성 (트랜잭션: config INSERT + buttons INSERT).
   * published=false로 생성.
   */
  async createWithButtons(
    guildId: string,
    dto: {
      name: string;
      channelId?: string | null;
      embedTitle?: string | null;
      embedDescription?: string | null;
      embedColor?: string | null;
      buttons: RolePanelButtonInputDto[];
    },
  ): Promise<RolePanelConfigOrm> {
    return this.dataSource.transaction(async (manager) => {
      // 1. config INSERT
      let config = manager.create(RolePanelConfigOrm, {
        guildId,
        name: dto.name,
        channelId: dto.channelId ?? null,
        embedTitle: dto.embedTitle ?? null,
        embedDescription: dto.embedDescription ?? null,
        embedColor: dto.embedColor ?? null,
        messageId: null,
        published: false,
      });
      config = await manager.save(RolePanelConfigOrm, config);

      // 2. buttons INSERT
      for (const btnDto of dto.buttons) {
        const button = manager.create(RolePanelButtonOrm, {
          panelId: config.id,
          label: btnDto.label,
          emoji: btnDto.emoji ?? null,
          roleId: btnDto.roleId,
          mode: btnDto.mode,
          style: btnDto.style,
          sortOrder: btnDto.sortOrder,
        });
        await manager.save(RolePanelButtonOrm, button);
      }

      // 3. 최종 상태 반환 (relations 포함)
      return manager.findOneOrFail(RolePanelConfigOrm, {
        where: { id: config.id },
        relations: { buttons: true },
        order: { buttons: { sortOrder: 'ASC' } },
      });
    });
  }

  /**
   * 패널 수정 (트랜잭션: config UPDATE + buttons DELETE→INSERT 전체 교체).
   */
  async updateWithButtons(
    panelId: number,
    dto: {
      name: string;
      channelId?: string | null;
      embedTitle?: string | null;
      embedDescription?: string | null;
      embedColor?: string | null;
      buttons: RolePanelButtonInputDto[];
    },
  ): Promise<RolePanelConfigOrm> {
    return this.dataSource.transaction(async (manager) => {
      // 1. config 조회
      const config = await manager.findOne(RolePanelConfigOrm, { where: { id: panelId } });
      if (!config) {
        throw new NotFoundException(`RolePanelConfig id=${panelId} not found`);
      }

      // 2. config UPDATE
      config.name = dto.name;
      config.channelId = dto.channelId ?? null;
      config.embedTitle = dto.embedTitle ?? null;
      config.embedDescription = dto.embedDescription ?? null;
      config.embedColor = dto.embedColor ?? null;
      await manager.save(RolePanelConfigOrm, config);

      // 3. 기존 버튼 전체 삭제
      await manager.delete(RolePanelButtonOrm, { panelId: config.id });

      // 4. 새 버튼 INSERT
      for (const btnDto of dto.buttons) {
        const button = manager.create(RolePanelButtonOrm, {
          panelId: config.id,
          label: btnDto.label,
          emoji: btnDto.emoji ?? null,
          roleId: btnDto.roleId,
          mode: btnDto.mode,
          style: btnDto.style,
          sortOrder: btnDto.sortOrder,
        });
        await manager.save(RolePanelButtonOrm, button);
      }

      // 5. 최신 상태 반환
      return manager.findOneOrFail(RolePanelConfigOrm, {
        where: { id: config.id },
        relations: { buttons: true },
        order: { buttons: { sortOrder: 'ASC' } },
      });
    });
  }

  /**
   * Discord 메시지 ID, published 상태, lastAppliedAt stamp 갱신.
   * 게시/재게시/동기화 성공 직후 호출. lastAppliedAt 은 Discord 전송 성공 시점으로 기록된다.
   * 불변식: published=true 와 lastAppliedAt=now() 가 항상 함께 set 됨.
   */
  async updateMessageId(panelId: number, messageId: string, isPublished: boolean): Promise<void> {
    await this.configRepo.update(
      { id: panelId },
      { messageId, published: isPublished, lastAppliedAt: new Date() },
    );
  }

  /** 패널 삭제 (role_panel_button ON DELETE CASCADE로 자동 삭제). */
  async deleteById(panelId: number): Promise<void> {
    await this.configRepo.delete({ id: panelId });
  }
}
