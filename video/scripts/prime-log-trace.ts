import {readFileSync, writeFileSync} from 'node:fs';
import {compile, evaluateFunction, latex} from '../../src/compiler/compiler';
import {trace} from '../../src/compiler/trace';
import {renderedEquation} from './math-svg';

const source = readFileSync('video/examples/prime-log.aal', 'utf8');
const full = trace(source);
const divisorBody = '= 0\n+= 1 ? (k % d == 0)';
const divisors = `sum d from 2 to k-1 (\n${divisorBody}\n)`;
const product = `prod k from 2 to n (\ndefine divisors ${divisors}\n= k\n^= 1 ? (divisors == 0) else 0\n)`;
const stages = [
  {line: 1, label: 'primeLog(n)', program: 'fn stage(int n ? n >= 2) = 1\nend'},
  {line: 2, label: 'primeLog(n)', program: 'fn stage(int n ? n >= 2) = 1\n*= prod k from 2 to n (= 1)\nend'},
  {line: 3, label: 'divisors', program: 'fn stage(int k ? k >= 2) = sum d from 2 to k-1 (= 0)\nend'},
  {line: 4, label: 'divisors', program: 'fn stage(int k ? k >= 2) = sum d from 2 to k-1 (= 0)\nend'},
  {line: 5, label: 'divisors', program: `fn stage(int k ? k >= 2) = ${divisors}\nend`},
  {line: 6, label: 'divisors', program: `fn stage(int k ? k >= 2) = ${divisors}\nend`},
  {line: 7, label: 'primeLog(n)', program: `fn stage(int n ? n >= 2) = 1\n*= prod k from 2 to n (= k)\nend`},
  {line: 8, label: 'primeLog(n)', program: `fn stage(int n ? n >= 2) = 1\n*= ${product}\nend`},
  {line: 9, label: 'primeLog(n)', program: `fn stage(int n ? n >= 2) = 1\n*= ${product}\nend`},
  {line: 10, label: 'primeLog(n)', program: source},
  {line: 11, label: 'primeLog(n)', program: source},
];
const steps = stages.map(stage => {
  const result = compile(stage.program);
  const value = stage.line >= 5 ? result.simplified : result.ir;
  const expression = latex(value);
  return {kind: 'start', line: stage.line, endLine: stage.line,
    source: source.split('\n')[stage.line - 1], title: '', caption: '', mathLabel: stage.label,
    ...renderedEquation(`${stage.label}=${expression}`),
    before: value, after: value, beforeLatex: expression, afterLatex: expression};
});
// Independent prime products check both the conditional selection and empty divisor sum at k=2.
const compiled = compile(source);
for (const [n, productValue] of [[2, 2], [4, 6], [5, 30], [10, 210], [12, 2310]]) {
  const actual = evaluateFunction(compiled, {n});
  if (Math.abs(actual - Math.log(productValue)) > 1e-10) throw new Error(`Incorrect primeLog(${n}): ${actual}`);
}
if (steps.at(-1)!.afterLatex !== latex(compiled.simplified)) throw new Error('Final animation differs from compiler output');
writeFileSync('video/src/trace.json', JSON.stringify({...full, showCaptions: false,
  timing: {line: 0.5, intro: 0.4, outro: 2}, steps}, null, 2) + '\n');
console.log(`Generated ${steps.length} compiler-backed primeLog stages; five numerical checks passed`);
