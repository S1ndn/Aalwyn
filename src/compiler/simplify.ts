import { num, type MathExpr } from "./math-ir";
import { isTotal, substitute } from "./domain";
type Rational = [bigint, bigint];
const gcd = (a: bigint, b: bigint): bigint =>
  b ? gcd(b, a % b) : a < 0n ? -a : a;
export function rational(e: MathExpr): Rational | undefined {
  if (e.kind === "divide") {
    const a = rational(e.left),
      b = rational(e.right);
    if (a && b && b[0] !== 0n) return [a[0] * b[1], a[1] * b[0]];
    return;
  }
  if (e.kind !== "number") return;
  const [mantissa, exponent = "0"] = e.value.toLowerCase().split("e");
  const scale = Number(exponent);
  // Avoid allocating unbounded integer powers for hostile numeric literals.
  if (
    !Number.isSafeInteger(scale) ||
    Math.abs(scale) > 1000 ||
    mantissa.length > 2000
  )
    return;
  const decimals = (mantissa.split(".")[1] ?? "").length;
  const digits = BigInt(mantissa.replace(".", ""));
  return scale >= decimals
    ? [digits * 10n ** BigInt(scale - decimals), 1n]
    : [digits, 10n ** BigInt(decimals - scale)];
}
function exact([n, d]: Rational): MathExpr {
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  n /= g;
  d /= g;
  return d === 1n
    ? num(String(n))
    : { kind: "divide", left: num(String(n)), right: num(String(d)) };
}
const is = (e: MathExpr, n: bigint) => {
  const r = rational(e);
  return r !== undefined && r[0] === n * r[1];
};

// Multiplication is commutative: collect E*C and C*E as the same term.
function termKey(e: MathExpr): string {
  if (e.kind === "add" || e.kind === "multiply")
    return JSON.stringify([e.kind, e.terms.map(termKey).sort()]);
  if (e.kind === "power" || e.kind === "divide") return JSON.stringify([e.kind, termKey(e.left), termKey(e.right)]);
  if (e.kind === "function") return JSON.stringify([e.kind, e.name, e.args.map(termKey)]);
  return JSON.stringify(e);
}

function collectFactors(factors: MathExpr[]): MathExpr[] {
  const groups = new Map<string, {base: MathExpr; exponent: bigint}>();
  for (const factor of factors) {
    const exponent = factor.kind === "power" ? rational(factor.right) : undefined;
    // Only merge positive integer powers. Fractional, zero, and negative
    // exponents have additional domain rules that must remain intact.
    const base = exponent && exponent[1] === 1n && exponent[0] > 0n ? (factor as Extract<MathExpr, {kind: "power"}>).left : factor;
    const count = base === factor ? 1n : exponent![0];
    const key = termKey(base);
    const previous = groups.get(key);
    if (previous) previous.exponent += count;
    else groups.set(key, {base, exponent: count});
  }
  return [...groups.values()].map(({base, exponent}) => exponent === 1n ? base : {kind: "power", left: base, right: num(String(exponent))});
}

function coefficientAndBase(term: MathExpr): {coefficient: Rational; base: MathExpr} {
  if (term.kind === "divide") {
    const denominator = rational(term.right);
    if (denominator && denominator[0] !== 0n) {
      const numerator = coefficientAndBase(term.left);
      return {coefficient: [numerator.coefficient[0] * denominator[1], numerator.coefficient[1] * denominator[0]], base: numerator.base};
    }
  }
  if (term.kind === "multiply") {
    let coefficient: Rational = [1n, 1n];
    const symbolic: MathExpr[] = [];
    for (const factor of term.terms) {
      const numeric = rational(factor);
      const part = numeric ? {coefficient: numeric, base: num(1)} : coefficientAndBase(factor);
      coefficient = [coefficient[0] * part.coefficient[0], coefficient[1] * part.coefficient[1]];
      if (!is(part.base, 1n)) symbolic.push(...(part.base.kind === "multiply" ? part.base.terms : [part.base]));
    }
    return {coefficient, base: symbolic.length === 1 ? symbolic[0] : {kind: "multiply", terms: symbolic}};
  }
  return {coefficient: [1n, 1n], base: term};
}

/** Extract only shared symbolic factors. Numeric distribution remains a
 * separate rule, so factoring cannot oscillate with scalar expansion.
 */
function factorCommon(terms: MathExpr[]): MathExpr | undefined {
  if (terms.length < 2) return;
  const factors = terms.map((term) =>
    term.kind === "multiply" ? [...term.terms] : [term],
  );
  const common: MathExpr[] = [];
  const parts = (factor: MathExpr): {base: MathExpr; exponent: bigint} => {
    const exponent = factor.kind === "power" ? rational(factor.right) : undefined;
    return factor.kind === "power" && exponent && exponent[1] === 1n && exponent[0] > 0n
      ? {base: factor.left, exponent: exponent[0]}
      : {base: factor, exponent: 1n};
  };
  for (const factor of [...factors[0]]) {
    const {base} = parts(factor);
    if (rational(base)) continue;
    const key = termKey(base);
    const indices = factors.map(group => group.findIndex(item => termKey(parts(item).base) === key));
    if (indices.some(index => index === -1)) continue;
    const exponents = factors.map((group, i) => parts(group[indices[i]]).exponent);
    const shared = exponents.reduce((a, b) => a < b ? a : b);
    common.push(shared === 1n ? base : {kind: "power", left: base, right: num(String(shared))});
    factors.forEach((group, i) => {
      const remaining = exponents[i] - shared;
      if (remaining === 0n) group.splice(indices[i], 1);
      else group[indices[i]] = remaining === 1n ? base : {kind: "power", left: base, right: num(String(remaining))};
    });
  }
  if (!common.length) return;
  const remainders: MathExpr[] = factors.map((group) =>
    group.length === 0
      ? num(1)
      : group.length === 1
        ? group[0]
        : { kind: "multiply", terms: group },
  );
  return simplify({
    kind: "multiply",
    terms: [...common, simplify({ kind: "add", terms: remainders })],
  });
}

export function simplify(e: MathExpr): MathExpr {
  if (e.kind === "number") {
    const r = rational(e);
    return r ? exact(r) : e;
  }
  if (e.kind === "symbol") return e;
  if (e.kind === "aggregate") {
    const lower = simplify(e.lower),
      upper = simplify(e.upper);
    const a = rational(lower),
      b = rational(upper);
    if (a && b && a[1] === 1n && b[1] === 1n) {
      if (a[0] > b[0]) return num(e.operator === "sum" ? 0 : 1);
      if (a[0] === b[0])
        return simplify(substitute(e.body, new Map([[e.index, lower]])));
    }
    return { ...e, lower, upper, body: simplify(e.body) };
  }
  if (e.kind === "function") {
    const args = e.args.map(simplify);
    if (
      e.name === "ceil" &&
      args.length === 1 &&
      args[0].kind === "divide" &&
      args[0].right.kind === "symbol" &&
      args[0].right.name === "pi" &&
      args[0].left.kind === "function" &&
      args[0].left.name === "atan" &&
      args[0].left.args.length === 1
    ) {
      const value = rational(args[0].left.args[0]);
      if (value) return num(value[0] * value[1] > 0n ? 1 : 0);
    }
    if (e.name === "atan" && args.length === 1) {
      const value = rational(args[0]);
      if (value && value[0] === 0n) return num(0);
    }
    if (e.name === "gamma" && args.length === 1) {
      const value = rational(args[0]);
      if (value && value[1] === 1n && value[0] > 0n && value[0] <= 201n)
        return simplify({
          kind: "function",
          name: "factorial",
          args: [num(String(value[0] - 1n))],
        });
    }
    if (e.name === "factorial" && args.length === 1) {
      const value = rational(args[0]);
      // Exact BigInt folding for modest constants. Larger factorials remain
      // symbolic instead of producing enormous output or blocking the editor.
      if (value && value[1] === 1n && value[0] >= 0n && value[0] <= 200n) {
        let result = 1n;
        for (let i = 2n; i <= value[0]; i++) result *= i;
        return num(String(result));
      }
    }
    if (e.name === "mod" && args.length === 2) {
      const a = rational(args[0]),
        b = rational(args[1]);
      if (a && b && b[0] !== 0n) {
        let numerator = a[0] * b[1],
          denominator = a[1] * b[0];
        if (denominator < 0n) {
          numerator = -numerator;
          denominator = -denominator;
        }
        const quotient =
          numerator / denominator -
          (numerator < 0n && numerator % denominator !== 0n ? 1n : 0n);
        return exact([a[0] * b[1] - quotient * b[0] * a[1], a[1] * b[1]]);
      }
    }
    if (e.name === "abs" && args.length === 1) {
      const arg = args[0];
      if (arg.kind === "function" && arg.name === "abs") return arg;
      if (arg.kind === "multiply") {
        const coefficient = rational(arg.terms[0]);
        if (coefficient && coefficient[0] < 0n)
          return simplify({
            ...e,
            args: [
              {
                kind: "multiply",
                terms: [
                  exact([-coefficient[0], coefficient[1]]),
                  ...arg.terms.slice(1),
                ],
              },
            ],
          });
      }
    }
    const value = args.length === 1 ? rational(args[0]) : undefined;
    if (value) {
      const [n, d] = value;
      if (e.name === "abs") return exact([n < 0n ? -n : n, d]);
      // BigInt division truncates toward zero. Adjust to mathematical rounding.
      if (e.name === "floor")
        return num(String(n / d - (n < 0n && n % d !== 0n ? 1n : 0n)));
      if (e.name === "ceil")
        return num(String(n / d + (n > 0n && n % d !== 0n ? 1n : 0n)));
    }
    return { ...e, args };
  }
  if (e.kind === "add" || e.kind === "multiply") {
    const kind = e.kind,
      terms = e.terms
        .map(simplify)
        .flatMap((t) => (t.kind === kind ? t.terms : [t]));
    let total: Rational = kind === "add" ? [0n, 1n] : [1n, 1n];
    const rest: MathExpr[] = [];
    for (const t of terms) {
      const r = rational(t);
      if (!r) {
        rest.push(t);
        continue;
      }
      total =
        kind === "add"
          ? [total[0] * r[1] + r[0] * total[1], total[1] * r[1]]
          : [total[0] * r[0], total[1] * r[1]];
      const g = gcd(...total);
      total = [total[0] / g, total[1] / g];
    }
    if (kind === "multiply") rest.splice(0, rest.length, ...collectFactors(rest));
    // Zero multiplication must not conceal a partial factor: 0*ln(-1)
    // is still undefined. Symbols and expressions proven total may vanish.
    if (kind === "multiply" && total[0] === 0n && rest.every((t) => isTotal(t)))
      return num(0);
    // Expand only a numeric scalar times one sum. This handles negation and
    // subtraction without expanding arbitrary products into large polynomials.
    if (kind === "multiply" && rest.length === 1 && rest[0].kind === "add") {
      return simplify({
        kind: "add",
        terms: rest[0].terms.map((term) => ({
          kind: "multiply",
          terms: [exact(total), term],
        })),
      });
    }
    if (kind === "add") {
      const groups = new Map<
        string,
        { coefficient: Rational; base: MathExpr; original: MathExpr; count: number }
      >();
      for (const term of rest) {
        const {coefficient, base} = coefficientAndBase(term);
        const key = termKey(base);
        const previous = groups.get(key);
        const [n, d] = coefficient;
        if (previous) {
          const [pn, pd] = previous.coefficient;
          const numerator = pn * d + n * pd,
            denominator = pd * d;
          const g = gcd(numerator, denominator);
          previous.coefficient = [numerator / g, denominator / g];
          previous.count++;
        } else groups.set(key, { coefficient: [n, d], base, original: term, count: 1 });
      }
      rest.length = 0;
      for (const { coefficient, base, original, count } of groups.values()) {
        if (count === 1) { rest.push(original); continue; }
        if (coefficient[0] === 0n) {
          if (!isTotal(base))
            rest.push({ kind: "multiply", terms: [num(0), base] });
          continue;
        }
        rest.push(
          coefficient[0] === coefficient[1]
            ? base
            : simplify({ kind: "multiply", terms: [exact(coefficient), base] }),
        );
      }
    }
    if (kind === "add" ? total[0] !== 0n : total[0] !== total[1]) {
      if (kind === "add" && total[0] < 0n) rest.push(exact(total));
      else rest.unshift(exact(total));
    }
    if (!rest.length) return num(kind === "add" ? 0 : 1);
    // Collect quotient factors into a single fraction, retaining every
    // denominator: (A/B)*C -> (A*C)/B. This also exposes the quotient to
    // subsequent division flattening, as in ((A/B)*C)/D -> (A*C)/(B*D).
    if (kind === "multiply") {
      const index = rest.findIndex(
        (term) =>
          term.kind === "divide" && !rational(term),
      );
      if (index >= 0) {
        const reciprocal = rest[index];
        if (reciprocal.kind === "divide")
          return simplify({
            kind: "divide",
            left: {
              kind: "multiply",
              terms: rest.flatMap((term, i) => i === index ? [reciprocal.left] : [term]),
            },
            right: reciprocal.right,
          });
      }
    }
    if (kind === "add") {
      const factored = factorCommon(rest);
      if (factored) return factored;
    }
    return rest.length === 1 ? rest[0] : { kind, terms: rest };
  }
  const left = simplify(e.left),
    right = simplify(e.right),
    a = rational(left),
    b = rational(right);
  if (e.kind === "divide") {
    // Flatten only a numerator quotient: both original denominator factors
    // remain in the new denominator, preserving their nonzero restrictions.
    // A/(B/C) needs extra care at C=0 and is deliberately left intact.
    if (left.kind === "divide")
      return simplify({kind: "divide", left: left.left,
        right: {kind: "multiply", terms: [left.right, right]}});
    if (is(right, 1n)) return left;
    if (a && b && b[0] !== 0n) return exact([a[0] * b[1], a[1] * b[0]]);
  } else {
    if (is(right, 1n)) return left;
    if (a && a[0] !== 0n && is(right, 0n)) return num(1);
    if (
      a &&
      b &&
      b[1] === 1n &&
      b[0] >= 0n &&
      b[0] <= 100n &&
      !(a[0] === 0n && b[0] === 0n)
    )
      return exact([a[0] ** b[0], a[1] ** b[0]]);
  }
  return { ...e, left, right };
}
