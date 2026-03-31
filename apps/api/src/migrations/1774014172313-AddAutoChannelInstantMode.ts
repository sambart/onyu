import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAutoChannelInstantMode1774014172313 implements MigrationInterface {
  name = 'AddAutoChannelInstantMode1774014172313';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auto_channel_config" ADD "mode" character varying NOT NULL DEFAULT 'select'`,
    );
    await queryRunner.query(
      `ALTER TABLE "auto_channel_config" ADD "instantCategoryId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "auto_channel_config" ADD "instantNameTemplate" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "auto_channel_config" ALTER COLUMN "guideMessage" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "auto_channel_config" ALTER COLUMN "guideMessage" SET NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "auto_channel_config" DROP COLUMN "instantNameTemplate"`);
    await queryRunner.query(`ALTER TABLE "auto_channel_config" DROP COLUMN "instantCategoryId"`);
    await queryRunner.query(`ALTER TABLE "auto_channel_config" DROP COLUMN "mode"`);
  }
}
