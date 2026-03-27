import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddAutoChannelGrouping1776400000000 implements MigrationInterface {
  name = 'AddAutoChannelGrouping1776400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // voice_daily 테이블에 자동방 그룹핑 컬럼 추가
    await queryRunner.query(
      `ALTER TABLE "voice_daily" ADD COLUMN "channelType" character varying(20) NOT NULL DEFAULT 'permanent'`,
    );
    await queryRunner.query(`ALTER TABLE "voice_daily" ADD COLUMN "autoChannelConfigId" integer`);
    await queryRunner.query(
      `ALTER TABLE "voice_daily" ADD COLUMN "autoChannelConfigName" character varying(255)`,
    );

    // 자동방 config 단위 그룹핑 조회 최적화 (partial index)
    await queryRunner.query(
      `CREATE INDEX "IDX_voice_daily_auto_config" ON "voice_daily" ("guildId", "autoChannelConfigId", "date") WHERE "autoChannelConfigId" IS NOT NULL`,
    );

    // channelType 필터링 최적화 (partial index — permanent 제외)
    await queryRunner.query(
      `CREATE INDEX "IDX_voice_daily_channel_type" ON "voice_daily" ("guildId", "date") WHERE "channelType" != 'permanent'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_voice_daily_channel_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_voice_daily_auto_config"`);
    await queryRunner.query(`ALTER TABLE "voice_daily" DROP COLUMN "autoChannelConfigName"`);
    await queryRunner.query(`ALTER TABLE "voice_daily" DROP COLUMN "autoChannelConfigId"`);
    await queryRunner.query(`ALTER TABLE "voice_daily" DROP COLUMN "channelType"`);
  }
}
