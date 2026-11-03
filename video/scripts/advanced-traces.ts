import {readFileSync, writeFileSync, mkdirSync, existsSync} from 'node:fs';
import {compile, evaluateFunction, evaluateMath, latex} from '../../src/compiler/compiler';
import {renderedEquation} from './math-svg';
import {basicCleanup} from './basic-cleanup';
const slash = String.fromCharCode(92);
const wrap = (body: string, params = 'int n', name = 'f') => `fn ${name}(${params})\n${body}\nend`;
const sum = (body: string) => `sum i from 1 to n (\n${body}\n)`;
const prod = (body: string) => `prod k from 1 to n (\n${body}\n)`;
const read = (slug: string) => readFileSync(`video/examples/advanced/${slug}.aal`, 'utf8');
type Feature = {line: number; token: string; kind?: string; note?: string; tex?: string; target?: string};
type Stage = {line: number; label: string; program: string; features?: Feature[]};
type Example = {slug: string; source: string; stages: Stage[]; inputs: Record<string, number>; expected: number;
  fullCleanup?: boolean; introRules?: {expression: string; when: string}[]; initialSignature?: string;
  auxiliaryFromLine?: number; auxiliaryMath?: ReturnType<typeof renderedEquation>[]; introTex?: string};
const examples: Example[] = [];
const sSource = read('01-sum');
examples.push({slug: '01-sum', source: sSource, inputs: {n: 4}, expected: 30, stages: [
  {line: 2, label: 's(n)', program: wrap(`= ${sum('= 0')}`), features: [{line: 2, token: 'sum i from 1 to n', note: 'Add the terms for i = 1 through n.', target: `${slash}sum_{i=1}^{n}`}]},
  {line: 3, label: 's(n)', program: wrap(`= ${sum('= i')}`)},
  {line: 4, label: 's(n)', program: sSource},
  {line: 5, label: 's(n)', program: sSource},
]});
const pSource = read('02-product');
examples.push({slug: '02-product', source: pSource, inputs: {n: 4}, expected: 0.2, stages: [
  {line: 2, label: 'p(n)', program: wrap(`= ${prod('= 1')}`), features: [{line: 2, token: 'prod k from 1 to n', note: 'Multiply the terms for k = 1 through n.', target: `${slash}prod_{k=1}^{n}`}]},
  {line: 3, label: 'p(n)', program: wrap(`= ${prod('= k')}`)},
  {line: 4, label: 'p(n)', program: pSource},
  {line: 5, label: 'p(n)', program: pSource},
]});
const s = sum('= i^2'), p = prod('= k/(k+1)');
const namedSource = read('03-define-aggregates');
examples.push({slug: '03-define-aggregates', source: namedSource, inputs: {n: 4}, expected: 30.2, stages: [
  {line: 2, label: 's', program: wrap(`= ${sum('= 0')}`)},
  {line: 3, label: 's', program: wrap(`= ${s}`)},
  {line: 4, label: 's', program: wrap(`= ${s}`), features: [{line: 2, token: 'define s', note: 'Give the sum a name.'}]},
  {line: 5, label: 'p', program: wrap(`= ${prod('= 1')}`)},
  {line: 6, label: 'p', program: wrap(`= ${p}`)},
  {line: 7, label: 'p', program: wrap(`= ${p}`), features: [{line: 5, token: 'define p', note: 'Give the product a name.'}]},
  {line: 8, label: 'f(n)', program: namedSource},
]});
const auxSource = read('04-aux-functions');
const auxCompiled = compile(auxSource);
const auxBody = latex(compile(wrap('= x^2+1', 'x')).ir);
const auxFormula = `f(x)=${auxBody}`;
examples.push({slug: '04-aux-functions', source: auxSource, inputs: {x: 2}, expected: 15,
  initialSignature: 'f(x)', auxiliaryFromLine: 4, auxiliaryMath: [renderedEquation(auxFormula)],
  introTex: `${slash}begin{gathered}${auxFormula}${slash}${slash}[0.6em]g(x)=${latex(auxCompiled.ir)}${slash}end{gathered}`,
  stages: [
    {line: 1, label: 'f(x)', program: wrap('= x^2+1', 'x')},
    {line: 2, label: 'f(x)', program: wrap('= x^2+1', 'x')},
    {line: 4, label: 'g(x)', program: auxSource.replace('    += f(x+1)\n', ''), features: [{line: 1, token: 'aux', kind: 'aux', note: 'Keep f(x) as a named function call.', target: `f${slash}left(x${slash}right)`}]},
    {line: 5, label: 'g(x)', program: auxSource},
]});
const moduloSource = read('05-modulo-conditions');
const filtered = (body: string) => `sum k from 1 to n (\n${body}\n)`;
examples.push({slug: '05-modulo-conditions', source: moduloSource, inputs: {n: 10}, expected: 184, fullCleanup: true,
  introRules: [
    {expression: `${slash}sum_{k=1}^{n}k^2`, when: 'keep even k, excluding multiples of 3'},
    {expression: `${slash}text{skip }k`, when: 'otherwise'},
  ], stages: [
    {line: 2, label: 'q(n)', program: wrap(`= ${filtered('= 0')}`)},
    {line: 3, label: 'q(n)', program: moduloSource, features: [
      {line: 3, token: '%', note: '% gives the remainder after division.', tex: `${slash}begin{gathered}${slash}operatorname{mod}(6,2)=0${slash}${slash}[0.5em]${slash}operatorname{mod}(5,2)=1${slash}end{gathered}`},
      {line: 3, token: 'and', note: 'Both conditions must be true.', tex: `${slash}begin{gathered}k${slash}bmod2=0${slash}quad${slash}land${slash}quad k${slash}bmod3${slash}ne0${slash}${slash}[0.6em]k=2${slash}Rightarrow4${slash}qquad k=6${slash}Rightarrow0${slash}end{gathered}`},
    ]},
    {line: 4, label: 'q(n)', program: moduloSource},
]});
const usingSource = read('06-using-block');
const body = ['= x', '+= 3', '^= 2', '>> sin'];
examples.push({slug: '06-using-block', source: usingSource, inputs: {x: 1}, expected: Math.sin(16) + Math.sin(16)**2, stages: [
  {line: 2, label: `${slash}mathrm{wave}`, program: wrap('= 0', 'x'), features: [{line: 2, token: 'using (', note: 'Build this definition with its own instructions.'}]},
  ...body.map((_, i) => ({line: i+3, label: `${slash}mathrm{wave}`, program: wrap(body.slice(0,i+1).join('\n'), 'x')})),
  {line: 7, label: `${slash}mathrm{wave}`, program: wrap(body.join('\n'), 'x')},
  {line: 8, label: 'h(x)', program: usingSource.replace('    += wave^2\n','')},
  {line: 9, label: 'h(x)', program: usingSource},
]});
mkdirSync('video/src/advanced', {recursive: true});
for (const example of examples) {
  const full = compile(example.source);
  let previous = {kind: 'number' as const, value: '0'} as typeof full.ir;
  const steps = example.stages.map(stage => {
    const result = compile(stage.program);
    const expression = latex(result.ir);
    const features = (stage.features ?? []).map(feature => {
      let tex = feature.tex ?? `${stage.label}=${expression}`;
      if (feature.target) {
        const offset = tex.lastIndexOf(feature.target);
        if (offset < 0) throw new Error(`Highlight not found: ${example.slug}`);
        tex = tex.slice(0,offset) + `{${slash}color{#4fc1ff}${feature.target}}` + tex.slice(offset+feature.target.length);
      }
      return {...feature, kind: feature.kind ?? 'visual', ...renderedEquation(tex)};
    });
    const step = {kind: 'update', line: stage.line, endLine: stage.line,
      source: example.source.split('\n')[stage.line-1], title: '', before: previous, after: result.ir,
      beforeLatex: latex(previous), afterLatex: expression, mathLabel: stage.label,
      ...renderedEquation(`${stage.label}=${expression}`), spotlights: features};
    previous = result.ir;
    return step;
  });
  const signature = `${full.name}(${full.params.join(',')})`;
  const raw = latex(full.ir), cleaned = example.fullCleanup ? full.simplified : basicCleanup(full.ir);
  if (!example.fullCleanup && latex(cleaned) !== raw) throw new Error(`Known target changed: ${example.slug}`);
  const endLine = example.source.trimEnd().split('\n').length;
  const last = steps.at(-1)!;
  steps.push({...last, line: endLine, endLine, source: 'end', before: previous, after: full.ir,
    beforeLatex: latex(previous), afterLatex: raw, mathLabel: signature, spotlights: [], ...renderedEquation(`${signature}=${raw}`)});
  steps.push({...steps.at(-1)!, kind: 'simplify', after: cleaned, afterLatex: latex(cleaned), ...renderedEquation(`${signature}=${latex(cleaned)}`)});
  const actual = evaluateFunction(full, example.inputs);
  if (Math.abs(actual-example.expected)>1e-10) throw new Error(`${example.slug}: ${actual}`);
  writeFileSync(`video/src/advanced/${example.slug}.json`, JSON.stringify({version: 1,
    source: example.source, name: full.name, params: full.params, domainLatex: full.domainLatex,
    auxiliaryExports: full.auxiliaryExports, finalLatex: latex(cleaned), steps,
    introMath: renderedEquation(example.introTex ?? `${signature}=${raw}`), introRules: example.introRules,
    auxiliaryMath: example.auxiliaryMath, auxiliaryFromLine: example.auxiliaryFromLine,
    initialSignature: example.initialSignature, hideDomain: !example.source.includes('int '),
    tutorialTitle: true, showCaptions: false, timing: {line: 1, intro: 0.4, outro: 2}}, null, 2)+'\n');
  writeFileSync(`video/src/advanced/${example.slug}.tsx`, `import {createWalkthrough} from '../scenes/walkthrough';\nimport trace from './${example.slug}.json';\nexport default createWalkthrough(trace);\n`);
}
for (const [n, expected] of [[1,0],[2,4],[6,20],[10,184]]) {
  if (evaluateFunction(compile(moduloSource), {n}) !== expected) throw new Error('Modulo selection check failed');
}
if (evaluateFunction(compile(sSource), {n: 0}) !== 0 || evaluateFunction(compile(pSource), {n: 0}) !== 1)
  throw new Error('Empty aggregation identity check failed');
writeFileSync('video/src/advanced-tutorials.ts', `import {makeProject} from '@motion-canvas/core';\n${examples.map((e,i)=>`import scene${i} from './advanced/${e.slug}?scene';`).join('\n')}\nexport default makeProject({scenes: [${examples.map((_,i)=>`scene${i}`).join(', ')}]});\n`);
if (!existsSync('video/src/advanced-tutorials.meta')) writeFileSync('video/src/advanced-tutorials.meta', readFileSync('video/src/project.meta','utf8'));
console.log('Generated six advanced chapters; aggregate, helper, modulo, and using-block checks passed');
