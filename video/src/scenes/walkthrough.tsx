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

export default makeScene2D(function* (view) {
  view.fill('#141619');
  view.fontFamily('Segoe UI');
  const code = createRef<Code>();
  const formula = createRef<Latex>();
  const activeLine = createRef<Rect>();
  const caption = createRef<Txt>();
  const counter = createRef<Txt>();
  const detail = createRef<Latex>();
  const progress = createRef<Rect>();
  const source = trace.source.trimEnd();
  const sourceLines = source.split('\n');
  const longest = Math.max(...sourceLines.map(line => line.length));
  const fontSize = Math.min(34, 720 / (longest * 0.61), 420 / (sourceLines.length * 1.6));
  const lineHeight = fontSize * 1.65;
  const codeY = -155;
  view.add(<>
    <Txt text="How to code in Math" fontFamily="Segoe UI" fontWeight={600}
      fontSize={70} fill={foreground} y={-440}/>
    <Txt text="AALWYN  /  FOLLOW THE EXPRESSION" fontFamily="Segoe UI"
      fontSize={22} letterSpacing={4} fill={accent} y={-365}/>
    <Rect x={-455} width={830} height={600} radius={20} fill="#1f1f1f" stroke="#33363d" lineWidth={2}/>
    <Rect x={455} width={830} height={600} radius={20} fill="#1b1e23" stroke="#33363d" lineWidth={2}/>
    <Txt text="THE INSTRUCTIONS" x={-455} y={-250} fontSize={22} letterSpacing={3} fill={muted}/>
    <Txt text="THE MATHEMATICS" x={455} y={-250} fontSize={22} letterSpacing={3} fill={muted}/>
    <Rect ref={activeLine} x={-455} y={codeY + lineHeight / 2} width={770}
      height={lineHeight + 6} radius={7} fill="#264f784d" stroke="#4fc1ff55" lineWidth={1} opacity={0}/>
    <Code ref={code} x={-810} y={codeY} offset={[-1, -1]} code={source}
      fontFamily="Cascadia Code, Consolas, monospace" fontSize={fontSize}
      lineHeight={lineHeight} highlighter={aalwynHighlighter}/>
    <Latex ref={formula} x={455} y={-35} tex={equation('0')} fontSize={64} fill={foreground}/>
    <Latex ref={detail} x={455} y={150} tex={trace.domainLatex || '\mathbb{R}'} fontSize={30} fill={muted}/>
    <Txt ref={counter} text="COMPILER TRACE" x={455} y={245} fontSize={20} letterSpacing={2} fill={accent}/>
    <Txt ref={caption} text="Start with a value. Build an expression." y={385}
      fontFamily="Segoe UI" fontSize={34} fill={foreground}/>
    <Rect x={0} y={455} width={1600} height={4} radius={2} fill="#33363d"/>
    <Rect ref={progress} x={-800} y={455} offsetX={-1} width={0} height={4} radius={2} fill={accent}/>
    <Txt text="aalwyn" x={-800} y={495} fontFamily="Segoe UI" fontWeight={600} fontSize={23} fill={muted}/>
    <Txt text="One instruction. One transformation." x={610} y={495}
      fontFamily="Segoe UI" fontSize={21} fill={muted}/>
  </>);
  yield* waitFor(0.8);
  for (const [index, step] of steps.entries()) {
    const isFinal = step.kind === 'simplify';
    caption().text(step.title);
    counter().text(`STEP ${index + 1} / ${steps.length}`);
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
    yield* all(
      formula().tex(equation(step.afterLatex), transition, easeInOutCubic),
      progress().width(1600 * (index + 1) / steps.length, transition),
    );
    const defined = 'definition' in step ? step.definition : undefined;
    yield* detail().tex(defined ? `\mathrm{${defined.name}}=${defined.latex}` : trace.domainLatex || '\mathbb{R}', 0.3);
    yield* waitFor(hold);
  }
  caption().text('The finished expression, ready to use.');
  yield* waitFor(2.4);
});
