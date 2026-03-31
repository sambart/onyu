import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';

@Entity({ name: 'weekly_report_config', schema: 'public' })
@Index('IDX_weekly_report_config_enabled', ['isEnabled'])
export class WeeklyReportConfigOrmEntity {
  @PrimaryColumn()
  guildId: string;

  @Column({ default: false })
  isEnabled: boolean;

  @Column({ nullable: true })
  channelId: string | null;

  @Column({ type: 'int', default: 1 })
  dayOfWeek: number;

  @Column({ type: 'int', default: 9 })
  hour: number;

  @Column({ default: 'Asia/Seoul' })
  timezone: string;

  @UpdateDateColumn()
  updatedAt: Date;
}
