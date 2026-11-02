// Prior mathematical regressions remain useful: migrate their source fixtures
// to the new grammar, then exercise the real compiler and numeric evaluator.
export * from "../src/compiler/compiler";
import * as current from "../src/compiler/compiler";
import { migrateLegacySource } from "../src/compiler/migrate";
export const compile = (source: string, selected?: string) => {
  const upgraded = migrateLegacySource(source);
  if (upgraded === source) {
    try {
      current.parse(source);
    } catch {
      current.parse(source, true);
    }
  }
  return current.compile(upgraded, selected);
};
export const parse = (source: string) =>
  current.parse(migrateLegacySource(source));
