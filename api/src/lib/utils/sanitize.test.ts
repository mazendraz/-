import { describe, expect, it } from "vitest";
import { sanitizedText, stripHtml } from "@/lib/utils/sanitize";
import { createLeadSchema } from "@/lib/validation/leads";

describe("stripHtml", () => {
  it("removes tags but keeps their text", () => {
    expect(stripHtml("<b>Hello</b> <i>world</i>")).toBe("Hello world");
  });

  it("drops script/style blocks entirely", () => {
    expect(stripHtml("Hi<script>alert('x')</script> there")).toBe("Hi there");
    expect(stripHtml("<style>.a{color:red}</style>Clean")).toBe("Clean");
  });

  it("trims surrounding whitespace", () => {
    expect(stripHtml("  <p>padded</p>  ")).toBe("padded");
  });
});

describe("sanitizedText", () => {
  const schema = sanitizedText(10, 100);

  it("strips markup before applying length bounds", () => {
    const out = schema.parse("<p>This is clean text.</p>");
    expect(out).toBe("This is clean text.");
  });

  it("rejects values that are only markup (empty after strip)", () => {
    expect(schema.safeParse("<br><br>").success).toBe(false);
  });
});

describe("lead description sanitization (integration with schema)", () => {
  it("persists a tag-free description", () => {
    const parsed = createLeadSchema.parse({
      companySlug: "aura-interiors",
      companyName: "Aura",
      service: "Design",
      name: "Mona Adel",
      phone: "01012345678",
      district: "R7",
      budget: "EGP 100k",
      description: "Please call me <script>steal()</script> about a full villa fit-out.",
    });
    expect(parsed.description).not.toContain("<");
    expect(parsed.description).not.toContain("steal()");
    expect(parsed.description).toContain("full villa fit-out");
  });
});
