# Aalwyn

**Write how a mathematical function is constructed. Get the expression it defines.**

Aalwyn is a higher-level language for authoring mathematics. Start with a value,
build it through updates, conditions, sums, and products, then compile the result
into mathematical notation. You can describe the construction without already
knowing what the finished algebra will look like.

**[Try Aalwyn in your browser →](https://s1ndn.github.io/Aalwyn/)**

The IDE includes syntax highlighting, a rendered formula, LaTeX export, input-domain
checks, numerical evaluation, and a graph of the compiled mathematical expression.
Everything runs in your browser; documents are saved locally.

## From instructions to an expression

Suppose we want the geometric mean of the first `n` positive integers, counting
odd numbers twice. We can describe the weighting rule, count the weights, build
the product, and take the appropriate root:

```aalwyn
aux fn weight(natural k) = 1
    += 1 ? (k % 2 != 0)
end

fn weightedMean(int n ? n >= 1)
    define totalWeight sum k from 1 to n (
        = weight(k)
    )

    = prod k from 1 to n (
        = k
        ^= weight(k)
    )
    ^= 1/totalWeight
end
```

Aalwyn turns this into the mathematical definitions

$$
\operatorname{weightedMean}(n)
=\left(\prod_{k=1}^{n}k^{\operatorname{weight}(k)}\right)^{
\frac{1}{\sum_{k=1}^{n}\operatorname{weight}(k)}}
\qquad (n\in\mathbb{Z},\ n\ge1),
$$

$$
\operatorname{weight}(k)
=2-\left\lfloor\frac{1}{1+|\operatorname{mod}(k,2)|}\right\rfloor
\qquad (k\in\mathbb{N}_0).
$$

The condition has become an algebraic switch, with no piecewise definition.
The `aux` modifier keeps `weight` as a named function and exports its definition
and domain alongside the result. Removing `aux` substitutes its expression
into the caller instead.

For `n = 3`, the product is $1^2\cdot2\cdot3^2=18$ and the total weight is $5$,
so the result is $18^{1/5}\approx1.782602458$.

## The basics

### Start a function, then update its value

Use `fn` to declare a function and `=` to choose its starting value. Instructions
act on the whole current expression, from top to bottom.

```aalwyn
fn f(real x) = x
    *= 2
    += 3
    ^= 2
end
```

This defines $f(x)=(2x+3)^2$.

| Instruction | Effect on the current value |
| --- | --- |
| `+= expression` | Add |
| `-= expression` | Subtract |
| `*= expression` | Multiply |
| `/= expression` | Divide |
| `^= expression` | Raise to a power |
| `>> transformation` | Apply a function or expression |

You can also put the starting assignment inside the body. Definitions and
comments may precede it, but `=` must come before any update or transformation.
A second starting assignment is an error. Use an explicit `= 0` when zero is intended.

### Name intermediate expressions

`define` gives an expression a local name. For a computation with its own
updates, use `define name using (...)`:

```aalwyn
fn f(real x)
    define offset 2
    define transformed using (
        = x + offset
        >> sin
    )

    = transformed
    += x
end
```

This defines $f(x)=\sin(x+2)+x$. The local block has its own current value;
changing it does not change the enclosing function's value.

### Transform with `>>`

A bare function name receives the current value. Use `me` to refer to that value
inside a larger expression. Chained stages run **left to right**.

```aalwyn
fn transformed(real x) = x
    >> sin >> me^2 + 1 >> log(2, me)
end
```

This defines $\log_2(\sin^2(x)+1)$. `me` is valid only inside `>>` expressions.
For example, `>> 5^me` exponentiates with base 5, while `>> me^5` takes the fifth power.

### Add conditions

Put `?` after an operand to make an update conditional. Without `else`, a false
condition leaves the current value unchanged.

```aalwyn
fn positiveSquare(real x) = 0
    += x^2 ? (x > 0)
end

fn magnitude(real x)
    = x ? (x >= 0) else -x
end
```

An optional `else` supplies the alternative operand. A conditional starting
assignment **requires** `else`, as in `magnitude` above.

Comparisons are `==`, `!=`, `<`, `<=`, `>`, and `>=`. Combine conditions with
`and`, `or`, and parentheses; `and` takes precedence over `or`.
The compiler encodes conditions using ordinary mathematical operations, including
absolute values, floors, ceilings, and trigonometric functions. It also protects
partial operations in inactive branches: multiplying an undefined value by zero
would not be sufficient.

### State the accepted inputs

Parameters accept `real`, `int`, or `natural` types. Untyped parameters default
to `real`; `natural` includes zero. A `?` in a parameter declaration adds a restriction.

```aalwyn
fn logarithm(real x ? x > 0) = ln(x)
end

fn fact(natural n) = n!
end
```

Domains appear in the rendered mathematics and are checked during evaluation
and graphing. Types do not cast or round inputs. Domain reasoning is conservative;
Aalwyn does not prove every possible symbolic precondition.

### Build sums and products

Each index builds one independent term. `sum` adds the completed terms;
`prod` multiplies them.

```aalwyn
fn sumSquares(natural n)
    = sum i from 1 to n (
        = i^2
    )
end

fn productRange(natural n)
    = prod i from 1 to n (
        = i
    )
end
```

Bounds are inclusive integers and advance by one. Bodies may contain definitions,
updates, conditions, transformations, and nested aggregates. An empty sum is `0`;
an empty product is `1`.

If a start is omitted, function, `using`, and sum-term blocks assume `0`, while
product-term blocks assume `1`. The IDE warns about implicit starts. Explicit
`=` assignments make the intended term clear.

### Define sequences and recurrences

Use `seq` for an integer-indexed sequence and square brackets to access its terms.
A sequence index defaults to `int`; explicit `natural` indices are also supported.
Recursive sequences use `recursive seq` and explicit initial cases:

```aalwyn
recursive seq fib(natural n)
    case 0 = 0
    case 1 = 1
    = fib[n-1] + fib[n-2]
end

fn fibonacci(natural n) = fib[n]
end
```

Sequences remain named in the output and cannot be `aux`. Recursive references
must have integer indices and move to earlier terms. Recurrences export with
their initial conditions; this does not turn them into closed-form expressions.
Mutual recursion is not supported.

### Useful notation

| Purpose | Syntax |
| --- | --- |
| Natural and other logarithms | `ln(x)`, `log2(x)`, `log10(x)`, `log(base, x)` |
| Exponential and absolute value | `exp(x)`, `e^x`, `abs(x)` |
| Trigonometry | `sin(x)`, `cos(x)`, `tan(x)` and inverse/hyperbolic functions |
| Roots and rounding | `sqrt(x)`, `root(n, x)`, `floor(x)`, `ceil(x)` |
| Factorial and Gamma | `n!`, `(n+1)!`, `factorial(n)`, `gamma(x)` |
| Modulo | `x % m` or `mod(x, m)` |
| Constants | `pi`, `e` |
| Comments and separators | `// comment`; newline or `;` between instructions |

Write multiplication explicitly as `a*b`. Powers associate right, and `-x^2`
means `-(x^2)`. Factorial accepts nonnegative integers; use `gamma(x+1)` for
the usual real extension. Two-argument logarithms take the **base first**.

## Try it

Open **[the online IDE](https://s1ndn.github.io/Aalwyn/)** and choose an example.
The examples progress from arithmetic to recursive sequences and inverse counting.

- **Compile:** Ctrl/Cmd+Enter, or the Compile button.
- **Indent:** Tab inserts four spaces; Shift+Tab unindents.
- **Complete:** Ctrl/Cmd+Space offers sum/product constructions.
- **Format:** use the Format button.
- **Keep a copy:** Export `.aal`; use Open to import it later.
- **Share the mathematics:** Copy LaTeX includes referenced auxiliaries and domains.

Documents autosave in the current browser. They do not sync across devices.
Evaluation and graphing use the compiled mathematical expression.

## Run locally

Requires Node.js 22.12+ and npm; Node.js 24 is recommended.

```sh
npm ci
npm run dev
```

Open the local address printed by Vite. To run checks, build the site, or compile
a source file from the command line:

```sh
npm test
npm run build
npm run compile -- examples/distance.aal
```

## Scope and limitations

Aalwyn is experimental. It simplifies expressions and preserves domain-sensitive
structure, but does not provide general closed-form summation or symbolic calculus.
The numerical preview uses ordinary floating-point arithmetic: an exact formula
can still evaluate inaccurately, particularly with large factorials or
trigonometric expressions followed by `floor`. Graphs are sampled previews and
can miss narrow features; numerical work and recursion have evaluation limits.

The compiler can also be used directly:

```ts
import { compile, evaluateFunction } from "./src/compiler/compiler";

const result = compile("fn square(real x) = x^2; end");
console.log(result.latex);
console.log(evaluateFunction(result, { x: 3 })); // 9
```

## Deployment

Pushes to `main` run the tests, build the site, and deploy it to GitHub Pages via
[the deployment workflow](.github/workflows/deploy.yml).
The workflow sets `AALWYN_BASE_PATH=/Aalwyn/`; local development stays at `/`.
For another repository path or a custom domain, update that value (`/` for a root domain).
