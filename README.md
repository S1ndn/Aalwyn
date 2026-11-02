# Aalwyn

Aalwyn compiles sequential mathematical instructions into one symbolic
mathematical expression. Conditions become ordinary mathematical operations,
without piecewise definitions. The compiler is independent of the local IDE.

## Run locally

Requires Node.js 22.12+ and npm (Node.js 24 recommended).

```sh
npm install
npm test
npm run build
npm run dev
```

Open the local URL printed by Vite. The IDE restores documents saved in that
browser profile and origin. Compile explicitly with Ctrl/Cmd+Enter or Compile.

```sh
npm run compile -- examples/distance.aal
```

## GitHub Pages

The public IDE is deployed at <https://s1ndn.github.io/Aalwyn/> once Pages is enabled.
In the repository's **Settings > Pages**, select **GitHub Actions** as the source.
Every push to `main` then runs the tests, builds the site, and deploys it through
`.github/workflows/deploy.yml`. Deployments can also be started manually from
GitHub's Actions tab.

The workflow sets `AALWYN_BASE_PATH=/Aalwyn/` so scripts, styles, and math fonts
load correctly beneath the repository URL. Local development keeps its normal
root URL. To host under a different path or a custom domain, update that
workflow value (`/` for a root domain).

Documents are saved in each visitor's browser; they are not uploaded to GitHub.

## Declarations and blocks

Every function declaration begins with `fn`:

```aalwyn
fn square(x) => x^2

aux fn wave(x) => sin(x)

fn f(real x ? x != 0)
    += x
    >> abs(me^2 - 5)
    += 1 ? (x > 0) else 2
end
```

Direct `=>` definitions supply an expression. Function blocks begin at **zero** by default; add `= expression` after the
signature to choose a starting value. The `init` keyword is no longer part of the standard source grammar.
Use `fn f(x) = value` to establish a starting value. For example, a block that
only contains `*= 5` returns zero; a block that starts with `>> exp` returns one.

`aux` keeps a function as a named call rather than substituting its body. Its
definition is compiled separately, and its arguments and body are validated.
Ordinary functions inline. Both forms support forward references; recursive
cycles and undefined functions/names are rejected, including in unused functions.
The former `helper` modifier is retained as a compatibility spelling, but new
programs should use `aux fn`.

Locals are immutable sequential substitutions:

```aalwyn
fn distance(ax, ay, bx, by)
    define dx bx - ax
    define dy by - ay
    += dx^2 + dy^2
    >> sqrt
end
```

The mutators `+=`, `-=`, `*=`, `/=`, `^=` update the whole current accumulator.
A newline or `;` separates headers and instructions. Blank lines and `//` comments are
supported. Arithmetic has conventional precedence: powers associate right,
`-x^2` means `-(x^2)`, and postfix factorial binds tighter than powers.
There is no implicit multiplication.

## Apply expressions

The apply instruction is written `>>`, highlighted lavender. A bare function
name receives the current accumulator. Explicit expressions must reference
`me`, which represents the accumulator before that instruction:

```aalwyn
fn transformed(x)
    += x
    >> sin
    >> abs(me)
    >> me^2 - 5
    >> me * me
    >> 1 / me
    >> log(2, me)
end
```

`>> me` is the identity transformation. Multiple occurrences are allowed.
`me` is illegal outside a `>>` expression, including unused definitions and
inactive conditional branches. Each nested apply has its own accumulator.
`raise` was removed; use `>> 5^me` for exponentiation with case 5.

## Sums and products

Each aggregate term is an independent instruction block: sums default to **zero**, products to **one**.

```aalwyn
fn sumSquares(natural n)
    += sum i from 1 to n (
        += i^2
    )
end

fn repeatedFive(natural n)
    += prod i from 1 to n (
        = 5
    )
end

fn factorialProduct(natural n)
    += prod i from 1 to n (
        *= i
    )
end
```

`repeatedFive(n)` is `5^n` when the term explicitly starts at zero.
Products default to one, so `*= i` directly builds a factorial product.

The completed terms are added by `sum` or multiplied by `prod`. Independently
of their term blocks, an **empty sum is 0** and an **empty product is 1**; empty
ranges do not evaluate their bodies. Bounds must be inclusive integers, advance
by one, and are evaluated outside the index scope. The index, local definitions,
guards, apply expressions and nested aggregates are supported inside bodies.
Binding identities and display renaming prevent capture during inlining.

## Input domains

```aalwyn
fn positive(real x ? x > 0) => ln(x)
fn ordered(real a, real b ? a < b) => b - a
fn count(int n ? n > 0) => n!
```

Untyped parameters default to `real`. `int` accepts integers of either sign;
`natural` accepts 0, 1, 2, … . Types never cast or round inputs. Question-mark
constraints support comparisons, `and`, `or`, and grouping; they may refer to
any parameter in the signature, including later ones. Multiple constraints are
all required. They cannot refer to body-local definitions or `me`.

Declared restrictions and requirements from called functions propagate to the
compiled domain metadata and are enforced by the value form and graph. Guarded
calls impose their requirements only on their active branch; aggregate-body
requirements apply only to visited indices. Domain facts enable conservative
simplification, such as removing `ceil(n)` for integer `n` or unnecessary
denominator protection for `n > 0`. This is not a complete domain solver or
static proof of every symbolic call.

## Conditionals

```aalwyn
fn r(real x ? x != 0)
    += ln(x) ? (x > 0) else ln(-x)
end
```

Conditions may consist of individually parenthesized clauses joined with `and`
and `or`, with further parentheses for grouping. `else` follows the completed
condition, outside its parentheses. Comparisons are `== != > < >= <=`;
numeric clauses are true when nonzero. `and` binds more tightly than `or`;
grouping can override that order. An optional `else` supplies the false-branch
operand for any of the five mutators. Without it, false guards contribute 0 for
addition/subtraction and 1 for multiplication/division/exponentiation.

For defined real operands, write `d = a-b`. Strict positivity is encoded by
`ceil(atan(d)/pi)`, equality by `floor(1/(1+abs(d)))`. Complementation gives
non-equality and non-strict comparisons; AND uses multiplication and OR uses
`1-(1-P)*(1-Q)`. These are exact mathematical identities with no piecewise nodes.

Multiplying an undefined expression by zero does not deactivate it. Partial
operations receive safe inactive inputs before masking. Both branches are
protected where necessary; invalid active operations remain undefined. A guard
itself must be defined. Builtins have mandatory arity/domain/safety contracts in
`builtins.ts`, with corresponding numeric checks and independent domain tests.
Proofs about named auxiliary calls remain conservative; an unsupported partial
auxiliary in a guard is diagnosed rather than emitted unsafely.

## Builtins and simplification

The real exponential is available as `exp(x)` or `e^x`. `abs(x)`, logarithms,
trigonometric/inverse/hyperbolic functions, `floor`, `ceil`, roots, `min`, `max`,
`sign`, `gamma` and factorial are supported. See `builtins.ts` for arity and
real-domain contracts. `log(b,x)` means logarithm of x to base b, and `root(n,x)`
uses integer degree n with the real nth-root convention.

`mod(x,m)` and `x % m` use floor modulo; the divisor is required and nonzero.
`factorial(n)` and `n!` require nonnegative integers, with `0! = 1`. `(x+a)!`
is supported; `!!` is rejected because double factorial is a different operation.
`gamma(x)` is the real Gamma function excluding nonpositive integer poles.

Constant arithmetic uses exact integer/rational calculations. The simplifier
flattens arithmetic, distributes scalar negation, combines like terms, extracts
common factors and folds modest factorial constants. Domain-sensitive zero
multiplication/cancellation does not erase undefined operands. Proven-safe,
index-independent denominators can move outside sums. General closed-form
summation and symbolic calculus are not implemented.

## IDE and numerical preview

The CodeMirror editor supplies line numbers, four-space Tab indentation,
automatic indentation on Enter, Shift+Tab unindentation, bracket matching and
closing, folding, search/replace (Ctrl/Cmd+F), multiple selections and undo/redo.
Ctrl/Cmd+Space offers sum/product snippets; both now construct their term with
`+= index`. Editor settings persist font size, line wrapping and alternative
compile/format shortcuts. Esc followed by Tab leaves the editor.

Inline errors appear as underlines/gutter markers and in a clickable Problems
list after a short typing pause. Independent declarations can report multiple
errors through safe diagnostic-only recovery. Invalid signatures may stop
recovery after the first error. Format checks unchanged parsed meaning before
replacing text; formatting is a separate undo step.

Tabs, names, source, cursor/scroll positions, selected functions and settings
autosave in browser local storage and restore on reload. Examples open new tabs.
Open imports `.aal` files; Export .aal (Ctrl/Cmd+S) downloads the active source
without overwriting an imported file. The marker `•` means changes since the
last import/export, independently of local autosave. Reopen tab recovers the
last ten closed documents. Undo histories remain per tab during the current
session, but are not persisted after a browser restart.

The result panel prioritizes the formula, domain, value form and graph.
Presentation-only compact aliases always have explicit definitions. LaTeX for
export is fully expanded; AST and IR inspection stay under Developer tools.
Editing source clears outdated output.

The graph samples compiled mathematical IR, not Aalwyn instructions or generated
JavaScript. Named auxiliary definitions are separately compiled. Undefined values
and numeric overflow become gaps. Sampling can miss narrow features and is not
a mathematical proof. Aggregate work is capped at 10,000 terms per point.
Ordinary floating-point precision applies; factorial preview is limited to 170!.
The numerical evaluator recognizes compact predicate identities to avoid losing
their zero boundary through reciprocal rounding or tiny arctangent underflow.

## Compiler API

```ts
import { compile, evaluateFunction } from "./src/compiler/compiler";
const result = compile("fn square(x) => x^2");
console.log(result.latex);
console.log(evaluateFunction(result, {x: 3})); // 9
```

`compile(source, selected?)` validates every declaration and defaults to the last
function. Results include `ast`, `ir`, `simplified`, `params`, `parameterTypes`,
`domain`, `domainText`, `helpers`, `latex`, `compactLatex` and `abbreviations`.
The internal `helper` AST flag and `helpers` registry retain their API names.
`evaluateFunction` enforces signature/domain metadata; `sampleFunction` returns
null on numerical/domain failures. Low-level `evaluateMath` evaluates IR only.
`AalwynError` carries a source line/column; `MathEvaluationError` describes
undefined or numerically unsupported evaluations.

## Migration

The standard grammar requires `fn`, identity-start aggregation bodies, `?` domains and `>>`.
Saved/reopened browser documents, imported files and formatted legacy text are
upgraded where their previous syntax parses successfully. Nonzero old function
seeds become first `+= value` instructions; explicit aggregate seeds become
first `= value` instructions when needed to preserve their value. Comments are retained at the beginning of migrated documents.
Original imported/exported files are never overwritten automatically. Invalid
or incomplete old text is kept intact for editing.

Earlier mathematical regression fixtures run through this same migrator before
testing the current compiler. New grammar tests call the standard compiler
directly. Run `npm test` and `npm run build` to verify changes.


Function blocks may choose a starting expression with `=` after their signature:

```aalwyn
fn f(x) = 1
    *= x
    += 5
end

aux fn shifted(x) = x + 1
    >> sin
end
```

Without `=`, the function starts at zero. The starting expression can use
parameters and other functions; `me` remains valid only inside `>>`.
`=> expression` still defines the complete function directly.
Aggregation bodies default to zero for sums and one for products and do not accept header seeds; a first-body `= value` may explicitly initialize a term.


Chain apply stages with `>>` in left-to-right order:

```aalwyn
fn f(x) = x
    >> me^2+1 >> cos >> sin
end
```

This compiles to `sin(cos(x^2 + 1))`: the leftmost stage runs first.
Each stage accepts a bare function name or an expression containing `me`.
Within a stage, `me` is the result from the stage to its left; the first
stage receives the current accumulator. Normal arithmetic binds within stages.
The former `&` syntax is retired. Saved chains migrate to the equivalent
sequence in evaluation order. A leading `>>` is optional when a statement
contains a chain, for example `sin >> cos >> me^2`.


A function header `= value` is shorthand for a first-body initializer:

```aalwyn
fn f(x)
    = 5
    += 2
end
```

This is identical to `fn f(x) = 5` followed by the same updates.
`=` must be the first instruction that changes the accumulator. Local `define`
statements, blank lines, and comments may precede it, and its value may reference
those earlier definitions. A header initializer already occupies that first position, so combining
it with a body initializer is an error. The same first-statement rule applies
inside aggregation term bodies; aggregate headers remain unchanged.

The IDE warns about `*=` or `/=` while the accumulator remains the implicit
zero, including after local definitions. These warnings do not prevent compilation.
Division still requires a defined, nonzero divisor; the warning does not relax
any mathematical domain checks.


The IDE also warns `No starting value was set using '='; assuming 0.` for each
function or aggregation body that uses the implicit zero start. Set `= 0`
explicitly to acknowledge it. Direct `=>` definitions already specify a value
and do not receive this warning. Warnings never prevent compilation.


Product term bodies assume **1** when no starting assignment is given;
function and sum bodies assume **0**. Explicit first `= value` overrides either.
Click a yellow warning triangle to dismiss that occurrence. Use the permanent warning-console buttons **Ignore warning** or
**Ignore all of this type** to suppress its category across the IDE;
this preference persists in the browser. **Reset ignored warnings** restores
all suppressed warnings. Errors cannot be suppressed.


Warnings and errors appear together in their separate console boxes. Warning
hover tooltips show explanations only. Clicking the yellow triangle still
ignores that particular warning; suppression buttons stay visible in the
warning console without hovering.


Starting assignments may be conditional, but must provide an `else` value:

```aalwyn
fn f(x)
    = ln(x) ? (x > 0) else 0
    += 2
end
```

The header form `fn f(x) = ln(x) ? (x > 0) else 0` is also valid.
The same rule applies to sum and product term initializers. Both branches
retain the standard conditional domain protection; `me` is still only valid
inside `>>`.


Logarithms use separate names: `ln(x)` is natural log, `log2(x)` is case 2,
`log10(x)` is case 10, and `log(b, x)` takes the base first. Apply forms are
`>> ln`, `>> log2`, `>> log10`, and `>> log(b, me)`.
Logarithm arguments must be positive; a variable base must be positive and
unequal to 1. Existing two-argument calls using the former `log(x, b)` order
must swap their arguments.


Use `define name using (...)` for a local computation with its own accumulator:

```aalwyn
fn f(x)
    define shifted using (
        define offset 2
        = x + offset
        >> sin
    )
    = shifted
    += x
end
```

The final local accumulator becomes the defined value; its mutations do not
change the enclosing accumulator. Blocks may contain nested definitions,
aggregations, conditional starts, and apply chains. Earlier outer definitions
are visible, while inner definitions stay inside the block. They start at zero
unless initialized with `=`, with the usual warning. `=` may follow definitions
but must precede updates and apply. Simple `define name expression` is unchanged.

Rendered and copied LaTeX includes the selected function, its declared input
domain, and every referenced auxiliary definition with that auxiliary's own
domain. Nested auxiliary dependencies are included once, with dependencies
before their callers. Unrelated auxiliary declarations are omitted. Compact
presentation retains the same auxiliary definitions and domains.

The simplifier collects repeated factors into positive integer powers, combines
commutative like terms and rational coefficients (including `x/2 + x/3`), and
extracts shared factors across integer powers. These rules preserve partial
operation domains; they do not cancel symbolic denominators or combine
fractional powers in ways that change their real branches.

LaTeX uses juxtaposition for algebraic multiplication (`2a`, `ab`, `a(b+c)`),
retaining explicit dots before numeric factors where needed for clarity.
Negative fractions render as subtraction: `x + -1/2` becomes `x - 1/2`.


Semicolons act as explicit newlines wherever a line break is accepted:

```aalwyn
fn f(x); define offset 2; = x; += offset; *= 3; end

fn g(natural n) = 0;
    += sum i from 1 to n (; = i; >> me^2; );
end
```

Repeated or trailing separators are accepted. They do not replace argument
commas or turn an unfinished arithmetic expression into a continued one.
`//` comments end at the physical newline, so semicolons inside comments are
ignored. Formatting expands semicolons into ordinary indented lines.

The IDE uses VS Code's [Dark Modern](https://github.com/microsoft/vscode/blob/main/extensions/theme-defaults/themes/dark_modern.json)
workbench and Dark+ syntax palette: charcoal surfaces, blue declaration keywords,
teal input types, pale yellow functions, green numbers and comments, and light
blue variables and mutators. Starting assignments, conditional `?`, and `>>`
use the control-flow purple. Coding ligatures remain enabled with Cascadia Code,
JetBrains Mono, and Fira Code fallbacks. Warnings stay yellow; errors use red.

Declare a named integer-indexed sequence with `seq`, and access its terms with
square brackets:

```aalwyn
seq w(k) = 1
    += 1 ? (k % 2 != 0)
end

fn weightedSum(int n ? n >= 1)
    = sum k from 1 to n (
        = k * w[k]
    )
end
```

A sequence has exactly one integer index. Its default index type is `int`;
explicit `int` or `natural` and `?` restrictions are also accepted, for example
`seq a(natural k ? k > 0) => 1/k`. Sequences support direct expressions, mutation
blocks, and local definitions. They remain named in compiled mathematics,
render as subscripts (`w_k`), and export with their definitions and domains.
Function calls retain parentheses; sequence access uses brackets.

Sum and product autocomplete snippets use `= index` as their first instruction,
so the term's value is explicit regardless of the block's default accumulator.


Sequences already retain their names, so `aux seq` and `helper seq` are errors.
Use `recursive seq` with explicit base cases to reference earlier integer-indexed terms:

```aalwyn
recursive seq fib(natural n)
    case 0 = 0
    case 1 = 1
    = fib[n-1] + fib[n-2]
end

fn fibonacci(natural n) => fib[n]
```

Recursive indices must be provably integer expressions. Statically known
same-index or forward references are rejected; computed decreases are checked
at evaluation. Declare at least one `case index = value` before the recurrence body, and use
an appropriate index domain. Base cases take precedence over the entire body;
indices must be unique integer literals, and their values cannot reference the
sequence itself. Plain `seq` declarations cannot self-reference.
Inactive recursive calls compile to empty finite sums, preserving a single
mathematical definition without piecewise nodes. Numeric evaluation caches
terms and checks sequence domains at each call. Missing base cases and preview
limits produce evaluation errors. Mutual recursion remains unsupported.

Recursive sequences render and export as conventional recurrence equations with
explicit initial-value equations. For natural indices with cases 0 through m,
the recurrence is labeled for n >= m+1; otherwise the declared case indices
are explicitly excluded from its domain. Evaluation and graphing continue to
use the protected compiled expression, including its finite-sum guards.
