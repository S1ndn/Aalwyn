import {Code, Latex, Rect, Txt, lines, makeScene2D} from '@motion-canvas/2d';
import {all, createRef, easeInOutCubic, waitFor} from '@motion-canvas/core';
import {aalwynHighlighter} from '../highlighter';
import trace from '../trace.json';
import type {TraceStep} from '../../../src/compiler/trace';
const steps = trace.steps as unknown as TraceStep[];

// Change these to retime a scene for your narration.
const hold = 2.1;
const transition = 0.8;
const foreground = '#f0f0f0';
const muted = '#9d9d9d';
const accent = '#4fc1ff';

// Match elementary symbols across equations so x, 3 and 2 travel into place.
// Complex formulas stay grouped to keep fractions and aggregation syntax valid.
function equation(tex: string) {
  const slash = String.fromCharCode(92);
  if (['frac', 'sum', 'prod', 'begin'].some(command => tex.includes(slash + command))) {
    return [`${trace.name}(${trace.params.join(',')})=`, tex];
  }
  const tokens = /\\operatorname\{[^}]+\}|\\[A-Za-z]+|[A-Za-z]+|\d+/g;
  const body = tex.replace(tokens, token => token.startsWith(slash) ? token : `{{${token}}}`);
  return `{{${trace.name}(${trace.params.join(',')})=}}${body}`;
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

export default makeScene2D(function* (view) {
  view.fill('#141619');
  view.fontFamily('Segoe UI');
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
  view.add(<>
    <Txt text="How it works" fontFamily="Segoe UI" fontWeight={500}
      fontSize={56} fill={foreground} y={-410}/>
    <Rect x={-455} width={830} height={600} radius={20} fill="#1f1f1f" stroke="#33363d" lineWidth={2}/>
    <Rect x={455} width={830} height={600} radius={20} fill="#1b1e23" stroke="#33363d" lineWidth={2}/>
    <Txt text="The code" x={-455} y={-250} fontSize={26} fill={muted}/>
    <Txt text="The math" x={455} y={-250} fontSize={26} fill={muted}/>
    <Rect ref={activeLine} x={-455} y={codeY + lineHeight / 2} width={770}
      height={lineHeight + 6} radius={7} fill="#264f784d" stroke="#4fc1ff55" lineWidth={1} opacity={0}/>
    <Code ref={code} x={-810} y={codeY} offset={[-1, -1]} code={source}
      fontFamily="Cascadia Code, Consolas, monospace" fontSize={fontSize}
      lineHeight={lineHeight} highlighter={aalwynHighlighter}/>
    <Latex ref={formula} x={455} y={-35} tex={equation('0')} fontSize={64} fill={foreground}/>
    <Latex ref={detail} x={455} y={150} tex={trace.domainLatex || String.raw`\mathbb{R}`} fontSize={30} fill={muted}/>
    <Txt ref={caption} text="" y={395}
      fontFamily="Segoe UI" fontSize={34} fill={foreground}/>
  </>);
  yield* waitFor(0.8);
  for (const step of steps) {
    const isFinal = step.kind === 'simplify';
    caption().text(stepCaption(step));
    if (isFinal) {
      yield* all(activeLine().opacity(0, 0.3), code().selection(lines(0, sourceLines.length - 1), 0.3));
    } else {
      const middle = (step.line - 1 + (step.endLine - step.line + 1) / 2) * lineHeight;
      yield* all(
        activeLine().opacity(1, 0.2),
        activeLine().position([-455, codeY + middle], 0.4, easeInOutCubic),
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
  yield* waitFor(2.4);
});
