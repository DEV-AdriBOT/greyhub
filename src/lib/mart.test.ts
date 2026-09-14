import { describe, expect, it } from "vitest";
import { martTotal } from "./mart";

describe("Grey Mart checkout", () => {
  it("totals known products and applies the crew pass", () => {
    expect(martTotal(["apple", "bread"], false)).toBe(5.75);
    expect(martTotal(["apple", "bread"], true)).toBeCloseTo(5.175);
  });

  it("does not charge for an unknown product id", () => {
    expect(martTotal(["cookie", "not-on-the-shelf"], false)).toBe(1.75);
  });
});
