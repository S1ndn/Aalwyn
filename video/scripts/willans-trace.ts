import {writeFileSync} from 'node:fs';
import {readFileSync} from 'node:fs';
import {compile, latex} from '../../src/compiler/compiler';
import {trace} from '../../src/compiler/trace';
import {renderedEquation} from './math-svg';

const source = readFileSync('video/examples/willans.aal', 'utf8');
const full = trace(source);
const detector = ['= ((j-1)! + 1)/j', '*= pi', '>> cos', '^= 2', '>> floor'];
const detectorBody = detector.join('\n');
const count = `sum j from 1 to i (\n${detectorBody}\n)`;
const outer = ['= n/count', '>> floor', '^= 1/n', '>> floor'];
const stages: {line: number; label: string; caption: string; program: string}[] = [
  {line: 1, label: 'willans(n)', caption: 'Start at 1', program: 'fn stage(int n ? n >= 1) = 1\nend'},
  {line: 2, label: 'willans(n)', caption: 'Sum from 1 to 2ⁿ', program: 'fn stage(int n ? n >= 1) = 1\n+= sum i from 1 to 2^n (= 0)\nend'},
  {line: 3, label: 'count', caption: 'Build the prime counter', program: 'fn stage(int i) = sum j from 1 to i (= 0)\nend'},
];
const captions = ['Start with the Wilson quotient', 'Multiply by π', 'Apply the cosine function', 'Square', 'Round down'];
detector.forEach((_, index) => stages.push({
  line: index + 4, label: 'count', caption: captions[index],
  program: `fn stage(int i ? i >= 1) = sum j from 1 to i (\n${detector.slice(0, index + 1).join('\n')}\n)\nend`,
}));
stages.push({line: 9, label: 'count', caption: 'Sum the prime indicators', program: `fn stage(int i ? i >= 1) = ${count}\nend`});
const outerCaptions = ['Divide n by the count', 'Round down', 'Take the nth root', 'Round down'];
outer.forEach((_, index) => stages.push({
  line: index + 10, label: 'willans(n)', caption: outerCaptions[index],
  program: `fn stage(int n ? n >= 1) = 1\n+= sum i from 1 to 2^n (\ndefine count ${count}\n${outer.slice(0, index + 1).join('\n')}\n)\nend`,
}));
stages.push({line: 14, label: 'willans(n)', caption: 'Add the outer sum', program: source});
stages.push({line: 15, label: 'willans(n)', caption: 'Done!', program: source});
const steps = stages.map(stage => {
  const result = compile(stage.program);
  return {kind: 'start', line: stage.line, endLine: stage.line,
    source: source.split('\n')[stage.line - 1], title: stage.caption,
    caption: stage.caption, mathLabel: stage.label,
    ...renderedEquation(`${stage.label ? stage.label + "=" : ""}${latex(result.ir)}`),
    before: result.ir, after: result.ir, beforeLatex: latex(result.ir), afterLatex: latex(result.ir)};
});
if (steps.at(-1)!.afterLatex !== latex(compile(source).ir)) throw new Error('Final formula differs from compiler output');
writeFileSync('video/src/trace.json', JSON.stringify({...full, showCaptions: false, timing: {line: 0.5, intro: 0.4, outro: 2}, steps}, null, 2) + '\n');
console.log(`Generated ${steps.length} compiler-backed Willans stages`);
