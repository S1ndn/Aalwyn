import {createRequire} from 'node:module';
const require = createRequire(new URL('../package.json', import.meta.url));
const {mathjax} = require('mathjax-full/js/mathjax.js');
const {TeX} = require('mathjax-full/js/input/tex.js');
const {SVG} = require('mathjax-full/js/output/svg.js');
const {liteAdaptor} = require('mathjax-full/js/adaptors/liteAdaptor.js');
const {RegisterHTMLHandler} = require('mathjax-full/js/handlers/html.js');
const {AllPackages} = require('mathjax-full/js/input/tex/AllPackages.js');
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const document = mathjax.document('', {InputJax: new TeX({packages: AllPackages}), OutputJax: new SVG({fontCache: 'none'})});
export function renderedEquation(tex: string) {
  let svg = adaptor.innerHTML(document.convert(tex, {display: true}));
  if (svg.includes('data-mjx-error')) throw new Error('Invalid equation SVG');
  svg = svg.replace(/currentColor/g, '#f0f0f0');
  const bounds = /viewBox="([^"]+)"/.exec(svg)![1].split(/\s+/).map(Number);
  const factor = Math.min(64 / 1000, 730 / bounds[2], 300 / bounds[3]);
  return {mathSvg: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64'), mathSize: [bounds[2] * factor, bounds[3] * factor]};
}

