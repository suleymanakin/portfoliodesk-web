-- Migrate users table: email -> username
-- Mevcut email'den kullanıcı adı: @ öncesi kısım, özel karakterler _ yapılır, id eklenerek benzersizlik sağlanır.

-- 1. Yeni kolon ekle (nullable)
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "username" VARCHAR(100);

-- 2. Tüm satırları doldur: email'in @ öncesi + _ + id (benzersiz)
UPDATE "users" u
SET "username" = LOWER(
  REGEXP_REPLACE(
    COALESCE(SPLIT_PART(u."email", '@', 1), 'user'),
    '[^a-z0-9_]',
    '_',
    'g'
  )
) || '_' || u.id
WHERE u."username" IS NULL;

-- 3. admin@... olan ilk kaydı "admin" yap (diğer admin emailli kayıtlar admin_2, admin_3 kalır)
UPDATE "users"
SET "username" = 'admin'
WHERE id = (SELECT id FROM "users" WHERE "email" IS NOT NULL AND ("email" = 'admin@portfoliodesk.local' OR "email" LIKE 'admin@%') ORDER BY id LIMIT 1);

-- 4. Hâlâ null olanları user_id yap
UPDATE "users" SET "username" = 'user_' || id WHERE "username" IS NULL OR "username" = '';

-- 5. NOT NULL
ALTER TABLE "users" ALTER COLUMN "username" SET NOT NULL;

-- 6. UNIQUE (varsa önce kaldır, sonra ekle - migration tekrar çalışırsa diye)
ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_username_key";
ALTER TABLE "users" ADD CONSTRAINT "users_username_key" UNIQUE ("username");

-- 7. Eski email kolonunu kaldır
ALTER TABLE "users" DROP COLUMN IF EXISTS "email";
