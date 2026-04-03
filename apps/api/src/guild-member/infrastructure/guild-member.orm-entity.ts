import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'guild_member', schema: 'public' })
@Index('UQ_guild_member_guild_user', ['guildId', 'userId'], { unique: true })
@Index('IDX_guild_member_guild_joined', ['guildId', 'joinedAt'])
@Index('IDX_guild_member_user', ['userId'])
export class GuildMemberOrmEntity {
  @PrimaryGeneratedColumn('identity', { type: 'bigint' })
  id: number;

  @Column({ type: 'varchar' })
  guildId: string;

  @Column({ type: 'varchar' })
  userId: string;

  @Column({ type: 'varchar' })
  displayName: string;

  @Column({ type: 'varchar' })
  username: string;

  @Column({ type: 'varchar', nullable: true })
  nick: string | null;

  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'boolean', default: false })
  isBot: boolean;

  @Column({ type: 'timestamp', nullable: true })
  joinedAt: Date | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
