import {Code, Img, Line, Node, Rect, Txt, makeScene2D} from '@motion-canvas/2d';
import {all, createRef, easeInOutCubic, easeOutCubic, sequence, waitFor} from '@motion-canvas/core';
import assets from '../opening-assets.json';
import {aalwynHighlighter} from '../highlighter';

const foreground = '#f0f0f0';
const accent = '#4fc1ff';

export default makeScene2D(function* (view) {
  view.fill('#141619');
  view.fontFamily('Segoe UI');
  const opening = createRef<Node>();
  const headline = createRef<Txt>();
  const question = createRef<Txt>();
  const primes = [2, 3, 5, 7, 11];
  const primeNodes: Txt[] = [];
  view.add(<Node ref={opening}>
    {primes.map((prime, i) => <Txt ref={node => primeNodes.push(node)}
      text={String(prime) + (i < primes.length - 1 ? ',' : '…')}
      x={-440 + i * 220} y={-100} fontSize={116} fontWeight={500}
      fill={foreground} opacity={0}/>)}
    <Txt ref={headline} text="No formula computes primes…" y={100}
      fontSize={64} fontWeight={500} fill={foreground} opacity={0}/>
    <Txt ref={question} text="right?" y={200} fontSize={76}
      fontWeight={600} fill={accent} opacity={0}/>
  </Node>);
  yield* sequence(0.18, ...primeNodes.map(node => all(node.opacity(1, 0.35), node.y(-135, 0.35, easeOutCubic))));
  yield* waitFor(0.5);
  yield* headline().opacity(1, 0.5);
  yield* waitFor(1.7);
  yield* all(question().opacity(1, 0.35), question().y(180, 0.35, easeOutCubic));
  yield* waitFor(1.3);
  yield* opening().opacity(0, 0.5);
  opening().remove();

  const caption = createRef<Txt>();
  const formula = createRef<Img>();
  view.add(<>
    <Txt ref={caption} text="Well, this one does:" y={-330} fontSize={64}
      fontWeight={500} fill={foreground} opacity={0}/>
    <Img ref={formula} src={assets.formula.mathSvg} size={assets.formula.mathSize as [number, number]}
      y={-10} scale={1.85} opacity={0}/>
  </>);
  yield* caption().opacity(1, 0.45);
  yield* waitFor(0.55);
  yield* all(formula().opacity(1, 0.65), formula().scale(1.75, 0.65, easeOutCubic));
  yield* waitFor(2.2);
  yield* caption().opacity(0, 0.25);
  caption().text('and it actually works!');
  yield* caption().opacity(1, 0.35);
  yield* all(formula().y(-100, 0.5, easeInOutCubic), formula().scale(1.35, 0.5, easeInOutCubic));
  const examples = assets.examples.map((example, i) => {
    const image = new Img({src: example.mathSvg, size: example.mathSize as [number, number],
      x: -645 + i * 430, y: 230, opacity: 0, scale: 0.85});
    view.add(image);
    return image;
  });
  yield* sequence(0.55, ...examples.map(image => all(image.opacity(1, 0.4), image.y(200, 0.4, easeOutCubic), image.scale(1, 0.4, easeOutCubic))));
  yield* waitFor(1.7);
  yield* all(caption().opacity(0, 0.3), ...examples.map(image => image.opacity(0, 0.4)),
    formula().y(-10, 0.5, easeInOutCubic), formula().scale(1.55, 0.5, easeInOutCubic));
  caption().text('How does it do this?');
  yield* caption().opacity(1, 0.4);
  yield* waitFor(1.3);
  yield* caption().opacity(0, 0.25);
  caption().text('Look at it like code.');
  yield* caption().opacity(1, 0.35);

  const loopOverlay = new Img({src: assets.loopHighlight.mathSvg,
    size: assets.loopHighlight.mathSize as [number, number], y: -10, scale: 1.55, opacity: 0});
  const primeOverlay = new Img({src: assets.primeHighlight.mathSvg,
    size: assets.primeHighlight.mathSize as [number, number], y: -10, scale: 1.55, opacity: 0});
  view.add(loopOverlay);
  view.add(primeOverlay);
  const loopLabel = createRef<Node>();
  const loopArrow = createRef<Line>();
  view.add(<Node ref={loopLabel} opacity={0}>
    <Txt text="for" x={-460} y={-235} fontFamily="Cascadia Code, Consolas, monospace"
      fontSize={64} fontWeight={600} fill={accent}/>
    <Txt text="Loop through the numbers" x={-440} y={265} fontSize={34} fill={foreground}/>
    <Line ref={loopArrow} points={[[-420, -195], [-340, -150], [-285, -100]]}
      stroke={accent} lineWidth={4} radius={28} endArrow arrowSize={14} end={0}/>
  </Node>);
  yield* all(loopOverlay.opacity(1, 0.4), formula().opacity(0, 0.4), loopLabel().opacity(1, 0.4));
  yield* loopArrow().end(1, 0.5, easeOutCubic);
  yield* waitFor(2.2);
  yield* loopLabel().opacity(0, 0.3);
  const primeLabel = createRef<Node>();
  const primeArrow = createRef<Line>();
  view.add(<Node ref={primeLabel} opacity={0}>
    <Txt text="is_prime(j) or j == 1" x={260} y={255}
      fontFamily="Cascadia Code, Consolas, monospace" fontSize={44} fill={accent}/>
    <Txt text="A prime check, with a special case for 1" x={260} y={315}
      fontSize={29} fill={foreground}/>
    <Line ref={primeArrow} points={[[260, 210], [290, 155], [290, 100]]}
      stroke={accent} lineWidth={4} radius={28} endArrow arrowSize={14} end={0}/>
  </Node>);
  yield* all(loopOverlay.opacity(0, 0.4), primeOverlay.opacity(1, 0.4), primeLabel().opacity(1, 0.4));
  yield* primeArrow().end(1, 0.5, easeOutCubic);
  yield* waitFor(3);
  yield* all(primeOverlay.opacity(0, 0.5), primeLabel().opacity(0, 0.5), caption().opacity(0, 0.5));
  const closing = createRef<Txt>();
  view.add(<Txt ref={closing} text="" fontSize={76}
    fontWeight={500} fill={foreground} opacity={0}/>);
  closing().text('It’s programming,');
  closing().y(-55);
  yield* closing().opacity(1, 0.4);
  const payoff = createRef<Txt>();
  view.add(<Txt ref={payoff} text="with math!" y={70} fontSize={100}
    fontWeight={600} fill={accent} opacity={0} scale={0.93}/>);
  yield* waitFor(0.3);
  yield* all(payoff().opacity(1, 0.4), payoff().scale(1, 0.4, easeOutCubic));
  yield* waitFor(2);
  yield* all(closing().opacity(0, 0.5), payoff().opacity(0, 0.5));
  yield* waitFor(0.3);

  const difficulty = createRef<Node>();
  view.add(<Node ref={difficulty} opacity={0}>
    <Txt text="Well, that example was" y={-55} fontSize={68} fill={foreground}/>
    <Txt text="really hard" y={45} fontSize={88} fontWeight={600} fill="#f16c75"/>
  </Node>);
  yield* difficulty().opacity(1, 0.45);
  yield* waitFor(1.8);
  yield* difficulty().opacity(0, 0.4);
  difficulty().remove();
  const simpleCaption = createRef<Txt>();
  const simpleFormula = createRef<Img>();
  view.add(<>
    <Txt ref={simpleCaption} text="Let’s take a simpler example." y={-260}
      fontSize={64} fontWeight={500} fill={foreground} opacity={0}/>
    <Img ref={simpleFormula} src={assets.simpleFormula.mathSvg}
      size={assets.simpleFormula.mathSize as [number, number]} y={30} scale={1.6} opacity={0}/>
  </>);
  yield* simpleCaption().opacity(1, 0.4);
  yield* waitFor(0.4);
  yield* all(simpleFormula().opacity(1, 0.5), simpleFormula().y(0, 0.5, easeOutCubic));
  yield* waitFor(1.8);
  yield* simpleCaption().opacity(0, 0.25);
  simpleCaption().text('How is this code?');
  yield* simpleCaption().opacity(1, 0.35);
  yield* waitFor(1.7);
  yield* all(simpleCaption().opacity(0, 0.3), simpleFormula().opacity(0, 0.3));
  simpleCaption().text('Well, it’s just a series of instructions!');
  simpleCaption().y(-300);
  yield* simpleCaption().opacity(1, 0.4);
  yield* waitFor(0.6);

  const instructionGroup = createRef<Node>();
  const highlight = createRef<Rect>();
  const instructionNodes: Txt[] = [];
  const instructions = ['a = x^2', 'a += 3*x', 'a = sin(a)', 'return a'];
  view.add(<Node ref={instructionGroup}>
    <Rect ref={highlight} x={-400} y={-90} width={600} height={80}
      radius={8} fill="#264f784d" stroke="#4fc1ff55" lineWidth={1} opacity={0}/>
    {instructions.map((instruction, index) => <Txt ref={node => instructionNodes.push(node)}
      text={instruction} x={-680} y={-90 + index * 100} offset={[-1, 0]}
      fontFamily="Cascadia Code, Consolas, monospace" fontSize={48}
      fill={foreground} opacity={0}/>)}
  </Node>);
  let activeExpression: Img | undefined;
  for (let index = 0; index < instructions.length; index++) {
    const stage = index < 3 ? assets.simpleStages[index] : assets.simpleFormula;
    const next = new Img({src: stage.mathSvg, size: stage.mathSize as [number, number],
      x: 430, y: 20, opacity: 0});
    view.add(next);
    yield* all(
      instructionNodes[index].opacity(1, 0.4),
      highlight().opacity(1, 0.3), highlight().y(-90 + index * 100, 0.4, easeInOutCubic),
      next.opacity(1, 0.4), ...(activeExpression ? [activeExpression.opacity(0, 0.4)] : []),
    );
    activeExpression?.remove();
    activeExpression = next;
    yield* waitFor(1);
  }
  yield* waitFor(0.7);
  yield* all(instructionGroup().opacity(0, 0.5), activeExpression!.opacity(0, 0.5), simpleCaption().opacity(0, 0.5));
  const further = createRef<Txt>();
  view.add(<Txt ref={further} text="Can we take this further?" fontSize={80}
    fontWeight={500} fill={foreground} opacity={0}/>);
  yield* further().opacity(1, 0.5);
  yield* waitFor(2);
  yield* further().opacity(0, 0.5);
  yield* waitFor(0.3);

  const decisionCaption = createRef<Txt>();
  const pseudo = createRef<Txt>();
  const decisionImage = createRef<Img>();
  view.add(<>
    <Txt ref={decisionCaption} text="What about decisions?" y={-300}
      fontSize={72} fontWeight={500} fill={foreground} opacity={0}/>
    <Txt ref={pseudo} text={'if x < 0:\n    return -x\nelse:\n    return x'}
      x={-420} y={0} fontFamily="Cascadia Code, Consolas, monospace"
      fontSize={48} lineHeight={76} fill={foreground} opacity={0}/>
    <Img ref={decisionImage} src={assets.absolute.mathSvg} size={assets.absolute.mathSize as [number, number]}
      x={430} y={0} scale={1.4} opacity={0}/>
  </>);
  yield* decisionCaption().opacity(1, 0.4);
  yield* waitFor(0.8);
  yield* pseudo().opacity(1, 0.5);
  yield* waitFor(1.5);
  yield* decisionCaption().opacity(0, 0.25);
  decisionCaption().text('Make negative numbers positive.');
  yield* decisionCaption().opacity(1, 0.35);
  yield* waitFor(0.6);
  yield* decisionImage().opacity(1, 0.5);
  yield* waitFor(2);
  yield* all(decisionCaption().opacity(0, 0.3), decisionImage().opacity(0, 0.3), pseudo().opacity(0, 0.3));
  decisionCaption().text('What if the branches do different things?');
  decisionCaption().fontSize(60);
  pseudo().text('if x >= 0:\n    return x^2\nelse:\n    return -x');
  yield* decisionCaption().opacity(1, 0.4);
  yield* waitFor(0.5);
  yield* pseudo().opacity(1, 0.5);
  yield* waitFor(2);
  yield* decisionCaption().opacity(0, 0.25);
  decisionCaption().text('Can we still write one expression?');
  yield* decisionCaption().opacity(1, 0.35);
  yield* waitFor(1.5);
  yield* pseudo().opacity(0, 0.4);
  decisionImage().src(assets.decisionFormula.mathSvg);
  decisionImage().size(assets.decisionFormula.mathSize as [number, number]);
  decisionImage().position([0, 20]);
  decisionImage().scale(1.65);
  yield* decisionImage().opacity(1, 0.6);
  yield* waitFor(1.7);
  yield* decisionCaption().opacity(0, 0.25);
  decisionCaption().text('The condition becomes part of the math.');
  yield* decisionCaption().opacity(1, 0.35);
  decisionImage().src(assets.highlightedDecision.mathSvg);
  yield* waitFor(2.5);
  yield* all(decisionCaption().opacity(0, 0.5), decisionImage().opacity(0, 0.5));
  const introduction = createRef<Txt>();
  view.add(<Txt ref={introduction} text="Working these out by hand gets messy."
    fontSize={64} fill={foreground} opacity={0}/>);
  yield* introduction().opacity(1, 0.4);
  yield* waitFor(1.6);
  yield* introduction().opacity(0, 0.3);
  introduction().text('So I built something that does it for you.');
  yield* introduction().opacity(1, 0.4);
  yield* waitFor(1.8);
  yield* introduction().opacity(0, 0.35);
  introduction().text('Aalwyn');
  introduction().fontSize(120);
  introduction().fontWeight(600);
  introduction().fill(accent);
  yield* introduction().opacity(1, 0.5);
  yield* waitFor(1.6);
  yield* introduction().opacity(0, 0.4);
  const review = createRef<Node>();
  view.add(<Node ref={review} opacity={0}>
    <Txt text="Here’s the same decision in Aalwyn." y={-270} fontSize={60} fill={foreground}/>
    <Code code={assets.decisionSource.trimEnd()} fontFamily="Cascadia Code, Consolas, monospace"
      fontSize={46} lineHeight={78} highlighter={aalwynHighlighter}/>
  </Node>);
  yield* review().opacity(1, 0.5);
  // A deliberate reading pause before the established code-to-math walkthrough.
  yield* waitFor(3.5);
  yield* review().opacity(0, 0.5);
});
