import {readFileSync, writeFileSync} from 'node:fs';
import {compile, evaluateFunction} from '../../src/compiler/compiler';
import {renderedEquation} from './math-svg';
const compiled = compile(readFileSync('video/examples/willans.aal', 'utf8'));
const formula = renderedEquation(`w(n)=${compiled.expressionLatex}`);
const examples = [1, 2, 3, 6].map(n => {
  const prime = evaluateFunction(compiled, {n});
  const expected = ({1: 2, 2: 3, 3: 5, 6: 13} as Record<number, number>)[n];
  if (prime !== expected) throw new Error(`Incorrect w(${n})`);
  return {n, prime, ...renderedEquation(`w(${n})=${prime}`)};
});
writeFileSync('video/src/opening-assets.json', JSON.stringify({formula, examples}, null, 2) + '\n');
console.log('Generated Willans formula and verified four prime outputs');
