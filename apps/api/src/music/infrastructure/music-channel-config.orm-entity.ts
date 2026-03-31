import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export interface MusicButtonConfig {
  type: string;
  label: string;
  emoji: string;
  enabled: boolean;
  row: number;
}

export interface MusicButtonConfigJson {
  buttons: MusicButtonConfig[];
}

@Entity({ name: 'music_channel_config', schema: 'public' })
@Index('UQ_music_channel_config_guild', ['guildId'], { unique: true })
@Index('IDX_music_channel_config_channel', ['channelId'])
export class MusicChannelConfigOrm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  guildId: string;

  @Column()
  channelId: string;

  @Column({ type: 'varchar', nullable: true })
  messageId: string | null;

  @Column({ type: 'varchar', nullable: true })
  embedTitle: string | null;

  @Column({ type: 'text', nullable: true })
  embedDescription: string | null;

  @Column({ type: 'varchar', nullable: true })
  embedColor: string | null;

  @Column({ type: 'varchar', nullable: true })
  embedThumbnailUrl: string | null;

  @Column({ type: 'jsonb' })
  buttonConfig: MusicButtonConfigJson;

  @Column({ default: true })
  enabled: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
