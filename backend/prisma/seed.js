import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import Decimal from 'decimal.js';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seed verisi yükleniyor...');

  // Admin kullanıcı (kullanıcı adı: admin, şifre: admin123)
  const adminUsername = 'admin';
  const adminPasswordHash = await bcrypt.hash('admin123', 10);
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
  console.log('✅ Admin kullanıcı: ' + adminUsername + ' / admin123');

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
