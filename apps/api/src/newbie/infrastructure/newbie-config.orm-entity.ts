import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'newbie_config', schema: 'public' })
@Index('UQ_newbie_config_guild', ['guildId'], { unique: true })
export class NewbieConfigOrmEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  guildId: string;

  // 환영인사 설정
  @Column({ default: false })
  welcomeEnabled: boolean;

  @Column({ type: 'varchar', nullable: true })
  welcomeChannelId: string | null;

  @Column({ type: 'varchar', nullable: true })
  welcomeEmbedTitle: string | null;

  @Column({ type: 'text', nullable: true })
  welcomeEmbedDescription: string | null;

  @Column({ type: 'varchar', nullable: true })
  welcomeEmbedColor: string | null;

  @Column({ type: 'varchar', nullable: true })
  welcomeEmbedThumbnailUrl: string | null;

  @Column({ type: 'text', nullable: true })
  welcomeContent: string | null;

  // 미션 설정
  @Column({ default: false })
  missionEnabled: boolean;

  @Column({ type: 'int', nullable: true })
  missionDurationDays: number | null;

  @Column({ type: 'int', nullable: true })
  missionTargetPlaytimeHours: number | null;

  @Column({ default: false })
  missionUseMicTime: boolean;

  @Column({ type: 'int', nullable: true })
  missionTargetPlayCount: number | null;

  @Column({ type: 'int', nullable: true })
  playCountMinDurationMin: number | null;

  @Column({ type: 'int', nullable: true })
  playCountIntervalMin: number | null;

  @Column({ type: 'varchar', nullable: true })
  missionNotifyChannelId: string | null;

  @Column({ type: 'varchar', nullable: true })
  missionNotifyMessageId: string | null;

  @Column({ type: 'varchar', nullable: true })
  missionEmbedTitle: string | null;

  @Column({ type: 'text', nullable: true })
  missionEmbedDescription: string | null;

  @Column({ type: 'varchar', nullable: true })
  missionEmbedColor: string | null;

  @Column({ type: 'varchar', nullable: true })
  missionEmbedThumbnailUrl: string | null;

  @Column({ type: 'enum', enum: ['EMBED', 'CANVAS'], default: 'EMBED' })
  missionDisplayMode: 'EMBED' | 'CANVAS';

  // 모코코 사냥 설정
  @Column({ default: false })
  mocoEnabled: boolean;

  @Column({ type: 'int', default: 30 })
  mocoNewbieDays: number;

  @Column({ default: false })
  mocoAllowNewbieHunter: boolean;

  @Column({ type: 'varchar', nullable: true })
  mocoRankChannelId: string | null;

  @Column({ type: 'varchar', nullable: true })
  mocoRankMessageId: string | null;

  @Column({ type: 'int', nullable: true })
  mocoAutoRefreshMinutes: number | null;

  @Column({ type: 'varchar', nullable: true })
  mocoEmbedTitle: string | null;

  @Column({ type: 'text', nullable: true })
  mocoEmbedDescription: string | null;

  @Column({ type: 'varchar', nullable: true })
  mocoEmbedColor: string | null;

  @Column({ type: 'varchar', nullable: true })
  mocoEmbedThumbnailUrl: string | null;

  @Column({ type: 'enum', enum: ['EMBED', 'CANVAS'], default: 'EMBED' })
  mocoDisplayMode: 'EMBED' | 'CANVAS';

  @Column({ type: 'int', nullable: true })
  mocoPlayCountMinDurationMin: number | null;

  @Column({ type: 'int', nullable: true })
  mocoPlayCountIntervalMin: number | null;

  @Column({ type: 'int', default: 10 })
  mocoMinCoPresenceMin: number;

  @Column({ type: 'int', default: 10 })
  mocoScorePerSession: number;

  @Column({ type: 'int', default: 1 })
  mocoScorePerMinute: number;

  @Column({ type: 'int', default: 5 })
  mocoScorePerUnique: number;

  @Column({ type: 'enum', enum: ['NONE', 'MONTHLY', 'CUSTOM'], default: 'NONE' })
  mocoResetPeriod: 'NONE' | 'MONTHLY' | 'CUSTOM';

  @Column({ type: 'int', nullable: true })
  mocoResetIntervalDays: number | null;

  @Column({ type: 'varchar', nullable: true })
  mocoCurrentPeriodStart: string | null;

  // 신입기간 역할 설정
  @Column({ default: false })
  roleEnabled: boolean;

  @Column({ type: 'int', nullable: true })
  roleDurationDays: number | null;

  @Column({ type: 'varchar', nullable: true })
  newbieRoleId: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
