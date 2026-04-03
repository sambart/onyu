import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, In, LessThan, Repository } from 'typeorm';

import { MissionStatus } from '../domain/newbie-mission.types';
import { NewbieMissionOrmEntity as NewbieMission } from './newbie-mission.orm-entity';

@Injectable()
export class NewbieMissionRepository {
  constructor(
    @InjectRepository(NewbieMission)
    private readonly repo: Repository<NewbieMission>,
  ) {}

  /** 미션 레코드 생성 */
  async create(
    guildId: string,
    memberId: string,
    startDate: string,
    endDate: string,
    targetPlaytimeSec: number,
    memberName?: string | null,
  ): Promise<NewbieMission> {
    const mission = this.repo.create({
      guildId,
      memberId,
      memberName: memberName ?? null,
      startDate,
      endDate,
      targetPlaytimeSec,
      status: MissionStatus.IN_PROGRESS,
    });
    return this.repo.save(mission);
  }

  /**
   * 길드의 IN_PROGRESS 미션 목록 조회
   * IDX_newbie_mission_guild_status 인덱스 활용
   */
  async findActiveByGuild(guildId: string): Promise<NewbieMission[]> {
    return this.repo.find({ where: { guildId, status: MissionStatus.IN_PROGRESS } });
  }

  /**
   * 멤버의 IN_PROGRESS 미션 조회 (단건)
   * IDX_newbie_mission_guild_member 인덱스 활용
   */
  async findActiveByMember(guildId: string, memberId: string): Promise<NewbieMission | null> {
    return this.repo.findOne({
      where: { guildId, memberId, status: MissionStatus.IN_PROGRESS },
    });
  }

  /**
   * 만료된 IN_PROGRESS 미션 전체 조회
   * IDX_newbie_mission_status_end_date 인덱스 활용
   * today는 YYYYMMDD 형식 문자열
   */
  async findExpired(today: string): Promise<NewbieMission[]> {
    return this.repo.find({
      where: { status: MissionStatus.IN_PROGRESS, endDate: LessThan(today) },
    });
  }

  /** 미션 상태 갱신 (COMPLETED / FAILED) */
  async updateStatus(id: number, status: MissionStatus): Promise<void> {
    await this.repo.update(id, { status });
  }

  /** memberName 갱신 */
  async updateMemberName(id: number, memberName: string): Promise<void> {
    await this.repo.update(id, { memberName });
  }

  /** 미션 단건 조회 */
  async findById(id: number): Promise<NewbieMission | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** 미션 레코드 삭제 */
  async delete(id: number): Promise<void> {
    await this.repo.delete(id);
  }

  /** hiddenFromEmbed 플래그 갱신 */
  async updateHidden(id: number, hidden: boolean): Promise<void> {
    await this.repo.update(id, { hiddenFromEmbed: hidden });
  }

  /**
   * 길드의 Embed 표시 대상 미션 조회 (IN_PROGRESS / COMPLETED / FAILED, hiddenFromEmbed = false).
   * 탈퇴(LEFT) 미션은 Embed에 표시하지 않는다.
   */
  async findVisibleByGuild(guildId: string): Promise<NewbieMission[]> {
    return this.repo.find({
      where: {
        guildId,
        status: In([MissionStatus.IN_PROGRESS, MissionStatus.COMPLETED, MissionStatus.FAILED]),
        hiddenFromEmbed: false,
      },
    });
  }

  /**
   * 길드 미션 통합 조회 (모든 상태, 페이지네이션 + 상태 필터 옵션).
   * status가 없으면 전체 상태를 조회한다.
   */
  async findByGuild(
    guildId: string,
    status: MissionStatus | undefined,
    page: number,
    pageSize: number,
  ): Promise<{ items: NewbieMission[]; total: number }> {
    const where: FindOptionsWhere<NewbieMission> = { guildId };
    if (status) {
      where.status = status;
    }

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
    return { items, total };
  }

  /** 특정 멤버에게 미션이 존재하는지 확인 (상태 무관) */
  async hasMission(guildId: string, memberId: string): Promise<boolean> {
    const count = await this.repo.count({ where: { guildId, memberId } });
    return count > 0;
  }

  /**
   * 길드 내 미션이 존재하는 모든 멤버 ID 조회 (상태 무관).
   * registerMissingMembers에서 중복 미션 방지에 사용.
   */
  async findMemberIdsWithMission(guildId: string): Promise<string[]> {
    const rows = await this.repo
      .createQueryBuilder('m')
      .select('DISTINCT m.memberId', 'memberId')
      .where('m.guildId = :guildId', { guildId })
      .getRawMany<{ memberId: string }>();
    return rows.map((r) => r.memberId);
  }

  /**
   * 길드의 미션 상태별 카운트 집계.
   * headerTemplate의 {inProgressCount}, {completedCount}, {failedCount} 변수 렌더링에 사용.
   */
  async countByStatusForGuild(guildId: string): Promise<Record<MissionStatus, number>> {
    const rows = await this.repo
      .createQueryBuilder('m')
      .select('m.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .where('m.guildId = :guildId', { guildId })
      .groupBy('m.status')
      .getRawMany<{ status: MissionStatus; count: string }>();

    const result: Record<MissionStatus, number> = {
      [MissionStatus.IN_PROGRESS]: 0,
      [MissionStatus.COMPLETED]: 0,
      [MissionStatus.FAILED]: 0,
      [MissionStatus.LEFT]: 0,
    };
    for (const row of rows) {
      result[row.status] = parseInt(row.count, 10);
    }
    return result;
  }
}
