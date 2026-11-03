import type {MathExpr} from '../../src/compiler/math-ir';
import {num} from '../../src/compiler/math-ir';
import {isTotal} from '../../src/compiler/domain';
import {rational, simplify} from '../../src/compiler/simplify';

const constant = (e: MathExpr, n: bigint) => {
  const value = rational(e);
  return value !== undefined && value[0] === n * value[1];
};
const pack = (kind: 'add' | 'multiply', terms: MathExpr[]): MathExpr =>
  terms.length === 0 ? num(kind === 'add' ? 0 : 1) : terms.length === 1 ? terms[0] : {kind, terms};

/** Presentation cleanup: preserve term order and grouping; never factor or distribute. */
export function basicCleanup(expression: MathExpr): MathExpr {
  switch (expression.kind) {
    case 'number': case 'symbol': return expression;
    case 'function': return {...expression, args: expression.args.map(basicCleanup)};
    case 'aggregate': return {...expression, lower: basicCleanup(expression.lower),
      upper: basicCleanup(expression.upper), body: basicCleanup(expression.body)};
    case 'divide': case 'power': {
      const left = basicCleanup(expression.left), right = basicCleanup(expression.right);
      const result = {...expression, left, right};
      if (constant(right, 1n)) return left;
      if (rational(result)) return simplify(result);
      return result;
    }
    case 'multiply': {
      const terms = expression.terms.map(basicCleanup).filter(term => !constant(term, 1n));
      if (terms.some(term => constant(term, 0n)) && terms.every(term => isTotal(term))) return num(0);
      if (terms.every(term => rational(term))) return simplify(pack('multiply', terms));
      if (terms.length === 2 && constant(terms[0], -1n) && terms[1].kind === 'multiply' && constant(terms[1].terms[0], -1n))
        return basicCleanup(pack('multiply', terms[1].terms.slice(1)));
      return pack('multiply', terms);
    }
    case 'add': {
      const terms = expression.terms.map(basicCleanup).flatMap(term => term.kind === 'add' ? term.terms : [term])
        .filter(term => !constant(term, 0n));
      const kept: {term: MathExpr; base: MathExpr; negative: boolean}[] = [];
      for (const term of terms) {
        const negative = term.kind === 'multiply' && constant(term.terms[0], -1n);
        const base = negative ? pack('multiply', (term as Extract<MathExpr, {kind: 'multiply'}>).terms.slice(1)) : term;
        const opposite = isTotal(base) ? kept.findIndex(previous => previous.negative !== negative && JSON.stringify(previous.base) === JSON.stringify(base)) : -1;
        if (opposite >= 0) kept.splice(opposite, 1);
        else kept.push({term, base, negative});
      }
      return pack('add', kept.map(entry => entry.term));
    }
  }
}
