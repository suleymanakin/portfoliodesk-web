/**
 * Sadece admin kullanıcıyı oluşturur (veya günceller).
 * Kullanım: node scripts/create-admin.js
 * Env:
 * - ALLOW_CREATE_ADMIN=true
 * - ADMIN_USERNAME (optional, default: admin)
 * - ADMIN_PASSWORD (required)
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

if (process.env.ALLOW_CREATE_ADMIN !== 'true') {
  console.error('create-admin engellendi. Çalıştırmak için ALLOW_CREATE_ADMIN=true ayarlayın.');
  process.exit(1);
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_PASSWORD) {
  console.error('ADMIN_PASSWORD zorunludur.');
  process.exit(1);
}

async function main() {
  const hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { username: ADMIN_USERNAME },
    update: { passwordHash: hash, role: 'admin', isActive: true },
    create: {
      username: ADMIN_USERNAME,
      passwordHash: hash,
      role: 'admin',
      investorId: null,
      isActive: true,
    },
  });
  console.log('✅ Admin kullanıcı hazır.');
  console.log('   Kullanıcı adı:', user.username);
  console.log('   Şifre:       ', '(env üzerinden ayarlandı)');
}

main()
  .catch((e) => {
    console.error('Hata:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
