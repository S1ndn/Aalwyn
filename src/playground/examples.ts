import basic from "../../examples/basic.aal?raw";
import distance from "../../examples/distance.aal?raw";
import conditional from "../../examples/conditionals.aal?raw";
import factorial from "../../examples/factorial.aal?raw";
import aggregations from "../../examples/aggregations.aal?raw";

// Introduce one concept at a time, from arithmetic to recursive and guarded constructions.
export const examples: Record<string, string> = {
  "Arithmetic": basic,
  "Function start": `fn f(real x) = 1
    *= x
    += 5
end
`,
  "Starting values": `// A header assignment and a body assignment both set the start value.
fn header(real x) = x
    >> sin
end

fn body(real x)
    = x
    >> sin
end
`,
  "Distance": distance,
  "Apply": `fn f(real x) = x
    >> sin
end
`,
  "Exponential": `fn f(real x) = x
    >> exp
end
`,
  "Logarithms": `fn f(real x ? x > 0) = x
    >> log2
end

fn g(real x ? x > 0) = x
    >> log10
end

fn h(real b ? b > 0 and b != 1, real x ? x > 0) = x
    >> log(b, me)
end
`,
  "Apply chain": `// Apply each transformation from left to right.
fn f(real x) = x
    >> me^2 + 1 >> cos >> sin
end
`,
  "Input domains": `// natural includes zero; combine a type with a constraint.
fn reciprocal(int n ? n > 0) = 1/n
end

fn logarithm(real x ? x > 0) = ln(x)
end
`,
  "Conditionals": conditional,
  "Equality": `fn equal(real a, real b) = 0
    += 1 ? (a == b)
end
`,
  "Modulo": `fn divisible(int x) = 0
    += 1 ? (x % 3 == 0)
end

fn remainder(int x) = x % 3
end
`,
  "Composition": `fn square(real x) = x^2
end

fn f(real a, real b) = square(a)
    += square(b)
    >> sqrt
end
`,
  "Auxiliaries": `// aux retains a named call in the exported mathematics.
aux fn square(real x) = x^2
end

fn f(real x) = square(x) + 1
end
`,
  "Factorial": factorial,
  "Gamma": `// Gamma extends factorial values beyond integer inputs.
fn realFactorial(real x ? x >= 0) = gamma(x + 1)
end

fn exponential(real x) = x
    += 1
    >> 5^me
end
`,
  "Aggregations": aggregations,
  "Definition blocks": `fn stirlingError(int n ? n >= 1)
    define stirling using (
        = n * ln(n)
        -= n
        += (1/2) * ln(2*pi*n)
    )

    = sum k from 1 to n (
        = k
        >> ln
    )
    -= stirling
end
`,
  "Combined syntax": `fn transform(real x ? x != 0) = x
    >> abs(me^2 - 5)
    += 1 ? (x > 0) and (x < 10) or (x == 20) else 2
end

fn sumSquares(natural n)
    = sum i from 1 to n (
        = i^2
    )
end
`,
  "Sequences": `seq w(k) = 1
    += 1 ? (k % 2 != 0)
end

fn g(int n ? n >= 1)
    define p using (
        = prod k from 1 to n (
            = k^w[k]
        )
    )
    define s sum k from 1 to n (
        = w[k]
    )
    = p
    ^= 1/s
end
`,
  "Sequence recurrence": `recursive seq fib(natural n)
    case 0 = 0
    case 1 = 1
    = fib[n-1] + fib[n-2]
end

fn fibonacci(natural n) = fib[n]
end
`,
  "Guarded domains": `// Inactive branches must not evaluate outside their domains.
fn r(real x) = 0
    += (-1/x) ? (x < 0)
    += ln(x) ? (x > 0)
end
`,
  "Inverse counting": `aux fn f(real x) = exp(x)
end

// Count samples below x to approximate ln(x) for x >= 1.
fn inv(real x ? x >= 1, int n ? n > 0)
    = sum i from 0 to floor(x*n) (
        define step i/n
        = 0
        += 1/n ? (f(step) < x)
    )
end
`,
};
