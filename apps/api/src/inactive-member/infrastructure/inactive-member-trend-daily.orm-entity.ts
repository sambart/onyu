import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'inactive_member_trend_daily', schema: 'public' })
@Index('UQ_inactive_trend_daily_guild_date', ['guildId', 'date'], { unique: true })
@Index('IDX_inactive_trend_daily_guild_date', ['guildId', 'date'])
export class InactiveMemberTrendDailyOrm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  guildId: string;

  @Column({ type: 'date' })
  date: string;

  @Column({ type: 'int', default: 0 })
  fullyInactiveCount: number;

  @Column({ type: 'int', default: 0 })
  lowActiveCount: number;

  @Column({ type: 'int', default: 0 })
  decliningCount: number;

  @Column({ type: 'int', default: 0 })
  totalClassified: number;

  @CreateDateColumn()
  createdAt: Date;
}
