import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { configJsonSchema } from "../src/config/json-schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(__dirname, "../docs/reference/config.schema.json");

writeFileSync(outputPath, JSON.stringify(configJsonSchema, null, 2));
console.log(`Wrote ${outputPath}`);
