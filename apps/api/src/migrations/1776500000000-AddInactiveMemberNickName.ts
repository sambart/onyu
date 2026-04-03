import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddInactiveMemberNickName1776500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "inactive_member_record"
      ADD COLUMN "nickName" varchar(64) NULL
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_inactive_member_record_guild_nickname"
      ON "inactive_member_record" ("guildId", "nickName")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_inactive_member_record_guild_nickname"`);
    await queryRunner.query(`ALTER TABLE "inactive_member_record" DROP COLUMN "nickName"`);
  }
}
