import express, { Request, Response } from "express";
import cors from 'cors';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";

// Type definition for the transports dictionary
interface ActiveTransports {
    [sessionId: string]: SSEServerTransport;
}

export function startHttpServer(mcpServer: McpServer) {
    const app = express();
    app.use(cors()); // Enable CORS for all origins

    // Dictionary to store active SSE transports, keyed by session ID
    const transports: ActiveTransports = {};

    console.log("[HTTP Server] Setting up SSE endpoint at /sse");
    app.get("/sse", async (req: Request, res: Response) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] SSE connection request received.`);

        // Set headers required for SSE
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        // res.flushHeaders(); // REMOVED: Let the transport handle flushing upon connection

        // Create a new SSE transport for this connection
        // '/messages' tells the client where to POST messages back
        const transport = new SSEServerTransport('/messages', res);
        const sessionId = transport.sessionId;
        transports[sessionId] = transport; // Store the transport
        console.log(`[${timestamp}] SSE transport created for session: ${sessionId}`);

        // Keep-alive mechanism
        const keepAliveInterval = setInterval(() => {
            if (!res.writableEnded) {
                res.write(': keep-alive\n\n'); // Send SSE comment
            } else {
                clearInterval(keepAliveInterval); // Stop if connection closed
            }
        }, 25000); // Send every 25 seconds

        // Handle client disconnection
        res.on("close", () => {
            const closeTimestamp = new Date().toISOString();
            console.log(`[${closeTimestamp}] SSE connection closed for session: ${sessionId}. Headers Sent: ${res.headersSent}, Writable Ended: ${res.writableEnded}`);
            clearInterval(keepAliveInterval); // Stop keep-alive
            delete transports[sessionId]; // Clean up transport
            // Potentially call transport.close() if available in SDK for cleaner shutdown
            console.log(`[${closeTimestamp}] Transport for session ${sessionId} removed.`);
        });

        // Connect the main MCP server logic to this specific transport
        try {
            await mcpServer.connect(transport);
            console.log(`[${new Date().toISOString()}] McpServer connected to transport for session: ${sessionId}`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error connecting McpServer to transport ${sessionId}:`, error);
            clearInterval(keepAliveInterval); // Stop keep-alive on error
            if (!res.writableEnded) {
                res.status(500).end('Server connection error'); // End response if possible
            }
        }
    });

    console.log("[HTTP Server] Setting up message endpoint at POST /messages");
    // Endpoint for receiving messages from the client
    app.post("/messages", async (req: Request, res: Response) => {
        const sessionId = req.query.sessionId as string;
        const transport = transports[sessionId];
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] POST received on /messages for session: ${sessionId}`);

        if (transport) {
            console.log(`[${timestamp}] Processing POST message for session ${sessionId}...`);
            try {
                // Delegate message handling to the specific transport instance
                // The SDK's handlePostMessage is responsible for parsing the request
                // and sending the appropriate MCP response back via the 'res' object.
                await transport.handlePostMessage(req, res);
                console.log(`[${new Date().toISOString()}] Finished processing POST message for session ${sessionId}. Headers Sent: ${res.headersSent}, Writable Ended: ${res.writableEnded}`);
            } catch (error) {
                console.error(`[${new Date().toISOString()}] Error during handlePostMessage for session ${sessionId}:`, error);
                if (!res.headersSent) {
                    res.status(500).send('Error processing message');
                } else if (!res.writableEnded) {
                    res.end(); // Attempt to close the connection if headers were sent but writing failed
                }
            }
        } else {
            console.error(`[${timestamp}] No active transport found for session ID: ${sessionId} in POST /messages request.`);
            res.status(400).send(`No transport found for session ID '${sessionId}'. Ensure 'sessionId' query parameter is correct and the SSE connection is active.`);
        }
    });

    // Define the port, prioritizing environment variable, default to 3000
    const PORT = parseInt(process.env.PORT || "3000", 10);

    // Start the Express server
    app.listen(PORT, '0.0.0.0', () => { // Listen on 0.0.0.0 for Docker compatibility
        const startTimestamp = new Date().toISOString();
        console.log(`[${startTimestamp}] HTTP/SSE Server started.`);
        console.log(`[${startTimestamp}] Listening on port: ${PORT}`);
        console.log(`[${startTimestamp}] SSE endpoint: http://<server-ip>:${PORT}/sse`);
        console.log(`[${startTimestamp}] Message endpoint: POST http://<server-ip>:${PORT}/messages?sessionId=<session_id>`);
    });
}
