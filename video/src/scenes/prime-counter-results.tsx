import {Img, Node, Txt, makeScene2D} from '@motion-canvas/2d';
import {all, createRef, waitFor} from '@motion-canvas/core';
import results from '../prime-finale/results.json';
export default makeScene2D(function* (view) {
  view.fill('#141619'); view.fontFamily('Segoe UI');
  const group=createRef<Node>();
  view.add(<Node ref={group}>
    <Txt text="Count the primes up to n." y={-300} fontSize={56} fill="#f0f0f0" opacity={0}/>
  </Node>);
  yield* waitFor(0.4);
  yield* group().children()[0].opacity(1,0.5);
  for(const [i,asset] of results.entries()) {
    const image=new Img({src:asset.mathSvg,size:asset.mathSize as [number,number],y:-115+i*150,opacity:0});
    group().add(image); yield* image.opacity(1,0.5); yield* waitFor(0.8);
  }
  yield* waitFor(1.8);
  yield* group().opacity(0,0.8);
  yield* waitFor(0.6);
});
