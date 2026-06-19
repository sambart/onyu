import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity({ name: 'admin_user', schema: 'public' })
@Index('UQ_admin_user_discord', ['discordUserId'], { unique: true })
export class AdminUserOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar' })
  discordUserId: string;

  @Column({ type: 'varchar' })
  role: string; // 'super_admin' | 'bot_operator'

  @Column({ type: 'text', array: true, nullable: true })
  permissions: string[] | null;

  @Column({ type: 'varchar', nullable: true })
  grantedBy: string | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
