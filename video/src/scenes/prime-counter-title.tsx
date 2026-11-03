import {Node, Txt, makeScene2D} from '@motion-canvas/2d';
import {all, createRef, easeOutCubic, waitFor} from '@motion-canvas/core';
export default makeScene2D(function* (view) {
  view.fill('#141619'); view.fontFamily('Segoe UI');
  const title=createRef<Node>();
  view.add(<Node ref={title} opacity={0} y={14}>
    <Txt text="Let's make our own" y={-60} fontSize={68} fill="#f0f0f0"/>
    <Txt text="prime counter in Aalwyn" y={40} fontSize={68} fill="#f0f0f0"/>
  </Node>);
  yield* waitFor(0.5);
  yield* all(title().opacity(1,0.6),title().y(0,0.6,easeOutCubic));
  yield* waitFor(3.4);
  yield* title().opacity(0,0.7);
  yield* waitFor(0.5);
});
