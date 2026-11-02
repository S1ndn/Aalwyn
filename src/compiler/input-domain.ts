import { evaluateMath, MathEvaluationError } from "./evaluate";
import type { MathDefinition, MathExpr } from "./math-ir";

export interface FunctionModel {
  simplified: MathExpr;
  params: string[];
  helpers: Record<string, MathDefinition>;
  domain?: MathExpr;
  parameterTypes?: Record<string, "real" | "int" | "natural">;
}

/** Domain metadata is compiled mathematical IR, never executed source code. */
export function evaluateFunction(
  model: FunctionModel,
  values: Readonly<Record<string, number>>,
): number {
  for (const param of model.params) {
    const value = Object.hasOwn(values, param) ? values[param] : NaN;
    if (!Number.isFinite(value))
      throw new MathEvaluationError(
        `Enter a finite real value for '${param}'.`,
      );
    const type = model.parameterTypes?.[param];
    if ((type === "int" || type === "natural") && !Number.isInteger(value))
      throw new MathEvaluationError(`'${param}' must be an integer.`);
    if (type === "natural" && value < 0)
      throw new MathEvaluationError(
        `'${param}' must be a natural number (0, 1, 2, …).`,
      );
  }
  if (model.domain) {
    let accepted = false;
    try {
      accepted = evaluateMath(model.domain, values, model.helpers) === 1;
    } catch (e) {
      if (!(e instanceof MathEvaluationError)) throw e;
    }
    if (!accepted)
      throw new MathEvaluationError(
        "Inputs violate a declared domain or a called function's input requirements.",
      );
  }
  return evaluateMath(model.simplified, values, model.helpers);
}

export function sampleFunction(
  model: FunctionModel,
  values: Record<string, number>,
): number | null {
  try {
    return evaluateFunction(model, values);
  } catch (e) {
    if (e instanceof MathEvaluationError) return null;
    throw e;
  }
}
