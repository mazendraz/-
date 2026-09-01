import { prisma } from "@/lib/prisma";
const [c, u, l, i] = await Promise.all([
  prisma.company.count(),
  prisma.customerUser.count(),
  prisma.lead.count(),
  prisma.customerIdentity.count(),
]);
console.log("companies", c, "| customers", u, "| leads", l, "| identities", i);
await prisma.$disconnect();
