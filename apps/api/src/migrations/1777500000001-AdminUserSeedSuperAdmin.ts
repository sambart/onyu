import { type MigrationInterface, type QueryRunner } from 'typeorm';

export class AdminUserSeedSuperAdmin1777500000001 implements MigrationInterface {
  name = 'AdminUserSeedSuperAdmin1777500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `INSERT INTO "admin_user" ("discordUserId","role","grantedBy","isActive")
       VALUES ('383635512252039168','super_admin','seed',true)
       ON CONFLICT ("discordUserId") DO NOTHING`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "admin_user" WHERE "discordUserId"='383635512252039168' AND "grantedBy"='seed'`,
    );
  }
}
