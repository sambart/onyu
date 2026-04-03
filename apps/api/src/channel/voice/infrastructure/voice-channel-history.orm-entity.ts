import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { GuildMemberOrmEntity } from '../../../guild-member/infrastructure/guild-member.orm-entity';
import { ChannelOrm } from '../../infrastructure/channel.orm-entity';

// IDX_voice_channel_history_member_join (guildMemberId, joinedAt DESC) — 마이그레이션으로 생성
@Entity({ name: 'voice_channel_history', schema: 'public' })
export class VoiceChannelHistoryOrm {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => ChannelOrm, (channel) => channel.voiceHistories)
  channel: ChannelOrm;

  @ManyToOne(() => GuildMemberOrmEntity)
  guildMember: GuildMemberOrmEntity;

  @Column({ name: 'joinAt', type: 'timestamp', nullable: false })
  joinedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  leftAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get duration(): number | null {
    if (this.joinedAt && this.leftAt) {
      return Math.floor((+this.leftAt - +this.joinedAt) / 1000);
    }
    return null;
  }
}
