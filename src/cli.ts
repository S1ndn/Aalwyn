import { readFileSync } from "node:fs";
import { compile, AalwynError } from "./compiler/compiler";
const [path, name] = process.argv.slice(2);
if (!path) {
  console.error("Usage: npm run compile -- examples/distance.aal [function]");
  process.exitCode = 1;
} else
  try {
    console.log(compile(readFileSync(path, "utf8"), name).latex);
  } catch (e) {
    console.error(
      e instanceof AalwynError
        ? `Line ${e.line}, column ${e.column}: ${e.message}`
        : String(e),
    );
    process.exitCode = 1;
  }
