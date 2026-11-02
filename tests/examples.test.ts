import { describe, expect, it } from "vitest";
import { compile, evaluateFunction, parse } from "../src/compiler/compiler";
import { examples } from "../src/playground/examples";
import { diagnoseSource } from "../src/playground/diagnostics";

describe("bundled examples", () => {
  for (const [name, source] of Object.entries(examples)) {
    it(`${name} compiles every declaration without implicit starts or diagnostics`, () => {
      expect(diagnoseSource(source)).toEqual([]);
      for (const declaration of parse(source).functions) {
        expect(() => compile(source, declaration.name)).not.toThrow();
      }
    });
  }

  it("builds product terms directly and preserves the empty product identity", () => {
    const model = compile(examples.Aggregations, "productRange");
    expect(evaluateFunction(model, { n: 4 })).toBe(24);
    expect(evaluateFunction(model, { n: 0 })).toBe(1);
  });

  it("preserves distance and inactive-branch behavior with explicit starts", () => {
    expect(evaluateFunction(compile(examples.Distance), { ax: 0, ay: 0, bx: 3, by: 4 })).toBe(5);
    const guarded = compile(examples["Guarded domains"]);
    expect(evaluateFunction(guarded, { x: -2 })).toBe(0.5);
    expect(evaluateFunction(guarded, { x: 0 })).toBe(0);
    expect(evaluateFunction(guarded, { x: 1 })).toBe(0);
  });
});
