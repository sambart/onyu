import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { MissionStatus } from '../domain/newbie-mission.types';

@Entity({ name: 'newbie_mission', schema: 'public' })
@Index('IDX_newbie_mission_guild_member', ['guildId', 'memberId'])
@Index('IDX_newbie_mission_guild_status', ['guildId', 'status'])
@Index('IDX_newbie_mission_status_end_date', ['status', 'endDate'])
export class NewbieMissionOrmEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  guildId: string;

  @Column()
  memberId: string;

  @Column({ type: 'varchar', nullable: true })
  memberName: string | null;

  @Column()
  startDate: string;

  @Column()
  endDate: string;

  @Column()
  targetPlaytimeSec: number;

  @Column({ type: 'int', nullable: true })
  targetPlayCount: number | null;

  @Column({
    type: 'enum',
    enum: MissionStatus,
    default: MissionStatus.IN_PROGRESS,
  })
  status: MissionStatus;

  @Column({ default: false })
  hiddenFromEmbed: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
