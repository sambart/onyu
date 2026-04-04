import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddAutoChannelButtonGrouping1776500000000 implements MigrationInterface {
  name = 'AddAutoChannelButtonGrouping1776500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "voice_daily" ADD COLUMN "autoChannelButtonId" integer`);
    await queryRunner.query(
      `ALTER TABLE "voice_daily" ADD COLUMN "autoChannelButtonLabel" character varying(255)`,
    );

    // 버튼 단위 그룹핑 조회 최적화 (partial index)
    await queryRunner.query(
      `CREATE INDEX "IDX_voice_daily_auto_button" ON "voice_daily" ("guildId", "autoChannelButtonId", "date") WHERE "autoChannelButtonId" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_voice_daily_auto_button"`);
    await queryRunner.query(`ALTER TABLE "voice_daily" DROP COLUMN "autoChannelButtonLabel"`);
    await queryRunner.query(`ALTER TABLE "voice_daily" DROP COLUMN "autoChannelButtonId"`);
  }
}
