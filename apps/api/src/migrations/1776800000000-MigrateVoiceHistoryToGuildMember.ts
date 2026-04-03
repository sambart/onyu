import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class MigrateVoiceHistoryToGuildMember1776800000000 implements MigrationInterface {
  name = 'MigrateVoiceHistoryToGuildMember1776800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Step 0: member 테이블에서 guild_member로 시딩
    // channel.guildId가 있는 member만 매핑 가능. NULL guildId는 단일 길드 fallback 사용
    const fallbackGuild = await queryRunner.query(`
      SELECT "guildId" FROM "public"."channel"
      WHERE "guildId" IS NOT NULL
      LIMIT 1
    `);

    // channel.guildId가 NULL인 레코드의 guildId를 fallback으로 채움
    if (fallbackGuild.length > 0) {
      await queryRunner.query(
        `
        UPDATE "public"."channel"
        SET "guildId" = $1
        WHERE "guildId" IS NULL
      `,
        [fallbackGuild[0].guildId],
      );
    }

    // member → guild_member 시딩 (channel을 통해 guildId 추출)
    await queryRunner.query(`
      INSERT INTO "public"."guild_member"
        ("guildId", "userId", "displayName", "username", "avatarUrl", "isBot", "isActive")
      SELECT DISTINCT
        c."guildId",
        m."discordMemberId",
        m."nickName",
        m."nickName",
        m."avatarUrl",
        false,
        true
      FROM "public"."member" m
      JOIN "public"."voice_channel_history" vch ON vch."memberId" = m.id
      JOIN "public"."channel" c ON c.id = vch."channelId"
      WHERE c."guildId" IS NOT NULL
      ON CONFLICT ("guildId", "userId") DO NOTHING
    `);

    // Step 1: guildMemberId 컬럼 추가 (NULL 허용으로 시작)
    await queryRunner.query(`
      ALTER TABLE "public"."voice_channel_history"
        ADD COLUMN "guildMemberId" bigint NULL
    `);

    // Step 2: 기존 memberId 기반으로 guildMemberId backfill
    await queryRunner.query(`
      UPDATE "public"."voice_channel_history" vch
      SET "guildMemberId" = gm.id
      FROM "public"."member" m,
           "public"."channel" c,
           "public"."guild_member" gm
      WHERE vch."memberId" = m.id
        AND c.id = vch."channelId"
        AND gm."userId" = m."discordMemberId"
        AND gm."guildId" = c."guildId"
    `);

    // Step 3: NOT NULL 전환
    await queryRunner.query(`
      ALTER TABLE "public"."voice_channel_history"
        ALTER COLUMN "guildMemberId" SET NOT NULL
    `);

    // Step 4: FK 설정
    await queryRunner.query(`
      ALTER TABLE "public"."voice_channel_history"
        ADD CONSTRAINT "FK_voice_channel_history_guild_member"
        FOREIGN KEY ("guildMemberId") REFERENCES "public"."guild_member"(id)
        ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // Step 5: 기존 FK 제거 후 memberId 컬럼 DROP
    await queryRunner.query(`
      ALTER TABLE "public"."voice_channel_history"
        DROP CONSTRAINT IF EXISTS "FK_vch_member"
    `);

    await queryRunner.query(`
      ALTER TABLE "public"."voice_channel_history"
        DROP COLUMN "memberId"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // memberId 컬럼 재추가
    await queryRunner.query(`
      ALTER TABLE "public"."voice_channel_history"
        ADD COLUMN "memberId" integer NULL
    `);

    // guildMemberId 기반으로 memberId backfill
    await queryRunner.query(`
      UPDATE "public"."voice_channel_history" vch
      SET "memberId" = m.id
      FROM "public"."guild_member" gm,
           "public"."member" m
      WHERE vch."guildMemberId" = gm.id
        AND m."discordMemberId" = gm."userId"
    `);

    // memberId NOT NULL 복원
    await queryRunner.query(`
      ALTER TABLE "public"."voice_channel_history"
        ALTER COLUMN "memberId" SET NOT NULL
    `);

    // 기존 FK 복원
    await queryRunner.query(`
      ALTER TABLE "public"."voice_channel_history"
        ADD CONSTRAINT "FK_vch_member"
        FOREIGN KEY ("memberId") REFERENCES "public"."member"(id)
        ON DELETE NO ACTION ON UPDATE NO ACTION
    `);

    // guildMemberId FK 제거 및 컬럼 DROP
    await queryRunner.query(`
      ALTER TABLE "public"."voice_channel_history"
        DROP CONSTRAINT IF EXISTS "FK_voice_channel_history_guild_member"
    `);

    await queryRunner.query(`
      ALTER TABLE "public"."voice_channel_history"
        DROP COLUMN "guildMemberId"
    `);
  }
}
