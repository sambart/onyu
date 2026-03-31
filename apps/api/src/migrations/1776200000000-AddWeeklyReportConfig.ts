import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddWeeklyReportConfig1776200000000 implements MigrationInterface {
  name = 'AddWeeklyReportConfig1776200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "weekly_report_config" (
        "guildId" character varying NOT NULL,
        "isEnabled" boolean NOT NULL DEFAULT false,
        "channelId" character varying,
        "dayOfWeek" integer NOT NULL DEFAULT 1,
        "hour" integer NOT NULL DEFAULT 9,
        "timezone" character varying NOT NULL DEFAULT 'Asia/Seoul',
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_weekly_report_config" PRIMARY KEY ("guildId")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_weekly_report_config_enabled" ON "weekly_report_config" ("isEnabled")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_weekly_report_config_enabled"`);
    await queryRunner.query(`DROP TABLE "weekly_report_config"`);
  }
}
