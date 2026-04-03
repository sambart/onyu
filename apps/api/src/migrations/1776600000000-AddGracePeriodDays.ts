import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddGracePeriodDays1776600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inactive_member_config"
      ADD COLUMN "gracePeriodDays" int NOT NULL DEFAULT 7
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "inactive_member_config" DROP COLUMN "gracePeriodDays"`);
  }
}
