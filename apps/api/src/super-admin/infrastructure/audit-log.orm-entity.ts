import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'audit_log', schema: 'public' })
@Index('IDX_audit_log_admin', ['adminDiscordUserId'])
@Index('IDX_audit_log_guild', ['guildId'])
@Index('IDX_audit_log_created_at', ['createdAt'])
export class AuditLogOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  adminDiscordUserId: string;

  @Column({ type: 'varchar', nullable: true })
  guildId: string | null;

  @Column({ type: 'varchar', length: 10 })
  httpMethod: string;

  @Column({ type: 'varchar', length: 500 })
  requestPath: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
