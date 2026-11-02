import type { MathExpr } from "./math-ir";
export const identifier = (s: string): string =>
  s.length === 1 ? s : `\\operatorname{${s.replaceAll("_", "\\_")}}`;
const indexIdentifier = (s: string): string => {
  const match = /^(.*)_([0-9]+)$/.exec(s);
  return match ? `${identifier(match[1])}_{${match[2]}}` : identifier(s);
};
function precedence(e: MathExpr): number {
  return e.kind === "add" || e.kind === "aggregate"
    ? 10
    : e.kind === "multiply"
      ? 20
      : e.kind === "power"
        ? 30
        : 40;
}
const wrap = (s: string) => `\\left(${s}\\right)`;
// Return a positive-form expression when a structural leading minus can be
// pulled outside. In particular, fractions must display -1/2 rather than +(-1)/2.
function negativeMagnitude(e: MathExpr): MathExpr | undefined {
  if (e.kind === "number" && e.value.startsWith("-")) return {...e, value: e.value.slice(1)};
  if (e.kind === "divide") {
    const left = negativeMagnitude(e.left), right = negativeMagnitude(e.right);
    if (Boolean(left) !== Boolean(right)) return {...e, left: left ?? e.left, right: right ?? e.right};
  }
  if (e.kind === "multiply" && e.terms.length) {
    const first = negativeMagnitude(e.terms[0]);
    if (first) {
      const terms = first.kind === "number" && first.value === "1" ? e.terms.slice(1) : [first, ...e.terms.slice(1)];
      return terms.length === 1 ? terms[0] : {kind: "multiply", terms};
    }
  }
  return undefined;
}
export function latex(
  e: MathExpr,
  parent = 0,
  aliases: ReadonlyMap<string, string> = new Map(),
): string {
  if (aliases.size) {
    const alias = aliases.get(JSON.stringify(e));
    if (alias) return alias;
  }
  const render = (value: MathExpr, precedence = 0) =>
    latex(value, precedence, aliases);
  let out: string;
  switch (e.kind) {
    case "number": {
      const parts = e.value.toLowerCase().split("e");
      out =
        parts.length === 2 ? `${parts[0]}\\times 10^{${parts[1]}}` : e.value;
      break;
    }
    case "symbol":
      out = e.label
        ? indexIdentifier(e.label)
        : (new Map([
            ["pi", "\\pi"],
            ["phi", "\\varphi"],
            ["e", "e"],
          ]).get(e.name) ?? identifier(e.name));
      break;
    case "aggregate":
      out = `\\${e.operator === "sum" ? "sum" : "prod"}_{${indexIdentifier(e.displayIndex)}=${render(e.lower)}}^{${render(e.upper)}}\\left(${render(e.body)}\\right)`;
      break;
    case "add":
      out = e.terms
        .map((t, i) => {
          const magnitude = negativeMagnitude(t);
          if (magnitude) return `${i ? " - " : "-"}${render(magnitude)}`;
          const s = render(t);
          return i ? (s.startsWith("-") ? ` - ${s.slice(1)}` : ` + ${s}`) : s;
        })
        .join("");
      break;
    case "multiply": {
      const terms = [...e.terms];
      let sign = "";
      if (terms[0]?.kind === "number" && terms[0].value === "-1") {
        sign = "-";
        terms.shift();
      }
      out = sign + terms.map((t, i) => {
        const text = render(t, 20);
        if (!i) return text;
        // Juxtapose algebraic factors; retain a dot before a numeric factor so
        // x*2 or two numeric literals cannot look like an index or one number.
        return `${t.kind === "number" ? " \\cdot " : "\\,"}${text}`;
      }).join("");
      break;
    }
    case "divide": {
      const magnitude = negativeMagnitude(e);
      out = magnitude && magnitude.kind === "divide"
        ? `-\\frac{${render(magnitude.left)}}{${render(magnitude.right)}}`
        : `\\frac{${render(e.left)}}{${render(e.right)}}`;
      break;
    }
    case "power": {
      let base = render(e.left, 31);
      if (
        e.left.kind === "number" &&
        (e.left.value.startsWith("-") ||
          e.left.value.toLowerCase().includes("e"))
      )
        base = wrap(render(e.left));
      out = `${base}^{${render(e.right)}}`;
      break;
    }
    case "function": {
      const a = e.args.map((x) => render(x)),
        x = a[0];
      if (e.sequence) out = `${identifier(e.name)}_{${a.join(", ")}}`;
      else if (e.name === "gamma") out = `\\Gamma${wrap(x)}`;
      else if (e.name === "atan") out = `\\arctan${wrap(x)}`;
      else if (e.name === "sqrt") out = `\\sqrt{${x}}`;
      else if (e.name === "factorial") {
        const argument = e.args[0];
        const atomic =
          argument.kind === "symbol" ||
          (argument.kind === "number" &&
            !argument.value.startsWith("-") &&
            !argument.value.toLowerCase().includes("e"));
        out = `${atomic ? x : wrap(x)}!`;
      } else if (e.name === "root") out = `\\sqrt[${x}]{${a[1]}}`;
      else if (e.name === "log") out = `\\log_{${a[0]}}${wrap(a[1])}`;
      else if (e.name === "log2" || e.name === "log10") out = `\\log_{${e.name === "log2" ? "2" : "10"}}${wrap(x)}`;
      else if (e.name === "abs") out = `\\left|${x}\\right|`;
      else if (e.name === "floor" || e.name === "ceil")
        out = `\\left\\l${e.name === "floor" ? "floor" : "ceil"} ${x} \\right\\r${e.name === "floor" ? "floor" : "ceil"}`;
      else
        out = `${["sin", "cos", "tan", "csc", "sec", "cot", "sinh", "cosh", "tanh", "ln", "exp", "min", "max", "arcsin", "arccos", "arctan"].includes(e.name) ? "\\" + e.name : identifier(e.name)}${wrap(a.join(", "))}`;
      break;
    }
  }
  return precedence(e) < parent ? wrap(out) : out;
}
