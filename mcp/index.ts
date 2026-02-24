import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getSheetNames, parseTableDefinitions, parseSheetRegion } from "../server/lib/excel";
import { generateDDL } from "../server/lib/ddl";
import type { TableInfo } from "../shared/schema";

const server = new Server(
  { name: "ddl-generator", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_excel_sheets",
      description: "指定した Excel ファイルのシート名一覧を返す",
      inputSchema: {
        type: "object" as const,
        properties: {
          filePath: {
            type: "string",
            description: "Excel ファイルのパス（絶対パスまたはプロジェクトルートからの相対パス）",
          },
        },
        required: ["filePath"],
      },
    },
    {
      name: "parse_excel_to_ddl",
      description: "日本語 Excel DB 定義書を解析してテーブル構造 JSON と DDL テキストを返す。行列範囲を指定した場合はその範囲のみ、省略した場合はシート全体を解析する",
      inputSchema: {
        type: "object" as const,
        properties: {
          filePath: {
            type: "string",
            description: "Excel ファイルのパス",
          },
          sheetName: {
            type: "string",
            description: "解析対象のシート名",
          },
          startRow: {
            type: "number",
            description: "解析開始行（0-based）。endRow/startCol/endCol とセットで指定",
          },
          endRow: {
            type: "number",
            description: "解析終了行（0-based、inclusive）",
          },
          startCol: {
            type: "number",
            description: "解析開始列（0-based）",
          },
          endCol: {
            type: "number",
            description: "解析終了列（0-based、inclusive）",
          },
          dialect: {
            type: "string",
            enum: ["mysql", "oracle"],
            description: "生成する DDL の方言。デフォルト: mysql",
          },
        },
        required: ["filePath", "sheetName"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    if (name === "list_excel_sheets") {
      const { filePath } = args as { filePath: string };
      const sheets = getSheetNames(filePath);
      return {
        content: [{ type: "text" as const, text: JSON.stringify({ sheets }, null, 2) }],
      };
    }

    if (name === "parse_excel_to_ddl") {
      const {
        filePath,
        sheetName,
        startRow,
        endRow,
        startCol,
        endCol,
        dialect = "mysql",
      } = args as {
        filePath: string;
        sheetName: string;
        startRow?: number;
        endRow?: number;
        startCol?: number;
        endCol?: number;
        dialect?: "mysql" | "oracle";
      };

      let tables: TableInfo[];

      const hasRegion =
        startRow !== undefined &&
        endRow !== undefined &&
        startCol !== undefined &&
        endCol !== undefined;

      if (hasRegion) {
        tables = parseSheetRegion(filePath, sheetName, startRow!, endRow!, startCol!, endCol!);
      } else {
        tables = parseTableDefinitions(filePath, sheetName);
      }

      const ddl = generateDDL({ tables, dialect });

      return {
        content: [
          { type: "text" as const, text: JSON.stringify({ tables, ddl }, null, 2) },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  } catch (error) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal error in MCP server:", err);
  process.exit(1);
});
