import { describe, expect, it } from "vitest";
import { highlightTree, tags } from "@lezer/highlight";
import { language, colors } from "../src/playground/editor";
import { builtins } from "../src/compiler/semantic";

function colored(source: string) {
  const spans: { text: string; style: string }[] = [];
  highlightTree(language.parser.parse(source), colors, (from, to, style) => {
    spans.push({ text: source.slice(from, to), style });
  });
  return spans;
}

describe("live editor builtin highlighting", () => {
  it("uses the intended function color for every builtin in calls and apply", () => {
    const functionStyle = colors.style([tags.standard(tags.function(tags.variableName))])!;
    for (const name of Object.keys(builtins)) {
      expect(colored(`${name}(x)`)[0]).toEqual({ text: name, style: functionStyle });
      expect(colored(`>> ${name}`).find(s => s.text === name)?.style).toBe(functionStyle);
    }
  });
  it("does not color builtin prefixes or comment contents as functions", () => {
    expect(colored("sinValue")[0].style).not.toBe(colored("sin(x)")[0].style);
    expect(colored("// sin(x)")[0].text).toBe("// sin(x)");
    expect(colored("// sin(x)")[0].style).not.toBe(colored("sin(x)")[0].style);
  });
});

it("colors starting equals like apply while preserving comparison and arrow colors", () => {
  const control = colors.style([tags.controlOperator]);
  const operator = colors.style([tags.operator]);
  const tokens = colored("fn f(x) = 1\n    = 2\n    >> sin\n    += 1 ? (x == 0)\nfn g(x) => x");
  expect(tokens.filter(t => t.text === "=").map(t => t.style)).toEqual([control, control]);
  expect(tokens.find(t => t.text === ">>")?.style).toBe(control);
  for (const token of ["==", "=>"]) expect(tokens.find(t => t.text === token)?.style).toBe(operator);
});

it("colors conditional question marks like initialization and apply", () => {
  const control = colors.style([tags.controlOperator]);
  const tokens = colored("fn f(x ? x >= 0) = 1\n += x ? (x > 0) else 2\n >> sin");
  expect(tokens.filter(t => t.text === "?").map(t => t.style)).toEqual([control,control]);
  expect(tokens.find(t => t.text === "=")?.style).toBe(control);
  expect(tokens.find(t => t.text === ">>")?.style).toBe(control);
  expect(tokens.find(t => t.text === ">=")?.style).not.toBe(control);
});
