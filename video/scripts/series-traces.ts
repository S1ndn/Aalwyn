import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {compile, evaluateFunction, evaluateMath, latex, lower} from '../../src/compiler/compiler';
import {trace} from '../../src/compiler/trace';
import {renderedEquation} from './math-svg';
const manifest = JSON.parse(readFileSync('video/examples/series/manifest.json', 'utf8')) as {slug: string; title: string; hideDomain: boolean}[];
const checks = [
  [{x: 2}, 10], [{x: 2}, 12], [{x: 2, y: 6}, 4], [{n: 4}, 10],
  [{x: 1}, Math.sin(4)], [{x: 2}, 30], [{x: -2}, -2], [{x: -2}, 2],
] as [Record<string, number>, number][];
mkdirSync('video/src/series', {recursive: true});
for (const [index, item] of manifest.entries()) {
  const source = readFileSync(`video/examples/series/${item.slug}.aal`, 'utf8');
  const compiled = compile(source);
  const construction = trace(source);
  const signature = `${compiled.name}(${compiled.params.join(',')})`;
  const owner = compiled.ast.functions.find(fn => fn.name === compiled.name)!;
  const steps = construction.steps.filter(step => step.kind !== 'simplify').map(step => {
    let definition = step.definition;
    if (definition) {
      const definitions = owner.statements.filter(statement => statement.kind === 'define' && statement.line <= step.line);
      const expression = lower({...compiled.ast, functions: compiled.ast.functions.map(fn => fn === owner
        ? {...fn, statements: [...definitions, {kind: 'update' as const, op: '=',
          value: {kind: 'name' as const, name: definition!.name, line: step.line, column: 1}, line: step.line, column: 1}]}
        : fn)}, owner.name);
      definition = {...definition, expression, latex: latex(expression)};
    }
    return {...step, ...(definition ? {definition} : {}), ...renderedEquation(`${signature}=${step.afterLatex}`)};
  });
  const rawLatex = latex(compiled.ir);
  const last = steps.at(-1)!;
  steps.push({...last, kind: 'update', line: source.trimEnd().split('\n').length,
    endLine: source.trimEnd().split('\n').length, source: 'end', title: 'Finish',
    before: last.after, beforeLatex: last.afterLatex, after: compiled.ir, afterLatex: rawLatex,
    ...renderedEquation(`${signature}=${rawLatex}`)});
  const [inputs, expected] = checks[index];
  if (Math.abs(evaluateFunction(compiled, inputs) - expected) > 1e-10 || Math.abs(evaluateMath(compiled.ir, inputs) - expected) > 1e-10) throw new Error(`Failed ${item.slug}`);
  if (index === 6 && evaluateFunction(compiled, {x: 2}) !== 5) throw new Error('True conditional branch failed');
  if (index === 7 && (evaluateFunction(compiled, {x: 2}) !== 4 || evaluateFunction(compiled, {x: 0}) !== 0)) throw new Error('Conditional start boundary failed');
  const introRules = index === 6 ? [
    {expression: 'f(x)=x+3', when: 'when x is zero or positive'},
    {expression: 'f(x)=x', when: 'when x is negative'},
  ] : index === 7 ? [
    {expression: 'f(x)=x^2', when: 'when x is zero or positive'},
    {expression: 'f(x)=-x', when: 'when x is negative'},
  ] : undefined;
  writeFileSync(`video/src/series/${item.slug}.json`, JSON.stringify({...construction, steps, finalLatex: rawLatex, latex: `${signature}=${rawLatex}`,
    tutorialTitle: true, hideDomain: item.hideDomain, showCaptions: false, ...(introRules ? {introRules} : {}),
    timing: {line: 1, intro: 0.4, outro: 2}}, null, 2) + '\n');
  writeFileSync(`video/src/series/${item.slug}.tsx`, `import {createWalkthrough} from '../scenes/walkthrough';\nimport trace from './${item.slug}.json';\nexport default createWalkthrough(trace);\n`);
}
writeFileSync('video/src/tutorial-series.ts', `import {makeProject} from '@motion-canvas/core';\n${manifest.map((item, i) => `import clip${i} from './series/${item.slug}?scene';`).join('\n')}\nexport default makeProject({scenes: [${manifest.map((_, i) => `clip${i}`).join(', ')}]});\n`);
console.log(`Generated ${manifest.length} ordered tutorials; all numerical checks passed`);
