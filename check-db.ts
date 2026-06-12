import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({ datasourceUrl: process.env.DIRECT_URL });

async function main() {
  const tables = await prisma.$queryRawUnsafe(`SELECT tablename FROM pg_tables WHERE schemaname='public'`);
  console.log("Tables in public schema:", tables);
}

main().catch(console.error).finally(() => prisma.$disconnect());
