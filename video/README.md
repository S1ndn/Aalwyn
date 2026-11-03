# Aalwyn video studio

Motion Canvas scenes for explaining how Aalwyn constructs mathematical expressions.
The starter animation shows highlighted code on the left and a changing LaTeX
equation on the right, followed by the compiler's final simplification.

## Open the editor

From the Aalwyn project root:

```sh
npm ci
npm run video:install
npm run video
```

On this machine the packages are already installed. Run `npm run video` and open
<http://127.0.0.1:9000/>. Use Play to preview, or scrub the timeline.

## Change the example

Edit `video/examples/intro.aal`, then restart `npm run video`. The command generates
`video/src/trace.json` from the real compiler before opening Motion Canvas.
For another source file or a specific function, generate a trace explicitly:

```sh
npm run trace -- examples/distance.aal distance --out video/src/trace.json
npm --prefix video start
```

Use the second command directly for custom traces; `npm run video` regenerates
the default intro example. `video/examples/logic.aal` is a second starter showing
an equality condition becoming an algebraic switch.

The scene is `video/src/scenes/walkthrough.tsx`. Change `hold` and `transition`
near the top to match your narration. Edit its text, colors, and layout there.
The checked-in `project.meta` sets 1920 x 1080, 60 fps and the FFmpeg exporter.

## Export an MP4

1. Open **Video Settings** in the Motion Canvas editor.
2. Keep the resolution at **1920 x 1080**, rendering at **60 fps**, and exporter
   at **Video (FFmpeg)**.
3. Click **Render**. The MP4 is saved under `video/output/`.

FFmpeg is supplied by the exporter package; a system-wide installation is not
required. Add narration in your video editor, or set `audio` in `src/project.ts`
after placing an audio file in `video/public/`. Exports are ignored by Git.

## What the trace represents

Each step contains the physical source line/range, the mathematical expression
before and after the instruction, its LaTeX, and a local definition's value when
applicable. These come from the existing parser, lowering pass, and simplifier;
the animation does not reimplement arithmetic or execute the source numerically.

- Steps show the selected function's **top-level instructions**.
- Sums, products and `using` blocks appear as completed symbolic operands; their
  bodies are not expanded into an animation of individual iterations.
- Chained `>>` stages produce separate steps, even when they share a source line.
- A final step shows simplification separately from the expression's construction.
- Recursive sequence bodies are not traced. Trace an ordinary function calling
  the sequence instead. Auxiliary definitions and domains are included in the
  trace data; the starter scene displays the main expression and its domain.
- The layout is tuned for short examples. Long source programs or large formulas
  may need a larger scene, different font sizes, or several shots.

Validate the compiler with `npm test`. Run `npm run video:build` to check the
video project's TypeScript and bundle; that command regenerates the intro trace.
A custom trace can be checked without regeneration using
`npm --prefix video run build`.

The video workspace has its own dependencies and Vite version. It is local
production tooling and is not included in the hosted Aalwyn IDE.

## Fast Willans walkthrough

Run `npm run video:willans` for the nested Willans prime formula, or
`npm run video:willans:build` to regenerate and check it. The dedicated generator
uses the real compiler for each focused inner expression and the final complete
formula. Sum bodies build inside their sigma: first the defined `count`, then the full
`willans(n)` expression. Bottom captions are hidden for this example.
Instructions run at 0.5 seconds each,
followed by a two-second hold. This is symbolic construction, not numerical
iteration of the sums. The ordinary intro commands remain available.

## Presentation timing

Every walkthrough opens with the completed formula, then crossfades to the
“How it works” panels. After one second the code fades in; the preview `f(…) = 0`
appears after a brief pause. It holds for one second before the first instruction
sets the declared starting value.
At `end`, both panel borders brighten together and the finished expression grows
and settles with a small bounce. The Willans animation retains its half-second
instruction pace and two-second final hold.

## Conditional prime-product example

Run `npm run video:prime-log` to open the conditional example, or
`npm run video:prime-log:build` to regenerate and build it. Source:
`video/examples/prime-log.aal`. It computes the logarithm of the product of all
primes up to `n`: an inner sum counts proper divisors, a conditional sets the exponent of `k` to `1`
when that count is zero and `0` otherwise, then the product passes through `ln`.
Both conditional forms are present. Each intermediate formula comes from the
compiler, with sum and product bodies kept inside their aggregation signs.
The generator checks five inputs against independently specified prime products.

## Caption-led prime opening

Run `npm run video:opening` and select **src/prime-intro** in the editor.
`npm run video:opening:build` regenerates the formula and checks the build.
This separate 1080p/60 fps project animates the prime sequence, the “right?”
reveal, Willans' formula, four checked input/output examples, and the
“It's programming, with math!” payoff. It exports to `video/output/prime-intro.mp4`.
The original walkthrough remains available as **src/project** on the project
selection screen. Edit captions and pacing in `src/scenes/prime-intro.tsx`.

The opening includes a short visual bridge from formula to code: the outer sigma
is highlighted and labelled `for`, then the complete floor-of-cosine-squared
indicator is highlighted and labelled `is_prime(j) or j == 1`. The special case
is intentional: the indicator returns one at j=1 as well as at primes. The
cosine-squared expression alone is not the test. Highlight assets are generated
from exact matching substrings of the compiler's expression, not redrawn math.

The opening continues with “Well, that example was really hard” (red emphasis),
then `f(x) = sin(x² + 3x)`. A simple pseudocode sequence constructs the expression
one instruction at a time: `a = x^2`, `a += 3*x`, `a = sin(a)`, `return a`.
These are explanatory pseudocode, before introducing Aalwyn syntax. Matching
math images come from the compiler and are checked at four numerical inputs.
The segment ends with “Can we take this further?”.

## Decisions and the Aalwyn reveal

The same opening project continues through an absolute-value `if/else`, then the
rule “x² for x ≥ 0, otherwise −x”. It reveals the compiler-generated expression,
highlights its arithmetic condition, introduces Aalwyn, and holds the equivalent
source for 3.5 seconds. A second scene reuses the shared walkthrough: panels,
code reveal, `f(x)=0` pause, conditional assignment, `end`, and the completion
border/bounce. Its trace is generated independently in `decision-trace.json`, so
the standalone examples remain separate. Source: `video/examples/decision.aal`.
Five numerical inputs include the boundary x=0. The formula has no piecewise node.

The reveal uses a plain Aalwyn title. During the reading pause, the original
decision pseudocode and the highlighted Aalwyn source appear side by side with
labels, with the original compiled expression below.

## Ordered standalone tutorial series

Run `npm run video:series`, then select **src/tutorial-series**. Regenerate and
check it with `npm run video:series:build`. The eight examples progress through
untyped arithmetic and polynomials, real and integer inputs, `>>` calls,
`define`, guarded addition, and an if/else starting assignment. Every clip opens
and closes on #141619 and introduces its expression with “How to write” and
“In Aalwyn”. Early examples omit type annotations and the domain display.
Definition steps show the defined value below the current function.

Render the reel, then run `python video/scripts/export-series.py` to split it
into numbered clips with matching source files. The splitter finds the blank
background pauses and verifies that each exported clip starts and ends on a
flat background. Files appear in `video/output/tutorial-clips/`.

The tutorial series uses raw lowered LaTeX for construction steps, opening
expressions, and definition values. A separate final step applies the compiler's
simplifier before the completion border and bounce. Both raw and simplified
evaluator results are checked against the expected values.

Tutorial instructions now advance once per second. Conditional introductions
show two separate expression/condition rows in ordinary language, rather than
the expanded arithmetic encoding. The expanded raw formula still builds during
the walkthrough. Conditional title cards hold for three seconds for reading.

First-use spotlights pause the walkthrough and dim everything outside the active
code token and its mathematical counterpart. They introduce starting assignment,
addition, multiplication, powers, division, real/integer types, function calls,
definitions, and both conditional forms. Type spotlights emphasize the matching
“for …” domain. Conditional spotlights use concise true/false outcomes.
The normal instruction pace remains one second per line outside these pauses.
