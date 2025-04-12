#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerNocoDbTools } from "./mcpTools.js";
import { startHttpServer } from "./server.js";
import './config.js'; // Import config to ensure environment variables are loaded and client is initialized early

async function main() {
    console.log("[Main] Initializing NocoDB MCP Server...");

    // Create the main MCP server instance
    const mcpServer = new McpServer({
        name: "nocodb-mcp-server-http", // Updated name slightly for clarity
        version: "1.1.0" // Incremented version due to refactoring and new features
    });

    // Register all the NocoDB tools
    registerNocoDbTools(mcpServer);

    // Start the HTTP/SSE server, passing the MCP server instance
    // The HTTP server will handle incoming connections and route messages to the McpServer
    startHttpServer(mcpServer);

    console.log("[Main] NocoDB MCP Server initialization complete. HTTP server is running.");

    // Optional: Add graceful shutdown handling if needed
    process.on('SIGINT', async () => {
        console.log('[Main] Received SIGINT. Shutting down...');
        // Add any cleanup logic here if necessary (e.g., mcpServer.close())
        process.exit(0);
    });

    process.on('SIGTERM', async () => {
        console.log('[Main] Received SIGTERM. Shutting down...');
        // Add any cleanup logic here if necessary
        process.exit(0);
    });
}

// Execute the main function
main().catch(error => {
    console.error("[Main] Unhandled error during server startup:", error);
    process.exit(1);
});
