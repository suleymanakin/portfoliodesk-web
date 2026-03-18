// Prisma singleton — serverless (Vercel) ortamında globalThis ile tek instance
import { PrismaClient } from '@prisma/client';

const globalForPrisma = typeof globalThis !== 'undefined' ? globalThis : global;

const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
});

globalForPrisma.prisma = prisma;

export default prisma;
