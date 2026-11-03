import {readFileSync, writeFileSync} from 'node:fs';
import {compile, evaluateFunction, latex} from '../../src/compiler/compiler';
import {renderedEquation} from './math-svg';
import {trace} from '../../src/compiler/trace';
const compiled = compile(readFileSync('video/examples/willans.aal', 'utf8'));
const tex = `w(n)=${compiled.expressionLatex}`;
const formula = renderedEquation(tex);
const slash = String.fromCharCode(92);
const sigma = `${slash}sum_{i=1}^{2^{n}}`;
const indicator = compile('fn indicator(int j ? j >= 1) = ((j-1)!+1)/j\n*= pi\n>> cos\n^= 2\n>> floor\nend').expressionLatex;
if (!tex.includes(sigma) || !tex.includes(indicator)) throw new Error('Highlight does not match the actual formula');
const highlight = (target: string) => renderedEquation(tex.replace(target, `{${slash}color{#4fc1ff}${target}}`));
const loopHighlight = highlight(sigma);
const primeHighlight = highlight(indicator);
const simpleSource = 'fn f(real x) = x^2\n+= 3*x\n>> sin\nend';
const simple = compile(simpleSource);
const simpleFormula = renderedEquation(`f(x)=${latex(simple.ir)}`);
const simpleStages = [
  compile('fn f(real x) = x^2\nend'),
  compile('fn f(real x) = x^2\n+= 3*x\nend'),
  simple,
].map(stage => renderedEquation(`a=${latex(stage.ir)}`));
for (const x of [-2, 0, 1, 3]) {
  if (Math.abs(evaluateFunction(simple, {x}) - Math.sin(x*x+3*x)) > 1e-12)
    throw new Error('Simple instruction example differs from sin(x² + 3x)');
}
const decisionSource = readFileSync('video/examples/decision.aal', 'utf8');
const decision = compile(decisionSource);
const absolute = renderedEquation(`${slash}operatorname{f}(x)=${slash}left|x${slash}right|`);
const decisionFormula = renderedEquation(`${slash}operatorname{f}(x)=${decision.expressionLatex}`);
const gate = compile('fn gate(real x) = 0\n+= 1 ? (x >= 0)\nend').expressionLatex;
const highlightedDecision = renderedEquation(`${slash}operatorname{f}(x)=${decision.expressionLatex.replace(gate, `{${slash}color{#4fc1ff}${gate}}`)}`);
for (const x of [-3, -0.5, 0, 0.5, 2]) {
  const expected = x >= 0 ? x*x : -x;
  if (Math.abs(evaluateFunction(decision, {x}) - expected) > 1e-12)
    throw new Error(`Incorrect conditional at x=${x}`);
}
const decisionTrace = trace(decisionSource);
const assignment = decisionTrace.steps.find(step => step.line === 2)!;
const decisionSteps = [
  {...assignment, after: decision.simplified, afterLatex: decision.expressionLatex,
    ...renderedEquation(`f(x)=${decision.expressionLatex}`)},
  {...assignment, kind: 'simplify', line: 3, endLine: 3, source: 'end',
    after: decision.simplified, afterLatex: decision.expressionLatex,
    ...renderedEquation(`f(x)=${decision.expressionLatex}`)},
];
writeFileSync('video/src/decision-trace.json', JSON.stringify({...decisionTrace,
  showCaptions: false, skipFormulaIntro: true, timing: {line: 0.5, intro: 0.4, outro: 2},
  steps: decisionSteps}, null, 2) + '\n');
const examples = [1, 2, 3, 6].map(n => {
  const prime = evaluateFunction(compiled, {n});
  const expected = ({1: 2, 2: 3, 3: 5, 6: 13} as Record<number, number>)[n];
  if (prime !== expected) throw new Error(`Incorrect w(${n})`);
  return {n, prime, ...renderedEquation(`w(${n})=${prime}`)};
});
writeFileSync('video/src/opening-assets.json', JSON.stringify({formula, loopHighlight, primeHighlight, examples, simpleFormula, simpleStages, absolute, decisionFormula, highlightedDecision, decisionSource}, null, 2) + '\n');
console.log('Generated Willans formula and verified four prime outputs');
