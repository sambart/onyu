import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AddMocoDisplayMode1775229756004 implements MigrationInterface {
  name = 'AddMocoDisplayMode1775229756004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."newbie_config_mocodisplaymode_enum" AS ENUM('EMBED', 'CANVAS')`,
    );
    await queryRunner.query(
      `ALTER TABLE "newbie_config" ADD "mocoDisplayMode" "public"."newbie_config_mocodisplaymode_enum" NOT NULL DEFAULT 'EMBED'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "newbie_config" DROP COLUMN "mocoDisplayMode"`);
    await queryRunner.query(`DROP TYPE "public"."newbie_config_mocodisplaymode_enum"`);
  }
}
