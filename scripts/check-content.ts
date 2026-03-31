import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
const connectionString = process.env.DATABASE_URL as string;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const docs = await prisma.document.findMany({
    select: { id: true, name: true, fileType: true, caseId: true, contentJson: true },
    orderBy: [{ caseId: "asc" }, { id: "asc" }],
  });
  
  for (const d of docs) {
    const arr = d.contentJson as unknown[];
    const paraCount = Array.isArray(arr) ? arr.length : 0;
    const line = [d.caseId, d.id, d.name.slice(0,42), d.fileType, paraCount + " paras"].join(" | ");
    console.log(line);
  }
  
  await prisma.$disconnect();
}
main();
