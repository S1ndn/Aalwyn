import {describe, expect, it} from 'vitest';
import {compile, evaluateMath, latex} from '../src/compiler/compiler';
import {basicCleanup} from '../video/scripts/basic-cleanup';
const expression = (body: string) => compile(`fn f(x) = ${body}\nend`).ir;
describe('video presentation cleanup', () => {
  it('keeps multiplication grouping, coefficient position, and sum order', () => {
    for (const body of ['(x+3)*2', '(x+3)^2+x+3', 'x^2+3*x+2']) {
      const before = expression(body);
      expect(latex(basicCleanup(before))).toBe(latex(before));
    }
  });
  it('removes neutral terms and double negatives', () => {
    expect(latex(basicCleanup(expression('-x-0')))).toBe('-x');
    expect(latex(basicCleanup(expression('-(-x)')))).toBe('x');
    expect(latex(basicCleanup(expression('(x+0)*1/1')))).toBe('x');
  });
  it('cancels opposite total terms without rearranging the survivors', () => {
    expect(latex(basicCleanup(expression('x+3-x')))).toBe('3');
    expect(latex(basicCleanup(expression('x^2+x+3-x')))).toBe('x^{2} + 3');
  });
  it('retains the domains of partial expressions during cancellation', () => {
    const cleaned = basicCleanup(expression('ln(x)-ln(x)'));
    expect(() => evaluateMath(cleaned, {x: -1})).toThrow();
    expect(evaluateMath(cleaned, {x: 2})).toBe(0);
  });
  it('does not erase an undefined reciprocal behind multiplication by zero', () => {
    const cleaned = basicCleanup(expression('0*(1/x)'));
    expect(() => evaluateMath(cleaned, {x: 0})).toThrow();
    expect(evaluateMath(cleaned, {x: 2})).toBe(0);
  });
});
