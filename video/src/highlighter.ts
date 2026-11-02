import type {CodeHighlighter} from '@motion-canvas/2d';
import {highlight} from '../../src/playground/highlight';

type Span = {from: number; to: number; color: string | null};
const control = new Set(['end', 'else', 'and', 'or', 'sum', 'prod', 'from', 'to', 'using', 'case']);
const types = new Set(['real', 'int', 'natural']);
const palette: Record<string, string> = {
  keyword: '#569cd6', function: '#dcdcaa', builtin: '#dcdcaa',
  number: '#b5cea8', comment: '#6a9955', constant: '#4fc1ff', context: '#4fc1ff',
  operator: '#d4d4d4', mutator: '#9cdcfe', apply: '#c586c0',
};
export const aalwynHighlighter: CodeHighlighter<Span[]> = {
  initialize: () => true,
  prepare(source) {
    let from = 0;
    return highlight(source).map(token => {
      const span = {from, to: from + token.text.length, color:
        types.has(token.text) ? '#4ec9b0' : control.has(token.text) ? '#c586c0' :
          token.style ? palette[token.style] ?? '#cccccc' : /^[A-Za-z_]/.test(token.text) ? '#9cdcfe' : null};
      from = span.to;
      return span;
    });
  },
  highlight(index, spans) {
    const span = spans.find(item => item.from <= index && index < item.to);
    return {color: span?.color ?? null, skipAhead: span ? span.to - index : 1};
  },
  tokenize: source => highlight(source).map(token => token.text),
};
