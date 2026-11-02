import { sampleFunction, type FunctionModel } from "../compiler/input-domain";

export interface GraphModel extends FunctionModel {}
export interface PlotPoint {
  x: number;
  y: number | null;
  connect: boolean;
}
export function samplePlot(
  model: GraphModel,
  variable: string,
  fixed: Record<string, number>,
  min: number,
  max: number,
  ySpan: number,
  count = 800,
): PlotPoint[] {
  if (
    ![min, max, ySpan, max - min].every(Number.isFinite) ||
    min >= max ||
    ySpan <= 0 ||
    !Number.isInteger(count) ||
    count < 2 ||
    count > 10000
  )
    throw new Error(
      "Enter finite ranges with min < max and a sample count from 2 to 10000.",
    );
  const constant = variable ? undefined : sampleFunction(model, fixed);
  const at = (x: number) =>
    constant !== undefined
      ? constant
      : sampleFunction(model, variable ? { ...fixed, [variable]: x } : fixed);
  const xs = Array.from(
    { length: count + 1 },
    (_, i) => min + ((max - min) * i) / count,
  );
  if (min < 0 && max > 0 && !xs.includes(0)) xs.push(0);
  // Integer-domain functions (symbolic aggregation bounds, for example)
  // should retain their isolated integer samples in ordinary small views.
  if (Math.floor(max) - Math.ceil(min) <= 200)
    for (let x = Math.ceil(min); x <= Math.floor(max); x++)
      if (!xs.includes(x)) xs.push(x);
  xs.sort((a, b) => a - b);
  let previous: PlotPoint | undefined;
  return xs.map((x) => {
    const y = at(x);
    let connect = false;
    if (previous && previous.y !== null && y !== null) {
      const midpoint = at((previous.x + x) / 2);
      // Break at undefined intervals and apparent jumps/poles. This is a
      // sampled preview, not a proof that every discontinuity was detected.
      connect =
        midpoint !== null &&
        Math.abs(midpoint - (previous.y + y) / 2) < ySpan * 0.012;
    }
    const point = { x, y, connect };
    previous = point;
    return point;
  });
}

function tickStep(span: number): number {
  const rough = span / 6,
    power = 10 ** Math.floor(Math.log10(rough)),
    fraction = rough / power;
  return (
    (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power
  );
}
const format = (n: number) => Number(n.toPrecision(5)).toString();

export function createGraph(host: HTMLElement) {
  host.innerHTML = `<div class="graph-title"><h3>Graph</h3><label>Variable <select aria-label="Graph variable"></select></label></div>
<div class="graph-ranges"><label>x min <input aria-label="Graph x minimum" type="number" value="-10" step="any"></label><label>x max <input aria-label="Graph x maximum" type="number" value="10" step="any"></label><label>y min <input aria-label="Graph y minimum" type="number" value="-10" step="any"></label><label>y max <input aria-label="Graph y maximum" type="number" value="10" step="any"></label><button type="button" class="graph-auto">Auto y</button></div>
<div class="graph-parameters"></div><canvas role="img" aria-label="Graph of the compiled mathematical expression"></canvas>
<div class="graph-probe"><label>Probe x <input aria-label="Graph probe x" type="number" value="0" step="any"></label><output aria-live="polite"></output></div><p class="graph-note" role="status"></p>`;
  const canvas = host.querySelector("canvas")!,
    select = host.querySelector("select")!,
    rangeInputs = Array.from(
      host.querySelectorAll<HTMLInputElement>(".graph-ranges input"),
    ),
    parameterHost = host.querySelector<HTMLDivElement>(".graph-parameters")!,
    probe = host.querySelector<HTMLInputElement>(".graph-probe input")!,
    output = host.querySelector("output")!,
    note = host.querySelector<HTMLParagraphElement>(".graph-note")!;
  let model: GraphModel | undefined,
    signature = "",
    frame = 0;
  const fixed = () =>
    Object.fromEntries(
      Array.from(parameterHost.querySelectorAll<HTMLInputElement>("input")).map(
        (input) => [
          input.dataset.parameter!,
          input.value === "" ? NaN : Number(input.value),
        ],
      ),
    );
  function probeValue() {
    if (!model) {
      output.textContent = "";
      return;
    }
    const x = Number(probe.value),
      values = fixed();
    if (probe.value === "" || !Number.isFinite(x)) {
      output.textContent = "Enter a finite probe value";
      return;
    }
    const y = sampleFunction(
      model,
      select.value ? { ...values, [select.value]: x } : values,
    );
    output.textContent =
      y === null
        ? "Outside declared domain, undefined, or outside numerical range"
        : `y = ${y.toPrecision(9)}`;
  }
  function draw() {
    const width = canvas.clientWidth,
      height = 280,
      dpr = window.devicePixelRatio || 1;
    if (!width) return;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "#1f1f1f";
    ctx.fillRect(0, 0, width, height);
    if (!model) {
      ctx.fillStyle = "#9d9d9d";
      ctx.font = "12px Consolas,monospace";
      ctx.fillText("Compile source to plot.", 16, 30);
      note.textContent = "Numerical preview of the compiled expression.";
      return;
    }
    output.textContent = "";
    const [xmin, xmax, ymin, ymax] = rangeInputs.map((input) =>
      input.value === "" ? NaN : Number(input.value),
    );
    if (
      ![xmin, xmax, ymin, ymax, ...Object.values(fixed())].every(
        Number.isFinite,
      ) ||
      xmin >= xmax ||
      ymin >= ymax ||
      Math.max(Math.abs(xmin), Math.abs(xmax), Math.abs(ymin), Math.abs(ymax)) >
        1e12 ||
      Math.min(xmax - xmin, ymax - ymin) < 1e-9
    ) {
      note.textContent =
        "Use finite ranges with min < max, a span of at least 1e-9, and bounds within ±1e12.";
      return;
    }
    const left = 48,
      right = width - 14,
      top = 12,
      bottom = height - 28;
    const px = (x: number) =>
        left + ((x - xmin) / (xmax - xmin)) * (right - left),
      py = (y: number) =>
        bottom - ((y - ymin) / (ymax - ymin)) * (bottom - top);
    ctx.font = "10px Consolas,monospace";
    ctx.lineWidth = 1;
    for (const axis of ["x", "y"]) {
      const min = axis === "x" ? xmin : ymin,
        max = axis === "x" ? xmax : ymax,
        step = tickStep(max - min);
      for (
        let tick = Math.ceil(min / step) * step, i = 0;
        tick <= max && i < 20;
        tick += step, i++
      ) {
        ctx.strokeStyle = "#2b2b2b";
        ctx.beginPath();
        if (axis === "x") {
          ctx.moveTo(px(tick), top);
          ctx.lineTo(px(tick), bottom);
        } else {
          ctx.moveTo(left, py(tick));
          ctx.lineTo(right, py(tick));
        }
        ctx.stroke();
        ctx.fillStyle = "#9d9d9d";
        ctx.textAlign = axis === "x" ? "center" : "right";
        ctx.fillText(
          format(tick),
          axis === "x" ? px(tick) : left - 6,
          axis === "x" ? height - 9 : py(tick) + 3,
        );
      }
    }
    ctx.strokeStyle = "#6e7681";
    ctx.beginPath();
    if (xmin <= 0 && xmax >= 0) {
      ctx.moveTo(px(0), top);
      ctx.lineTo(px(0), bottom);
    }
    if (ymin <= 0 && ymax >= 0) {
      ctx.moveTo(left, py(0));
      ctx.lineTo(right, py(0));
    }
    ctx.stroke();
    const count = Math.min(1600, Math.max(400, Math.round(width) * 2)),
      points = samplePlot(
        model,
        select.value,
        fixed(),
        xmin,
        xmax,
        ymax - ymin,
        count,
      );
    ctx.save();
    ctx.beginPath();
    ctx.rect(left, top, right - left, bottom - top);
    ctx.clip();
    ctx.strokeStyle = "#4fc1ff";
    ctx.fillStyle = "#4fc1ff";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const p of points) {
      if (p.y === null) continue;
      const y = Math.max(top - 1000, Math.min(bottom + 1000, py(p.y)));
      if (p.connect) ctx.lineTo(px(p.x), y);
      else ctx.moveTo(px(p.x), y);
    }
    ctx.stroke();
    // Isolated defined points (equality spikes, for example) must stay visible.
    points.forEach((p, i) => {
      if (
        p.y !== null &&
        !p.connect &&
        !points[i + 1]?.connect &&
        p.y >= ymin &&
        p.y <= ymax
      ) {
        ctx.beginPath();
        ctx.arc(px(p.x), py(p.y), 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
    const missing = points.filter((p) => p.y === null).length;
    note.textContent = `Compiled expression · ${points.length} samples${missing ? ` · ${missing} undefined/out of numeric range` : ""}. Gaps are preserved; narrow features may be missed.`;
    probeValue();
  }
  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(draw);
  }
  function parameters() {
    const previous = fixed();
    parameterHost.replaceChildren();
    for (const name of model?.params ?? [])
      if (name !== select.value) {
        const label = document.createElement("label");
        label.textContent = `${name} `;
        const input = document.createElement("input");
        input.type = "number";
        input.step = "any";
        input.value = String(previous[name] ?? 0);
        input.dataset.parameter = name;
        input.setAttribute("aria-label", `Graph fixed parameter ${name}`);
        input.oninput = schedule;
        label.append(input);
        parameterHost.append(label);
      }
    schedule();
  }
  select.onchange = parameters;
  rangeInputs.forEach((input) => (input.oninput = schedule));
  probe.oninput = probeValue;
  canvas.addEventListener("pointermove", (event) => {
    if (!model) return;
    const rect = canvas.getBoundingClientRect(),
      [min, max] = rangeInputs.slice(0, 2).map((input) => Number(input.value));
    probe.value = String(
      min +
        Math.max(
          0,
          Math.min(1, (event.clientX - rect.left - 48) / (rect.width - 62)),
        ) *
          (max - min),
    );
    probeValue();
  });
  host.querySelector<HTMLButtonElement>(".graph-auto")!.onclick = () => {
    if (!model) return;
    const [min, max] = rangeInputs
      .slice(0, 2)
      .map((input) => Number(input.value));
    if (!Number.isFinite(min) || !Number.isFinite(max) || min >= max) return;
    const ys = samplePlot(model, select.value, fixed(), min, max, 20)
      .flatMap((p) => (p.y === null ? [] : [p.y]))
      .sort((a, b) => a - b);
    if (!ys.length) {
      note.textContent = "No defined samples in this range.";
      return;
    }
    const low = ys[Math.floor(ys.length * 0.02)],
      high = ys[Math.floor((ys.length - 1) * 0.98)],
      padding = Math.max((high - low) * 0.1, 0.5);
    rangeInputs[2].value = String(Math.max(-1e12, low - padding));
    rangeInputs[3].value = String(Math.min(1e12, high + padding));
    schedule();
  };
  new ResizeObserver(schedule).observe(canvas);
  schedule();
  return {
    update(next: GraphModel) {
      model = next;
      const key = next.params.join(",");
      if (key !== signature || !select.options.length) {
        signature = key;
        select.replaceChildren();
        for (const p of next.params) select.add(new Option(p, p));
        if (!next.params.length) select.add(new Option("Constant", ""));
        select.disabled = !next.params.length;
        select.value = next.params.includes("x") ? "x" : (next.params[0] ?? "");
        parameterHost.replaceChildren();
      }
      parameters();
    },
    clear() {
      model = undefined;
      output.textContent = "";
      schedule();
    },
  };
}
