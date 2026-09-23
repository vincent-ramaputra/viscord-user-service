import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1789026197360 implements MigrationInterface {
  name = 'InitialSchema1789026197360';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."user_profile_status_enum" AS ENUM('0', '1', '2', '3', '4')`,
    );
    await queryRunner.query(
      `CREATE TABLE "user_profile" ("id" character varying NOT NULL, "username" character varying NOT NULL, "display_name" character varying NOT NULL, "pronouns" character varying, "bio" character varying, "status" "public"."user_profile_status_enum" NOT NULL DEFAULT '1', "avatarURL" character varying, "defaultAvatarURL" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_622345c51168e12eba4225a0217" UNIQUE ("username"), CONSTRAINT "PK_f44d0cd18cfd80b0fed7806c3b7" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."relationship_type_enum" AS ENUM('0', '1', '2', '3', '4')`,
    );
    await queryRunner.query(
      `CREATE TABLE "relationship" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "sender_id" character varying NOT NULL, "recipient_id" character varying NOT NULL, "type" "public"."relationship_type_enum" NOT NULL DEFAULT '0', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_67eb56a3f16da3d901a8ae446a6" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "relationship"`);
    await queryRunner.query(`DROP TYPE "public"."relationship_type_enum"`);
    await queryRunner.query(`DROP TABLE "user_profile"`);
    await queryRunner.query(`DROP TYPE "public"."user_profile_status_enum"`);
  }
}
