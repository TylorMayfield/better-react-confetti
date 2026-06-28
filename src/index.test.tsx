import { describe, expect, it } from "vitest";
import { Circle, Rectangle, Triangle } from "./index";

describe("shape helpers", () => {
  it("returns lightweight marker elements for canvas descriptors", () => {
    expect(Rectangle({ color: "red" }).props["data-confetti-shape"]).toBe("rect");
    expect(Circle({ color: "blue" }).props["data-confetti-shape"]).toBe("circle");
    expect(Triangle({ color: "green" }).props["data-confetti-shape"]).toBe("triangle");
  });
});
