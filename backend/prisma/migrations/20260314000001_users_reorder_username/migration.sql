-- users tablosunda username kolonunu id'den hemen sonraya (başa) taşı
-- PostgreSQL kolon sırası için tablo yeniden oluşturulur

-- 1. Yeni tablo (kolon sırası: id, username, password_hash, ...)
CREATE TABLE "users_new" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "role" VARCHAR(20) NOT NULL,
    "investor_id" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_new_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "users_new_username_key" ON "users_new"("username");
CREATE UNIQUE INDEX "users_new_investor_id_key" ON "users_new"("investor_id");

ALTER TABLE "users_new" ADD CONSTRAINT "users_new_investor_id_fkey"
    FOREIGN KEY ("investor_id") REFERENCES "investors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Veriyi kopyala
INSERT INTO "users_new" ("id", "username", "password_hash", "role", "investor_id", "isActive", "createdAt", "updatedAt")
SELECT "id", "username", "password_hash", "role", "investor_id", "isActive", "createdAt", "updatedAt"
FROM "users";

-- 3. Sequence'i güncelle
SELECT setval(pg_get_serial_sequence('users_new', 'id'), COALESCE((SELECT MAX("id") FROM "users_new"), 1));

-- 4. Eski tabloyu kaldır, yeniyi adlandır
DROP TABLE "users";

ALTER TABLE "users_new" RENAME TO "users";
ALTER INDEX "users_new_pkey" RENAME TO "users_pkey";
ALTER INDEX "users_new_username_key" RENAME TO "users_username_key";
ALTER INDEX "users_new_investor_id_key" RENAME TO "users_investor_id_key";
ALTER TABLE "users" RENAME CONSTRAINT "users_new_investor_id_fkey" TO "users_investor_id_fkey";
