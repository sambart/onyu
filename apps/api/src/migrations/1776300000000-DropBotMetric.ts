import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class DropBotMetric1776300000000 implements MigrationInterface {
  name = 'DropBotMetric1776300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_bot_metric_recorded"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "public"."IDX_bot_metric_guild_recorded"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "bot_metric"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."bot_metric_status_enum"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."bot_metric_status_enum" AS ENUM('ONLINE', 'OFFLINE')`,
    );
    await queryRunner.query(
      `CREATE TABLE "bot_metric" ("id" SERIAL NOT NULL, "guildId" character varying NOT NULL, "status" "public"."bot_metric_status_enum" NOT NULL DEFAULT 'OFFLINE', "pingMs" integer NOT NULL DEFAULT '0', "heapUsedMb" double precision NOT NULL DEFAULT '0', "heapTotalMb" double precision NOT NULL DEFAULT '0', "voiceUserCount" integer NOT NULL DEFAULT '0', "guildCount" integer NOT NULL DEFAULT '0', "recordedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bot_metric" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_metric_guild_recorded" ON "bot_metric" ("guildId", "recordedAt")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_bot_metric_recorded" ON "bot_metric" ("recordedAt")`,
    );
  }
}
