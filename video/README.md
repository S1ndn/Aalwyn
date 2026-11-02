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
