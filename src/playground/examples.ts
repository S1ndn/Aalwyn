import distance from "../../examples/distance.aal?raw";
import basic from "../../examples/basic.aal?raw";
import conditional from "../../examples/conditionals.aal?raw";
export const examples: Record<string, string> = {
  Distance: distance,
  "Sequence recurrence": "recursive seq fib(natural n)\n    case 0 = 0\n    case 1 = 1\n    = fib[n-1] + fib[n-2]\nend\n\nfn fibonacci(natural n) => fib[n]",
  Sequences: "seq w(k) = 1\n    += 1 ? (k % 2 != 0)\nend\n\nfn g(int n ? n >= 1)\n    define p using (\n        = prod k from 1 to n (\n            = k^w[k]\n        )\n    )\n    define s sum k from 1 to n (\n        = w[k]\n    )\n    = p\n    ^= 1/s\nend",
  "Definition blocks": "fn stirlingError(int n ? n >= 1)\n    define stirling using (\n        = n * ln(n)\n        -= n\n        += (1/2) * ln(2*pi*n)\n    )\n\n    = sum k from 1 to n (\n        = k\n        >> ln\n    )\n    -= stirling\nend",
  Logarithms: "fn f(real x ? x > 0) = x\n    >> log2\nend\n\nfn g(real x ? x > 0) = x\n    >> log10\nend\n\nfn h(real b ? b > 0 and b != 1, real x ? x > 0) = x\n    >> log(b, me)\nend",
  "Apply chain": "fn f(x) = x\n    >> me^2+1 >> cos >> sin\nend",
  "Function start": "fn f(x) = 1\n    *= x\n    += 5\nend",
  "Zero-start blocks":
    "fn repeatedFive(natural n)\n    += prod i from 1 to n (\n        = 5\n    )\nend\n\nfn f(x)\n    += x\n    >> sin\nend",
  "New syntax":
    "fn transform(real x ? x != 0)\n    += x\n    >> abs(((me ^ 2) - 5))\n    += 1 ? (((x > 0) and (x < 10)) or (x == 20)) else 2\nend\n\nfn sumSquares(natural n)\n    += sum i from 1 to n (\n        += (i ^ 2)\n    )\nend\n",
  Arithmetic: basic,
  Conditionals: conditional,
  Composition:
    "fn square(real x) => (x ^ 2)\n\nfn f(real a, real b)\n    += square(a)\n    += square(b)\n    >> sqrt(me)\nend\n",
  Apply: "fn f(real x)\n    += x\n    >> log(10, me)\nend\n",
  Equality: "fn equal(real a, real b)\n    += 1 ? (a == b)\nend\n",
  Auxiliaries:
    "aux fn square(real x) => (x ^ 2)\n\nfn f(real x) => (square(x) + 1)\n",
  "Inverse counting":
    "aux fn f(real x) => (e ^ x)\n\nfn inv(real x, int n ? (x >= 1) and (n > 0))\n    += sum i from 0 to floor((x * n)) (\n        define step (i / n)\n        += (1 / n) ? (f(step) < x)\n    )\nend\n",
  "Input domains":
    "// natural includes zero; combine a type with a constraint.\n\nfn harmonic(int z ? z > 0)\n    += sum i from 1 to z (\n        += (1 / i)\n    )\nend\n\nfn f(real x ? x > 0) => ln(x)\n",
  Exponential:
    "aux fn growth(real x) => exp(x)\n\nfn f(real x)\n    += x\n    >> exp(me)\nend\n",
  Gamma:
    "fn g(real x) => gamma(x)\n\nfn f(real x)\n    += x\n    += 1\n    >> (5 ^ me)\nend\n",
  Factorial:
    "// Factorial is defined for nonnegative integers; 0! = 1.\n\n// bare >> factorial also works\n\nfn applied(real n)\n    += n\n    >> factorial(me)\nend\n\nfn shifted(real x, real a) => factorial((x + a))\n\nfn fact(real n) => factorial(n)\n",
  Aggregations:
    "// Each iteration builds one independent term.\n\n// optional contribution\n\nfn f(real a, real b)\n    += sum i from a to b (\n        += (i ^ 2)\n        -= a ? (i < 2)\n    )\nend\n\nfn productRange(real n)\n    += 1\n    *= prod i from 1 to n (\n        += 1\n        *= i\n    )\nend\n",
  Modulo:
    "fn divisible(real x)\n    += 1 ? ((x % 3) == 0)\nend\n\nfn remainder(real x) => (x % 3)\n",
  "Guarded domains":
    "fn r(real x)\n    += ((-(1)) / x) ? (x < 0)\n    += ln(x) ? (x > 0)\nend\n",
};
