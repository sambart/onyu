import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissionDisplayMode1775243721093 implements MigrationInterface {
  name = 'AddMissionDisplayMode1775243721093';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."newbie_config_missiondisplaymode_enum" AS ENUM('EMBED', 'CANVAS')`,
    );
    await queryRunner.query(
      `ALTER TABLE "newbie_config" ADD "missionDisplayMode" "public"."newbie_config_missiondisplaymode_enum" NOT NULL DEFAULT 'EMBED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "newbie_config" DROP COLUMN "missionDisplayMode"`);
    await queryRunner.query(`DROP TYPE "public"."newbie_config_missiondisplaymode_enum"`);
  }
}
