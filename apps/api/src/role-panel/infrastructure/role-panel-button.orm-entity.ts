import { RolePanelButtonMode, RolePanelButtonStyle } from '@onyu/shared';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { RolePanelConfigOrm } from './role-panel-config.orm-entity';

@Entity({ name: 'role_panel_button', schema: 'public' })
@Index('IDX_role_panel_button_panel_sort', ['panelId', 'sortOrder'])
export class RolePanelButtonOrm {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  panelId: number;

  @ManyToOne(() => RolePanelConfigOrm, (config) => config.buttons, {
    onDelete: 'CASCADE',
  })
  panel: RolePanelConfigOrm;

  @Column({ length: 80 })
  label: string;

  @Column({ type: 'varchar', nullable: true })
  emoji: string | null;

  @Column()
  roleId: string;

  @Column({
    type: 'enum',
    enum: RolePanelButtonMode,
    enumName: 'role_panel_button_mode_enum',
  })
  mode: RolePanelButtonMode;

  @Column({
    type: 'enum',
    enum: RolePanelButtonStyle,
    enumName: 'role_panel_button_style_enum',
    default: RolePanelButtonStyle.PRIMARY,
  })
  style: RolePanelButtonStyle;

  @Column({ default: 0 })
  sortOrder: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
