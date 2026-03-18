import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

async function main() {
  if (process.env.ALLOW_SEED !== 'true') {
    console.error('Seed engellendi. Çalıştırmak için ALLOW_SEED=true ayarlayın.');
    process.exit(1);
  }

  console.log('🌱 Seed verisi yükleniyor...');

  // Admin kullanıcı (env ile belirlenmeli)
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword) {
    console.error('ADMIN_PASSWORD zorunludur (seed).');
    process.exit(1);
  }
  const adminPasswordHash = await bcrypt.hash(adminPassword, 10);
  await prisma.user.upsert({
    where: { username: adminUsername },
    update: {},
    create: {
      username: adminUsername,
      passwordHash: adminPasswordHash,
      role: 'admin',
      investorId: null,
      isActive: true,
    },
  });
  console.log('✅ Admin kullanıcı hazır: ' + adminUsername);

  // Örnek yatırımcılar
  const investors = [
    {
      name: 'Ahmet Yılmaz',
      initialCapital: new Decimal('500000'),
      currentCapital: new Decimal('500000'),
      commissionRate: new Decimal('20'),
      billingDay: 15,
      isActive: true,
    },
    {
      name: 'Ayşe Kaya',
      initialCapital: new Decimal('250000'),
      currentCapital: new Decimal('250000'),
      commissionRate: new Decimal('15'),
      billingDay: null,
      isActive: true,
    },
    {
      name: 'Mehmet Demir',
      initialCapital: new Decimal('1000000'),
      currentCapital: new Decimal('1000000'),
      commissionRate: new Decimal('25'),
      billingDay: 10,
      isActive: true,
    },
  ];

  for (const inv of investors) {
    await prisma.investor.upsert({
      where: { id: investors.indexOf(inv) + 1 },
      update: {},
      create: inv,
    });
  }

  console.log(`✅ ${investors.length} yatırımcı eklendi.`);
  console.log('\n💡 Not: Gerçek veri için uygulamadan günlük giriş yapınız.');
}

main()
  .catch((e) => {
    console.error('Seed hatası:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
