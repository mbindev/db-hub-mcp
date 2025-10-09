import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { executeSqlToolHandler, executeSqlSchema } from "./execute-sql.js";
/**
 * Register all tool handlers with the MCP server
 * @param server - The MCP server instance
 * @param id - Optional ID to suffix tool names (for Cursor multi-instance support)
 */
export function registerTools(server: McpServer, id?: string): void {
  // Build tool name with optional suffix
  const toolName = id ? `execute_sql_${id}` : "execute_sql";

  // Tool to run a SQL query (read-only for safety)
  server.tool(
    toolName,
    "Execute a SQL query on the current database",
    executeSqlSchema,
    executeSqlToolHandler
  );

}
