import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class SettingsApplyLastAppliedAtInit1777600000000 implements MigrationInterface {
  name = 'SettingsApplyLastAppliedAtInit1777600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "status_prefix_config" ADD COLUMN "lastAppliedAt" TIMESTAMPTZ NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "sticky_message_config" ADD COLUMN "lastAppliedAt" TIMESTAMPTZ NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_panel_config" ADD COLUMN "lastAppliedAt" TIMESTAMPTZ NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "auto_channel_config" ADD COLUMN "lastSavedAt" TIMESTAMPTZ NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auto_channel_config" DROP COLUMN IF EXISTS "lastSavedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_panel_config" DROP COLUMN IF EXISTS "lastAppliedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "sticky_message_config" DROP COLUMN IF EXISTS "lastAppliedAt"`,
    );
    await queryRunner.query(
      `ALTER TABLE "status_prefix_config" DROP COLUMN IF EXISTS "lastAppliedAt"`,
    );
  }
}
