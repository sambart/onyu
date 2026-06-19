import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddSuperAdminAuditLog1777300000000 implements MigrationInterface {
  name = 'AddSuperAdminAuditLog1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "audit_log" (
        "id"                 uuid         NOT NULL DEFAULT gen_random_uuid(),
        "adminDiscordUserId" character varying NOT NULL,
        "guildId"            character varying NULL,
        "httpMethod"         character varying(10) NOT NULL,
        "requestPath"        character varying(500) NOT NULL,
        "createdAt"          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_log" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_audit_log_admin" ON "audit_log" ("adminDiscordUserId")`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_audit_log_guild" ON "audit_log" ("guildId")`);
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_log_created_at" ON "audit_log" ("createdAt" DESC)`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "audit_log" IS '슈퍼 관리자 열람 감사 이력 (F-SUPER-ADMIN-006)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "audit_log"."adminDiscordUserId" IS '열람한 슈퍼 관리자 Discord user ID'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "audit_log"."guildId" IS '열람 대상 길드 ID. 길드 비특정 엔드포인트(/api/admin/guilds 등)는 NULL'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "audit_log"."httpMethod" IS 'HTTP 메서드 (GET, POST 등)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "audit_log"."requestPath" IS '요청 경로 (예: /api/guilds/123456789/voice/stats)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "audit_log"."createdAt" IS '요청 시각 (UTC, timezone-aware)'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_audit_log_created_at"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_log_guild"`);
    await queryRunner.query(`DROP INDEX "IDX_audit_log_admin"`);
    await queryRunner.query(`DROP TABLE "audit_log"`);
  }
}
