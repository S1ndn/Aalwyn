import { readFileSync, writeFileSync } from "node:fs";
import { trace } from "./compiler/trace";

const args = process.argv.slice(2);
const outputFlag = args.indexOf("--out");
const output = outputFlag >= 0 ? args[outputFlag + 1] : undefined;
if (outputFlag >= 0) args.splice(outputFlag, 2);
try {
  if (!args[0] || (outputFlag >= 0 && !output)) throw new Error("Usage: npm run trace -- source.aal [function] [--out trace.json]");
  const result = JSON.stringify(trace(readFileSync(args[0], "utf8"), args[1]), null, 2) + "\n";
  if (output) writeFileSync(output, result); else process.stdout.write(result);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
