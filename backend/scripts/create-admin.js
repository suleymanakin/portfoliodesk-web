/**
 * Sadece admin kullanıcıyı oluşturur (veya günceller).
 * Kullanım: node scripts/create-admin.js
 * Giriş: admin / admin123
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const ADMIN_USERNAME = 'admin';
const ADMIN_PASSWORD = 'admin123';

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
  console.log('   Şifre:       ', ADMIN_PASSWORD);
}

main()
  .catch((e) => {
    console.error('Hata:', e.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
