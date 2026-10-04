import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOutboxTable1790254187586 implements MigrationInterface {
  name = 'CreateOutboxTable1790254187586';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."outbox_event_enum" AS ENUM('FriendRequestSent', 'FriendRequestAccepted', 'FriendRemoved')`,
    );
    await queryRunner.query(
      `CREATE TABLE "outbox" ("id" BIGSERIAL NOT NULL, "event" "public"."outbox_event_enum" NOT NULL, "data" jsonb NOT NULL, "published_at" TIMESTAMP, CONSTRAINT "PK_340ab539f309f03bdaa14aa7649" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "outbox"`);
    await queryRunner.query(`DROP TYPE "public"."outbox_event_enum"`);
  }
}
