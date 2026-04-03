import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { InactiveMemberGrade } from '../domain/inactive-member.types';

@Entity({ name: 'inactive_member_record', schema: 'public' })
@Index('UQ_inactive_member_record_guild_user', ['guildId', 'userId'], {
  unique: true,
})
@Index('IDX_inactive_member_record_guild_grade', ['guildId', 'grade'])
@Index('IDX_inactive_member_record_guild_last_voice', ['guildId', 'lastVoiceDate'])
export class InactiveMemberRecordOrm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  guildId: string;

  @Column()
  userId: string;

  @Column({ type: 'enum', enum: InactiveMemberGrade, nullable: true })
  grade: InactiveMemberGrade | null;

  @Column({ type: 'int', default: 0 })
  totalMinutes: number;

  @Column({ type: 'int', default: 0 })
  prevTotalMinutes: number;

  @Column({ type: 'varchar', length: 64, nullable: true })
  nickName: string | null;

  @Column({ type: 'date', nullable: true })
  lastVoiceDate: string | null;

  @Column({ type: 'timestamp', nullable: true })
  gradeChangedAt: Date | null;

  @Column({ type: 'timestamp' })
  classifiedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
