import { zodToJsonSchema } from "zod-to-json-schema";
import { configSchema } from "./schema.js";

const baseSchema = zodToJsonSchema(configSchema, {
  name: "AgentGateConfig",
  target: "jsonSchema2019-09"
});

export const configJsonSchema = {
  $schema: "https://json-schema.org/draft/2019-09/schema",
  ...baseSchema
};
