import {Code, Img, Latex, Node, Rect, Txt, lines, makeScene2D} from '@motion-canvas/2d';
import {all, createRef, easeInOutCubic, easeOutCubic, waitFor} from '@motion-canvas/core';
import {aalwynHighlighter} from '../highlighter';
import defaultTrace from '../trace.json';
import type {TraceStep} from '../../../src/compiler/trace';
export interface WalkthroughData {
  name: string; params: string[]; source: string; domainLatex: string; finalLatex: string;
  steps: unknown[]; timing?: {line: number; intro: number; outro: number};
  showCaptions?: boolean; skipFormulaIntro?: boolean; tutorialTitle?: boolean; hideDomain?: boolean;
}

export function createWalkthrough(trace: WalkthroughData) {
const steps = trace.steps as unknown as (TraceStep & {caption?: string; mathLabel?: string; mathSvg?: string; mathSize?: [number, number]})[];
const timing = (trace as unknown as {timing?: {line: number; intro: number; outro: number}}).timing;
const showCaptions = (trace as unknown as {showCaptions?: boolean}).showCaptions !== false;
let mathLabel = `${trace.name}(${trace.params.join(',')})`;

// Change these to retime a scene for your narration.
const hold = timing ? 0.12 : 2.1;
const transition = timing ? 0.38 : 0.8;
const foreground = '#f0f0f0';
const muted = '#9d9d9d';
const accent = '#4fc1ff';

// Match elementary symbols across equations so x, 3 and 2 travel into place.
// Complex formulas stay grouped to keep fractions and aggregation syntax valid.
function equation(tex: string) {
  const slash = String.fromCharCode(92);
  if (['frac', 'sum', 'prod', 'begin'].some(command => tex.includes(slash + command))) {
    return [`${mathLabel}=`, tex];
  }
  const tokens = /\\operatorname\{[^}]+\}|\\[A-Za-z]+|[A-Za-z]+|\d+/g;
  const body = tex.replace(tokens, token => token.startsWith(slash) ? token : `{{${token}}}`);
  return `{{${mathLabel}=}}${body}`;
}

function stepCaption(step: TraceStep): string {
  if (step.kind === 'simplify') return 'Done!';
  if (step.kind === 'define') return `Define ${step.definition?.name ?? 'a value'}`;
  if (step.kind === 'start') {
    if (step.after.kind === 'symbol') return `Start at ${step.after.label ?? step.after.name}`;
    if (step.after.kind === 'number') return `Start at ${step.after.value}`;
    if (step.after.kind === 'aggregate') return step.after.operator === 'sum' ? 'Build the sum' : 'Build the product';
    return 'Set the starting value';
  }
  if (step.kind === 'apply') {
    const name = step.after.kind === 'function' ? step.after.name : undefined;
    const labels: Record<string, string> = {
      sin: 'Apply the sine function', cos: 'Apply the cosine function',
      tan: 'Apply the tangent function', sqrt: 'Take the square root',
      ln: 'Take the natural logarithm', exp: 'Apply the exponential function',
      floor: 'Round down', ceil: 'Round up', abs: 'Take the absolute value',
    };
    return name && labels[name] ? labels[name] : 'Apply the transformation';
  }
  const instruction = step.source.trim().split('//')[0].trim();
  const update = /^(\+=|-=|\*=|\/=|\^=)\s*(.+)$/.exec(instruction);
  if (!update || update[2].includes('?') || update[2].length > 36) return 'Update the expression';
  const [, operator, value] = update;
  if (operator === '^=' && value === '2') return 'Square';
  if (operator === '^=' && value === '3') return 'Cube';
  return ({'+=': 'Add', '-=': 'Subtract', '*=': 'Multiply by', '/=': 'Divide by', '^=': 'Raise to'})[operator] + ' ' + value;
}

return makeScene2D(function* (view) {
  view.fill('#141619');
  view.fontFamily('Segoe UI');
  const section = createRef<Node>();
  const codePanel = createRef<Rect>();
  const mathPanel = createRef<Rect>();
  const code = createRef<Code>();
  const formula = createRef<Latex>();
  const activeLine = createRef<Rect>();
  const caption = createRef<Txt>();
  const detail = createRef<Latex>();
  const source = trace.source.trimEnd();
  const sourceLines = source.split('\n');
  const longest = Math.max(...sourceLines.map(line => line.length));
  const fontSize = Math.min(34, 720 / (longest * 0.61), 420 / (sourceLines.length * 1.6));
  const lineHeight = fontSize * 1.65;
  const codeY = -155;
  // Center the box on the visible glyphs rather than the line-height leading.
  const highlightOffsetY = -fontSize * 0.24;
  view.add(<Node ref={section} opacity={0}>
    <Txt text="How it works" fontFamily="Segoe UI" fontWeight={500}
      fontSize={56} fill={foreground} y={-410}/>
    <Rect ref={codePanel} x={-455} width={830} height={600} radius={20} fill="#1f1f1f" stroke="#33363d" lineWidth={2}/>
    <Rect ref={mathPanel} x={455} width={830} height={600} radius={20} fill="#1b1e23" stroke="#33363d" lineWidth={2}/>
    <Txt text="The code" x={-455} y={-250} fontSize={26} fill={muted}/>
    <Txt text="The math" x={455} y={-250} fontSize={26} fill={muted}/>
    <Rect ref={activeLine} x={-455} y={codeY + lineHeight / 2 + highlightOffsetY} width={770}
      height={lineHeight + 6} radius={7} fill="#264f784d" stroke="#4fc1ff55" lineWidth={1} opacity={0}/>
    <Code ref={code} opacity={0} x={-810} y={codeY} offset={[-1, -1]} code={source}
      fontFamily="Cascadia Code, Consolas, monospace" fontSize={fontSize}
      lineHeight={lineHeight} highlighter={aalwynHighlighter}/>
    <Latex ref={formula} opacity={0} x={455} y={-35} tex={equation('0')} fontSize={64} fill={foreground}/>
    <Latex ref={detail} opacity={0} x={455} y={150} tex={trace.domainLatex || String.raw`\mathbb{R}`} fontSize={30} fill={muted}/>
    <Txt ref={caption} text="" y={395} opacity={showCaptions ? 1 : 0}
      fontFamily="Segoe UI" fontSize={34} fill={foreground}/>
  </Node>);
  formula().scale(() => Math.min(1, 730 / Math.max(1, formula().width()), 300 / Math.max(1, formula().height())));
  let displayedFormula: Latex | Img = formula();
  if (trace.tutorialTitle) yield* waitFor(0.4);
  if (!trace.skipFormulaIntro) {
  const finalStep = steps.at(-1)!;
  const intro = finalStep.mathSvg
    ? new Img({src: finalStep.mathSvg, size: finalStep.mathSize!, opacity: 0})
    : new Latex({tex: equation(trace.finalLatex), fontSize: 64, fill: foreground, opacity: 0});
  const introTitles = new Node({opacity: 0});
  if (trace.tutorialTitle) {
    introTitles.add(<>
      <Txt text="How to write" y={-240} fontSize={60} fill={foreground}/>
      <Txt text="In Aalwyn" y={210} fontSize={52} fontWeight={500} fill={accent}/>
    </>);
    view.add(introTitles);
  }
  view.add(intro);
  intro.scale(() => Math.min(1.7, 1400 / Math.max(1, intro.width()), 550 / Math.max(1, intro.height())));
  yield* all(intro.opacity(1, 0.55), introTitles.opacity(1, 0.55));
  yield* waitFor(2);
  yield* all(intro.opacity(0, 0.6), introTitles.opacity(0, 0.6), section().opacity(1, 0.6));
  intro.remove();
  introTitles.remove();
  } else {
    yield* section().opacity(1, 0.6);
  }
  // Leave a full second of breathing room before revealing the source.
  yield* waitFor(1);
  yield* code().opacity(1, 0.45);
  yield* waitFor(0.4);
  // The pause previews the implicit zero; the first instruction sets the declared start.
  activeLine().y(codeY + lineHeight / 2 + highlightOffsetY);
  code().selection(lines(0, 0));
  yield* all(displayedFormula.opacity(1, 0.45), detail().opacity(trace.hideDomain ? 0 : 1, 0.45), activeLine().opacity(1, 0.45));
  yield* waitFor(1);
  for (const step of steps) {
    const isFinal = step.kind === 'simplify';
    caption().text(step.caption ?? stepCaption(step));
    mathLabel = step.mathLabel ?? `${trace.name}(${trace.params.join(',')})`;
    if (timing) {
      const middle = (step.line - 1 + (step.endLine - step.line + 1) / 2) * lineHeight;
      // Let the browser render the complete MathJax SVG, including stretched delimiters.
      const nextFormula = new Img({x: 455, y: -35, src: step.mathSvg!,
        size: step.mathSize!, opacity: 0});
      section().add(nextFormula);
      yield* all(
        displayedFormula.opacity(0, transition), nextFormula.opacity(1, transition),
        activeLine().opacity(1, transition),
        activeLine().position([-455, codeY + middle + highlightOffsetY], transition, easeInOutCubic),
        activeLine().height((step.endLine - step.line + 1) * lineHeight + 6, transition),
        code().selection(lines(step.line - 1, step.endLine - 1), transition),
        detail().tex(step.definition ? String.raw`\mathrm{${step.definition.name}}=${step.definition.latex}` : trace.domainLatex || String.raw`\mathbb{R}`, transition),
        detail().opacity(step.definition || !trace.hideDomain ? 1 : 0, transition),
      );
      displayedFormula.remove();
      displayedFormula = nextFormula;
      yield* waitFor(timing.line - transition);
      continue;
    }
    if (isFinal) {
      yield* all(activeLine().opacity(0, 0.3), code().selection(lines(0, sourceLines.length - 1), 0.3));
    } else {
      const middle = (step.line - 1 + (step.endLine - step.line + 1) / 2) * lineHeight;
      yield* all(
        activeLine().opacity(1, 0.2),
        activeLine().position([-455, codeY + middle + highlightOffsetY], 0.4, easeInOutCubic),
        activeLine().height((step.endLine - step.line + 1) * lineHeight + 6, 0.4),
        code().selection(lines(step.line - 1, step.endLine - 1), 0.3),
      );
    }
    yield* formula().tex(equation(step.afterLatex), transition, easeInOutCubic);
    const defined = 'definition' in step ? step.definition : undefined;
    yield* detail().tex(defined ? String.raw`\mathrm{${defined.name}}=${defined.latex}` : trace.domainLatex || String.raw`\mathbb{R}`, 0.3);
    yield* waitFor(hold);
  }
  caption().text('Done!');
  const endLine = sourceLines.map(line => line.trim()).lastIndexOf('end');
  if (endLine >= 0) {
    yield* all(
      activeLine().opacity(1, 0.2),
      activeLine().y(codeY + (endLine + 0.5) * lineHeight + highlightOffsetY, 0.2),
      activeLine().height(lineHeight + 6, 0.2),
      code().selection(lines(endLine, endLine), 0.2),
    );
  }
  // One shared finish cue for both panels, with a restrained equation bounce.
  const baseScale = displayedFormula.scale();
  yield* all(
    codePanel().stroke(accent, 0.35), mathPanel().stroke(accent, 0.35),
    codePanel().lineWidth(3, 0.35), mathPanel().lineWidth(3, 0.35),
    displayedFormula.scale(baseScale.scale(1.07), 0.3, easeOutCubic),
  );
  yield* displayedFormula.scale(baseScale.scale(0.985), 0.22, easeInOutCubic);
  yield* all(
    displayedFormula.scale(baseScale, 0.25, easeOutCubic),
    activeLine().opacity(0, 0.25),
    code().selection(lines(0, sourceLines.length - 1), 0.25),
  );
  yield* waitFor(timing?.outro ?? 2.4);
  yield* section().opacity(0, 0.9);
  yield* waitFor(0.4);
});

}
export default createWalkthrough(defaultTrace);
