import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddMusicChannelConfig1776100000000 implements MigrationInterface {
  name = 'AddMusicChannelConfig1776100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "music_channel_config" (
        "id" SERIAL NOT NULL,
        "guildId" character varying NOT NULL,
        "channelId" character varying NOT NULL,
        "messageId" character varying,
        "embedTitle" character varying,
        "embedDescription" text,
        "embedColor" character varying,
        "embedThumbnailUrl" character varying,
        "buttonConfig" jsonb NOT NULL,
        "enabled" boolean NOT NULL DEFAULT true,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_music_channel_config" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_music_channel_config_guild" ON "music_channel_config" ("guildId")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_music_channel_config_channel" ON "music_channel_config" ("channelId")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_music_channel_config_channel"`);
    await queryRunner.query(`DROP INDEX "public"."UQ_music_channel_config_guild"`);
    await queryRunner.query(`DROP TABLE "music_channel_config"`);
  }
}
