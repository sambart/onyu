import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { RolePanelButtonOrm } from './role-panel-button.orm-entity';

@Entity({ name: 'role_panel_config', schema: 'public' })
@Index('IDX_role_panel_config_guild', ['guildId'])
export class RolePanelConfigOrm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  guildId: string;

  @Column()
  name: string;

  @Column({ type: 'varchar', nullable: true })
  channelId: string | null;

  @Column({ type: 'varchar', nullable: true })
  messageId: string | null;

  @Column({ type: 'varchar', nullable: true })
  embedTitle: string | null;

  @Column({ type: 'text', nullable: true })
  embedDescription: string | null;

  @Column({ type: 'varchar', length: 7, nullable: true })
  embedColor: string | null;

  @Column({ default: false })
  published: boolean;

  @OneToMany(() => RolePanelButtonOrm, (button) => button.panel)
  buttons: RolePanelButtonOrm[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
