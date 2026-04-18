import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddInactiveMemberTrendDaily1776900000000 implements MigrationInterface {
  name = 'AddInactiveMemberTrendDaily1776900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "inactive_member_trend_daily" (
        "id" SERIAL NOT NULL,
        "guildId" character varying NOT NULL,
        "date" date NOT NULL,
        "fullyInactiveCount" integer NOT NULL DEFAULT '0',
        "lowActiveCount" integer NOT NULL DEFAULT '0',
        "decliningCount" integer NOT NULL DEFAULT '0',
        "totalClassified" integer NOT NULL DEFAULT '0',
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inactive_member_trend_daily" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_inactive_trend_daily_guild_date" ON "inactive_member_trend_daily" ("guildId", "date")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_inactive_trend_daily_guild_date" ON "inactive_member_trend_daily" ("guildId", "date" DESC)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_inactive_trend_daily_guild_date"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_inactive_trend_daily_guild_date"`);
    await queryRunner.query(`DROP TABLE "inactive_member_trend_daily"`);
  }
}
