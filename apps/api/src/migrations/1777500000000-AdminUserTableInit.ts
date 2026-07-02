import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AdminUserTableInit1777500000000 implements MigrationInterface {
  name = 'AdminUserTableInit1777500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "admin_user" (
        "id"            uuid         NOT NULL DEFAULT gen_random_uuid(),
        "discordUserId" character varying NOT NULL,
        "role"          character varying NOT NULL,
        "permissions"   text[]       NULL,
        "grantedBy"     character varying NULL,
        "isActive"      boolean      NOT NULL DEFAULT true,
        "createdAt"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_admin_user" PRIMARY KEY ("id")
      )`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_admin_user_discord" ON "admin_user" ("discordUserId")`,
    );

    await queryRunner.query(
      `COMMENT ON TABLE "admin_user" IS '플랫폼 관리자 (super_admin / bot_operator) 계정 (F-SUPER-ADMIN-001)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "admin_user"."discordUserId" IS 'Discord Snowflake ID — UNIQUE, NOT NULL'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "admin_user"."role" IS 'super_admin | bot_operator'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "admin_user"."permissions" IS 'NULL=role 기본 scope, []=전체 차단, [...]= override (F-SUPER-ADMIN-003-B)'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "admin_user"."grantedBy" IS '부여자 Discord ID 또는 "seed"'`,
    );
    await queryRunner.query(
      `COMMENT ON COLUMN "admin_user"."isActive" IS 'false=논리 삭제(비활성화) — 물리 삭제 금지 (F-SUPER-ADMIN-008)'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_admin_user_discord"`);
    await queryRunner.query(`DROP TABLE "admin_user"`);
  }
}
