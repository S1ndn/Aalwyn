import { MathEvaluationError } from "../compiler/evaluate";
import { evaluateFunction } from "../compiler/input-domain";
import type { compile } from "../compiler/compiler";

/** This panel consumes only the compiled mathematical model. */
export function createFunctionInput(host: HTMLElement) {
  host.className = "function-input";
  const form = document.createElement("form");
  const heading = document.createElement("h3");
  heading.textContent = "Evaluate function";
  const fields = document.createElement("div");
  const button = document.createElement("button");
  button.textContent = "Evaluate";
  const output = document.createElement("output");
  output.setAttribute("aria-live", "polite");
  output.setAttribute("aria-label", "Function value");
  form.append(heading, fields, button, output);
  host.append(form);
  let model: ReturnType<typeof compile> | undefined;
  let inputs: HTMLInputElement[] = [];
  const evaluate = () => {
    if (!model) return;
    try {
      const values = Object.fromEntries(
        inputs.map((input, i) => {
          if (!input.value.trim() || !Number.isFinite(Number(input.value)))
            throw new MathEvaluationError(
              `Enter a finite number for ${model!.params[i]}`,
            );
          return [model!.params[i], Number(input.value)];
        }),
      );
      const value = evaluateFunction(model, values);
      output.className = "success";
      output.textContent = `${model.name}(${model.params.map((p) => values[p]).join(", ")}) ≈ ${Number(value.toPrecision(12)).toString()}`;
    } catch (error) {
      output.className = "error";
      output.textContent =
        error instanceof MathEvaluationError ? error.message : String(error);
    }
  };
  form.onsubmit = (event) => {
    event.preventDefault();
    evaluate();
  };
  return {
    update(next: ReturnType<typeof compile>) {
      const previous = new Map(
        inputs.map((input) => [input.name, input.value]),
      );
      model = next;
      fields.replaceChildren();
      inputs = next.params.map((param) => {
        const label = document.createElement("label");
        label.append(document.createTextNode(`${param} `));
        const input = document.createElement("input");
        input.type = "number";
        input.step = next.parameterTypes[param] === "real" ? "any" : "1";
        if (next.parameterTypes[param] === "natural") input.min = "0";
        input.name = param;
        input.setAttribute("aria-label", `Value for ${param}`);
        input.value = previous.get(param) ?? "0";
        input.oninput = evaluate;
        label.append(input);
        fields.append(label);
        return input;
      });
      host.hidden = false;
      evaluate();
    },
    clear() {
      model = undefined;
      output.textContent = "";
      host.hidden = true;
    },
  };
}
