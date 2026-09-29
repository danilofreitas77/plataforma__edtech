import { describe, expect, it } from "vitest";
import { cn } from "./utils";

describe("cn", () => {
  it("junta classes e resolve conflitos do Tailwind", () => {
    expect(cn("px-2 py-1", "px-4")).toBe("py-1 px-4");
  });

  it("ignora valores falsos", () => {
    const hidden = false;
    expect(cn("a", hidden && "b", undefined, null, "c")).toBe("a c");
  });
});
