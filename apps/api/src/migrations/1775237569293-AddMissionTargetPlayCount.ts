import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissionTargetPlayCount1775237569293 implements MigrationInterface {
  name = 'AddMissionTargetPlayCount1775237569293';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "newbie_config" ADD "missionTargetPlayCount" integer`);
    await queryRunner.query(`ALTER TABLE "newbie_mission" ADD "targetPlayCount" integer`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "newbie_mission" DROP COLUMN "targetPlayCount"`);
    await queryRunner.query(`ALTER TABLE "newbie_config" DROP COLUMN "missionTargetPlayCount"`);
  }
}
