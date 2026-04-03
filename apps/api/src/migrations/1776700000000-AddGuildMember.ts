import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddGuildMember1776700000000 implements MigrationInterface {
  name = 'AddGuildMember1776700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "guild_member" (
        "id"          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        "guildId"     varchar NOT NULL,
        "userId"      varchar NOT NULL,
        "displayName" varchar NOT NULL,
        "username"    varchar NOT NULL,
        "nick"        varchar NULL,
        "avatarUrl"   varchar NULL,
        "isBot"       boolean NOT NULL DEFAULT false,
        "joinedAt"    timestamp NULL,
        "isActive"    boolean NOT NULL DEFAULT true,
        "createdAt"   timestamp NOT NULL DEFAULT now(),
        "updatedAt"   timestamp NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_guild_member_guild_user" UNIQUE ("guildId", "userId")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_guild_member_guild_active"
        ON "guild_member" ("guildId")
        WHERE "isActive" = true
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_guild_member_guild_joined"
        ON "guild_member" ("guildId", "joinedAt")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_guild_member_user"
        ON "guild_member" ("userId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_guild_member_user"`);
    await queryRunner.query(`DROP INDEX "IDX_guild_member_guild_joined"`);
    await queryRunner.query(`DROP INDEX "IDX_guild_member_guild_active"`);
    await queryRunner.query(`DROP TABLE "guild_member"`);
  }
}
