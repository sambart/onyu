import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'sticky_message_config', schema: 'public' })
@Index('IDX_sticky_message_guild', ['guildId'])
@Index('IDX_sticky_message_guild_channel_sort', ['guildId', 'channelId', 'sortOrder'])
export class StickyMessageConfigOrm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  guildId: string;

  @Column()
  channelId: string;

  @Column({ type: 'varchar', nullable: true })
  embedTitle: string | null;

  @Column({ type: 'text', nullable: true })
  embedDescription: string | null;

  @Column({ type: 'varchar', nullable: true })
  embedColor: string | null;

  @Column({ type: 'varchar', nullable: true })
  messageId: string | null;

  @Column({ default: true })
  enabled: boolean;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true, default: () => 'NULL' })
  lastAppliedAt: Date | null;
}
