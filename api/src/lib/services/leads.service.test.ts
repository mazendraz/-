import { describe, expect, it } from "vitest";
import { leadSearchWhere } from "@/lib/services/leads.service";

describe("leadSearchWhere", () => {
  it("returns an empty filter for blank/whitespace/undefined queries", () => {
    expect(leadSearchWhere(undefined)).toEqual({});
    expect(leadSearchWhere("")).toEqual({});
    expect(leadSearchWhere("   ")).toEqual({});
  });

  it("builds a case-insensitive OR across the searchable fields", () => {
    const where = leadSearchWhere("  Nasr  ");
    expect(where.OR).toEqual([
      { refNumber: { contains: "Nasr", mode: "insensitive" } },
      { customerName: { contains: "Nasr", mode: "insensitive" } },
      { phone: { contains: "Nasr", mode: "insensitive" } },
      { service: { contains: "Nasr", mode: "insensitive" } },
      { district: { contains: "Nasr", mode: "insensitive" } },
    ]);
  });

  it("trims the query before matching", () => {
    const where = leadSearchWhere(" AA-20260101-0001 ");
    const ref = where.OR?.[0] as { refNumber: { contains: string } };
    expect(ref.refNumber.contains).toBe("AA-20260101-0001");
  });
});
