import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddRolePanel1777400000000 implements MigrationInterface {
  name = 'AddRolePanel1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // role_panel_config
    await queryRunner.query(
      `CREATE TABLE "role_panel_config" ("id" SERIAL NOT NULL, "guildId" character varying NOT NULL, "name" character varying NOT NULL, "channelId" character varying, "messageId" character varying, "embedTitle" character varying, "embedDescription" text, "embedColor" character varying(7), "published" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_role_panel_config" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_role_panel_config_guild" ON "role_panel_config" ("guildId") `,
    );

    // role_panel_button enums
    await queryRunner.query(
      `CREATE TYPE "public"."role_panel_button_mode_enum" AS ENUM('GRANT', 'TOGGLE')`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."role_panel_button_style_enum" AS ENUM('PRIMARY', 'SECONDARY', 'SUCCESS', 'DANGER')`,
    );

    // role_panel_button
    await queryRunner.query(
      `CREATE TABLE "role_panel_button" ("id" SERIAL NOT NULL, "panelId" integer NOT NULL, "label" character varying(80) NOT NULL, "emoji" character varying, "roleId" character varying NOT NULL, "mode" "public"."role_panel_button_mode_enum" NOT NULL, "style" "public"."role_panel_button_style_enum" NOT NULL DEFAULT 'PRIMARY', "sortOrder" integer NOT NULL DEFAULT '0', "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_role_panel_button" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_role_panel_button_panel_sort" ON "role_panel_button" ("panelId", "sortOrder") `,
    );
    await queryRunner.query(
      `ALTER TABLE "role_panel_button" ADD CONSTRAINT "FK_role_panel_button_panel" FOREIGN KEY ("panelId") REFERENCES "role_panel_config"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "role_panel_button" DROP CONSTRAINT "FK_role_panel_button_panel"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_role_panel_button_panel_sort"`);
    await queryRunner.query(`DROP TABLE "role_panel_button"`);
    await queryRunner.query(`DROP TYPE "public"."role_panel_button_style_enum"`);
    await queryRunner.query(`DROP TYPE "public"."role_panel_button_mode_enum"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_role_panel_config_guild"`);
    await queryRunner.query(`DROP TABLE "role_panel_config"`);
  }
}
