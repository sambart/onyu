import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMissionUseMicTime1777000000000 implements MigrationInterface {
  name = 'AddMissionUseMicTime1777000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "newbie_config" ADD "missionUseMicTime" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "newbie_config" DROP COLUMN "missionUseMicTime"`);
  }
}
