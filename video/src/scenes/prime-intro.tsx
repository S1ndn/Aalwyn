import {Img, Line, Node, Txt, makeScene2D} from '@motion-canvas/2d';
import {all, createRef, easeInOutCubic, easeOutCubic, sequence, waitFor} from '@motion-canvas/core';
import assets from '../opening-assets.json';

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
});
