import { createDateTool } from "./tools/date.ts";
import { createGlossaryTool } from "./tools/glossary.ts";
import { createKeywordTool } from "./tools/keyword.ts";
import { createQueryTool } from "./tools/query.ts";

export type ToolDefinition = Array<{
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}>;

export interface ToolRuntimeConfig {
  hfToken: string;
  hfApiUrl: string;
  hfKeywordModel?: string;
}

type ToolExecutor = (args: Record<string, unknown>) => Promise<unknown> | unknown;

export function createToolRuntime(config: ToolRuntimeConfig) {
  if (!config.hfToken) {
    throw new Error("HF token must be provided to create tool runtime");
  }

  const keywordTool = createKeywordTool({
    hfToken: config.hfToken,
    hfApiUrl: config.hfApiUrl,
    hfKeywordModel: config.hfKeywordModel
  });
  const dateTool = createDateTool();
  const glossaryTool = createGlossaryTool();
  const queryTool = createQueryTool();

  const registry = new Map<string, { definition: ToolDefinition[number]; execute: ToolExecutor }>([
    [keywordTool.definition.function.name, keywordTool],
    [dateTool.definition.function.name, dateTool],
    [glossaryTool.definition.function.name, glossaryTool],
    [queryTool.definition.function.name, queryTool]
  ]);

  function buildToolDefinitions(): ToolDefinition {
    return Array.from(registry.values()).map((entry) => entry.definition);
  }

  async function runTool(name: string | undefined, args: Record<string, unknown>) {
    if (!name) {
      throw new Error("Tool name is required");
    }

    const entry = registry.get(name);
    if (!entry) {
      throw new Error(`Unsupported tool: ${name}`);
    }

    return await entry.execute(args);
  }

  return {
    buildToolDefinitions,
    runTool
  };
}
