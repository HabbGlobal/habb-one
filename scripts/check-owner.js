const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();
prisma.ownerAccount.findUnique({ where: { email: "owner@habbglobal.com" } })
  .then(r => console.log(r ? `Found: ${r.email} | Role: ${r.role} | ID: ${r.id}` : "NOT FOUND"))
  .finally(() => prisma.$disconnect());
