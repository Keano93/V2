// Debug helper: print parsed messages. Usage: npx tsx scripts/dump-messages.ts [kind]
import { prisma } from "../src/lib/db";
import { formatIrish } from "../src/lib/time";

async function main() {
  const kind = process.argv[2];
  const msgs = await prisma.message.findMany({
    where: kind ? { sourceKind: kind } : {},
    include: { source: true },
    orderBy: [{ source: { filename: "asc" } }, { ordinal: "asc" }],
  });
  for (const m of msgs) {
    console.log(
      `${m.source.filename} | ${m.sender} | ${formatIrish(m.sentAt, m.timePrecision as "date")} | ${m.subject ?? ""} | ${m.body.replace(/\n/g, " / ").slice(0, 70)}`,
    );
  }
}
main().finally(() => prisma.$disconnect());
