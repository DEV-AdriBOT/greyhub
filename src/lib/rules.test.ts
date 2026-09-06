import { describe, expect, it } from "vitest";
import {
  crewLimit,
  orderStatusAfterAbandon,
  paymentSplitsAreValid,
  shouldSuspend,
} from "./rules";

describe("GreyHub work rules", () => {
  it("uses practical crew sizes", () => {
    expect(crewLimit("solo")).toBe(1);
    expect(crewLimit("dual")).toBe(2);
    expect(crewLimit("team")).toBe(5);
    expect(crewLimit("team", 30)).toBe(20);
    expect(crewLimit("solo", 9)).toBe(1);
  });

  it("suspends on the third ding", () => {
    expect(shouldSuspend(2)).toBe(false);
    expect(shouldSuspend(3)).toBe(true);
  });

  it("returns abandoned work to the board when the crew is empty", () => {
    expect(orderStatusAfterAbandon(0)).toBe("available");
    expect(orderStatusAfterAbandon(1)).toBe("claimed");
  });

  it("requires payment splits to match the recorded total", () => {
    expect(paymentSplitsAreValid(240, [145, 95])).toBe(true);
    expect(paymentSplitsAreValid(240, [120, 100])).toBe(false);
    expect(paymentSplitsAreValid(50, [60, -10])).toBe(false);
  });
});
