#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    Tool,
    McpError,
    ErrorCode,
    InitializeRequestSchema, // Import needed for type checking if used explicitly
} from "@modelcontextprotocol/sdk/types.js";
import express, { Request, Response } from "express";
import cors from 'cors';
import axios, { AxiosInstance } from "axios";

// --- NocoDB Configuration ---
let { NOCODB_URL, NOCODB_BASE_ID, NOCODB_API_TOKEN } = process.env;
if (!NOCODB_URL || !NOCODB_BASE_ID || !NOCODB_API_TOKEN) {
    NOCODB_URL = process.argv[2] || NOCODB_URL;
    NOCODB_BASE_ID = process.argv[3] || NOCODB_BASE_ID;
    NOCODB_API_TOKEN = process.argv[4] || NOCODB_API_TOKEN;
    if (!NOCODB_URL || !NOCODB_BASE_ID || !NOCODB_API_TOKEN) {
        console.error("Error: Missing required NocoDB environment variables (NOCODB_URL, NOCODB_BASE_ID, NOCODB_API_TOKEN) or command line arguments.");
        process.exit(1);
    }
}

const filterRules = `
Comparison Operators: eq, neq, not, gt, ge, lt, le, is, isnot, in, btw, nbtw, like, isWithin, allof, anyof, nallof, nanyof.
Date Sub-Operators (for eq, etc.): today, tomorrow, yesterday, oneWeekAgo, oneWeekFromNow, oneMonthAgo, oneMonthFromNow, daysAgo, daysFromNow, exactDate.
Date Sub-Operators (for isWithin): pastWeek, pastMonth, pastYear, nextWeek, nextMonth, nextYear, nextNumberOfDays, pastNumberOfDays.
Logical Operators: ~or, ~and, ~not.
Date Null Rule: (date,isnot,null) -> (date,notblank), (date,is,null) -> (date,blank).
Example: (age,gt,30)~and(status,eq,active)
`;

const nocodbClient: AxiosInstance = axios.create({
    baseURL: NOCODB_URL.replace(/\/$/, ""),
    headers: {
        "xc-token": NOCODB_API_TOKEN,
        "Content-Type": "application/json",
    },
    timeout: 30000,
});

// --- NocoDB Core Functions ---
// (getTableId, getRecords, postRecords, patchRecords, deleteRecords, getListTables, getTableMetadata, alterTableAddColumn, alterTableRemoveColumn, createTable)
// These functions remain largely the same as in the original file.
// Minor improvements: Added explicit types, better error wrapping.

const getTableId = async (tableName: string): Promise<string> => {
    try {
        const response = await nocodbClient.get(`/api/v2/meta/bases/${NOCODB_BASE_ID}/tables`);
        const tables = response.data.list || [];
        const table = tables.find((t: any) => t.title === tableName);
        if (!table) throw new Error(`Table '${tableName}' not found in base ${NOCODB_BASE_ID}`);
        return table.id;
    } catch (error: any) {
        console.error(`Error retrieving table ID for "${tableName}":`, error.response?.data || error.message);
        throw new McpError(ErrorCode.InternalError, `Error retrieving NocoDB table ID for "${tableName}": ${error.message}`);
    }
};

async function getRecords(tableName: string, filters?: string, limit?: number, offset?: number, sort?: string, fields?: string) {
    const tableId = await getTableId(tableName);
    const params = new URLSearchParams();
    if (filters) params.set('where', filters);
    if (limit !== undefined) params.set('limit', String(limit));
    if (offset !== undefined) params.set('offset', String(offset));
    if (sort) params.set('sort', sort);
    if (fields) params.set('fields', fields);

    try {
        const response = await nocodbClient.get(`/api/v2/tables/${tableId}/records`, { params });
        return response.data;
    } catch (error: any) {
        console.error(`Error in getRecords for table "${tableName}":`, error.response?.data || error.message);
        throw new McpError(ErrorCode.InternalError, `NocoDB API error getting records from "${tableName}": ${error.response?.data?.message || error.message}`);
    }
}

async function postRecords(tableName: string, data: unknown) {
    const tableId = await getTableId(tableName);
    try {
        const response = await nocodbClient.post(`/api/v2/tables/${tableId}/records`, data);
        return response.data;
    } catch (error: any) {
        console.error(`Error in postRecords for table "${tableName}":`, error.response?.data || error.message);
        throw new McpError(ErrorCode.InternalError, `NocoDB API error posting records to "${tableName}": ${error.response?.data?.message || error.message}`);
    }
}

async function patchRecords(tableName: string, data: any) {
    // NocoDB expects an array for bulk updates, even for single records.
    // Ensure data includes 'Id'. The inputSchema should enforce this.
    const tableId = await getTableId(tableName);
    const recordsToUpdate = Array.isArray(data) ? data : [data];
    if (!recordsToUpdate.every(r => r && typeof r === 'object' && 'Id' in r)) {
         throw new McpError(ErrorCode.InvalidParams, "Each record in 'data' for patchRecords must be an object containing an 'Id' field.");
    }
    try {
        const response = await nocodbClient.patch(`/api/v2/tables/${tableId}/records`, recordsToUpdate);
        return response.data;
    } catch (error: any) {
        console.error(`Error in patchRecords for table "${tableName}":`, error.response?.data || error.message);
        throw new McpError(ErrorCode.InternalError, `NocoDB API error patching records in "${tableName}": ${error.response?.data?.message || error.message}`);
    }
}

async function deleteRecords(tableName: string, data: { Id: number } | Array<{ Id: number }>) {
    // NocoDB delete expects data in the body with 'Id' field(s).
    const tableId = await getTableId(tableName);
     const recordsToDelete = Array.isArray(data) ? data : [data];
     if (!recordsToDelete.every(r => r && typeof r === 'object' && 'Id' in r && typeof r.Id === 'number')) {
         throw new McpError(ErrorCode.InvalidParams, "Each record in 'data' for deleteRecords must be an object containing a numeric 'Id' field.");
     }
    try {
        // NocoDB uses the data field in the config for DELETE requests with bodies
        const response = await nocodbClient.delete(`/api/v2/tables/${tableId}/records`, { data: recordsToDelete });
        return response.data; // Often returns a count or boolean
    } catch (error: any) {
        console.error(`Error in deleteRecords for table "${tableName}":`, error.response?.data || error.message);
        throw new McpError(ErrorCode.InternalError, `NocoDB API error deleting records from "${tableName}": ${error.response?.data?.message || error.message}`);
    }
}

async function getListTables() {
    try {
        const response = await nocodbClient.get(`/api/v2/meta/bases/${NOCODB_BASE_ID}/tables`);
        const tables = response.data.list || [];
        return tables.map((t: any) => ({ id: t.id, title: t.title, type: t.type }));
    } catch (error: any) {
        console.error("Error in getListTables:", error.response?.data || error.message);
        throw new McpError(ErrorCode.InternalError, `NocoDB API error listing tables: ${error.message}`);
    }
}

async function getTableMetadata(tableName: string) {
    const tableId = await getTableId(tableName);
    try {
        const response = await nocodbClient.get(`/api/v2/meta/tables/${tableId}`);
        return response.data;
    } catch (error: any) {
        console.error(`Error in getTableMetadata for table "${tableName}":`, error.response?.data || error.message);
        throw new McpError(ErrorCode.InternalError, `NocoDB API error getting metadata for "${tableName}": ${error.response?.data?.message || error.message}`);
    }
}

async function alterTableAddColumn(tableName: string, columnName: string, columnType: string) {
    const tableId = await getTableId(tableName);
    try {
        // Basic validation for common types, NocoDB handles specifics
        const validTypes = ["SingleLineText", "LongText", "Number", "Decimal", "Currency", "Percent", "Checkbox", "Date", "DateTime", "Time", "Email", "URL", "PhoneNumber", "Select", "MultiSelect", "Lookup", "Rollup", "Formula", "Attachment", "Barcode", "QrCode", "Collaborator", "CreatedTime", "LastModifiedTime", "AutoNumber", "Duration", "Rating", "Year", "Week", "Month", "Json", "Geometry", "ID"]; // Add more as needed from NocoDB docs
        if (!validTypes.includes(columnType)) {
             console.warn(`Potentially invalid column type "${columnType}" provided. NocoDB will perform final validation.`);
        }
        const response = await nocodbClient.post(`/api/v2/meta/tables/${tableId}/columns`, { title: columnName, uidt: columnType });
        return response.data;
    } catch (error: any) {
        console.error(`Error in alterTableAddColumn for table "${tableName}":`, error.response?.data || error.message);
        throw new McpError(ErrorCode.InternalError, `NocoDB API error adding column "${columnName}" to "${tableName}": ${error.response?.data?.message || error.message}`);
    }
}

async function alterTableRemoveColumn(columnId: string) {
    // Requires the internal NocoDB column ID (e.g., 'cabc123...')
    if (!columnId || !columnId.startsWith('c')) {
         throw new McpError(ErrorCode.InvalidParams, `Invalid columnId "${columnId}". It should be the internal NocoDB column ID (usually starts with 'c'). Use nocodb_get_table_metadata to find it.`);
    }
    try {
        const response = await nocodbClient.delete(`/api/v2/meta/columns/${columnId}`);
        return response.data; // Usually returns true or similar on success
    } catch (error: any) {
        console.error(`Error in alterTableRemoveColumn for columnId "${columnId}":`, error.response?.data || error.message);
        throw new McpError(ErrorCode.InternalError, `NocoDB API error removing column ID "${columnId}": ${error.response?.data?.message || error.message}`);
    }
}

type ColumnDefinition = { title: string; uidt: string }; // uidt is string as NocoDB has many types
async function createTable(tableName: string, columns: ColumnDefinition[]) {
    // Ensure 'Id' column is not manually added unless it's the *only* column and type ID
     const hasExplicitId = columns.some(c => c.title.toLowerCase() === 'id');
     let finalColumns = columns;

     if (hasExplicitId && columns.length > 1) {
         console.warn("Manual 'Id' column detected with other columns. NocoDB typically adds 'Id' automatically. Removing manual 'Id'.");
         finalColumns = columns.filter(c => c.title.toLowerCase() !== 'id');
     } else if (hasExplicitId && columns.length === 1 && columns[0].uidt !== 'ID') {
         console.warn("Manual 'Id' column detected as the only column, but type is not 'ID'. NocoDB might override this.");
     } else if (!hasExplicitId) {
         // NocoDB adds ID automatically if not present
         console.log("No 'Id' column specified. NocoDB will add it automatically.");
     }

    try {
        const response = await nocodbClient.post(`/api/v2/meta/bases/${NOCODB_BASE_ID}/tables`, {
            title: tableName,
            columns: finalColumns.map(col => ({ title: col.title, uidt: col.uidt })),
        });
        return response.data;
    } catch (error: any) {
        console.error(`Error in createTable for table "${tableName}":`, error.response?.data || error.message);
        throw new McpError(ErrorCode.InternalError, `NocoDB API error creating table "${tableName}": ${error.response?.data?.message || error.message}`);
    }
}
// --- End NocoDB Core Functions ---


// --- Tool Definitions ---
const GET_RECORDS_TOOL: Tool = {
    name: "nocodb_get_records",
    description: "Retrieves records from a specified NocoDB table with optional filtering, sorting, pagination, and field selection.",
    inputSchema: {
        type: "object",
        properties: {
            tableName: { type: "string", description: "Name of the table to query." },
            filters: { type: "string", description: `Optional NocoDB filter string. ${filterRules}` },
            limit: { type: "number", description: "Optional maximum number of records to return (default: 25)." },
            offset: { type: "number", description: "Optional number of records to skip for pagination (default: 0)." },
            sort: { type: "string", description: "Optional field(s) to sort by. Prefix with '-' for descending order (e.g., '-createdAt,name')." },
            fields: { type: "string", description: "Optional comma-separated list of fields to include (e.g., 'id,name,email')." }
        },
        required: ["tableName"]
    }
};

const LIST_TABLES_TOOL: Tool = {
    name: "nocodb_list_tables",
    description: "Lists all tables (name, id, type) available in the configured NocoDB base.",
    inputSchema: { type: "object", properties: {} } // No input needed
};

const POST_RECORDS_TOOL: Tool = {
    name: "nocodb_post_records",
    description: "Creates one or more new records in a specified NocoDB table.",
    inputSchema: {
        type: "object",
        properties: {
            tableName: { type: "string", description: "Name of the table to insert into." },
            data: {
                description: "An object representing a single record, or an array of objects for multiple records. Keys should match table column names.",
                oneOf: [
                    { type: "object", additionalProperties: true },
                    { type: "array", items: { type: "object", additionalProperties: true } }
                ]
            }
        },
        required: ["tableName", "data"]
    }
};

const PATCH_RECORDS_TOOL: Tool = {
    name: "nocodb_patch_records",
    description: "Updates one or more existing records in a specified NocoDB table based on their IDs.",
    inputSchema: {
        type: "object",
        properties: {
            tableName: { type: "string", description: "Name of the table to update." },
            data: {
                description: "An object or array of objects. Each object MUST include a numeric 'Id' field specifying the record to update, along with the fields to modify.",
                 oneOf: [
                    {
                        type: "object",
                        properties: { Id: { type: "number" } },
                        required: ["Id"],
                        additionalProperties: true
                    },
                    {
                        type: "array",
                        items: {
                            type: "object",
                            properties: { Id: { type: "number" } },
                            required: ["Id"],
                            additionalProperties: true
                        }
                    }
                ]
            }
        },
        required: ["tableName", "data"]
    }
};

const DELETE_RECORDS_TOOL: Tool = {
    name: "nocodb_delete_records",
    description: "Deletes one or more records from a specified NocoDB table based on their IDs.",
    inputSchema: {
        type: "object",
        properties: {
            tableName: { type: "string", description: "Name of the table to delete from." },
            data: {
                 description: "An object containing a numeric 'Id' field specifying the record to delete, or an array of such objects.",
                 oneOf: [
                    {
                        type: "object",
                        properties: { Id: { type: "number" } },
                        required: ["Id"],
                        additionalProperties: false // Only Id is needed
                    },
                    {
                        type: "array",
                        items: {
                            type: "object",
                            properties: { Id: { type: "number" } },
                            required: ["Id"],
                            additionalProperties: false // Only Id is needed
                        }
                    }
                ]
            }
        },
        required: ["tableName", "data"]
    }
};

const GET_TABLE_METADATA_TOOL: Tool = {
    name: "nocodb_get_table_metadata",
    description: "Retrieves metadata (columns, types, IDs, etc.) for a specified NocoDB table.",
    inputSchema: {
        type: "object",
        properties: {
            tableName: { type: "string", description: "Name of the table to get metadata for." }
        },
        required: ["tableName"]
    }
};

const ADD_COLUMN_TOOL: Tool = {
    name: "nocodb_add_column",
    description: "Adds a new column to a specified NocoDB table.",
    inputSchema: {
        type: "object",
        properties: {
            tableName: { type: "string", description: "Name of the table to add the column to." },
            columnName: { type: "string", description: "Desired name for the new column." },
            columnType: { type: "string", description: "NocoDB column type (e.g., 'SingleLineText', 'Number', 'DateTime', 'Checkbox'). Refer to NocoDB docs for all types." }
        },
        required: ["tableName", "columnName", "columnType"]
    }
};

const REMOVE_COLUMN_TOOL: Tool = {
    name: "nocodb_remove_column",
    description: "Removes a column from a NocoDB table using its internal Column ID. [WARNING] This action is irreversible.",
    inputSchema: {
        type: "object",
        properties: {
            columnId: { type: "string", description: "The internal NocoDB ID of the column to remove (e.g., 'cabc123...'). Use 'nocodb_get_table_metadata' to find this ID." }
        },
        required: ["columnId"]
    }
};

const CREATE_TABLE_TOOL: Tool = {
    name: "nocodb_create_table",
    description: "Creates a new table in the NocoDB base with specified columns. An 'Id' column is added automatically if not defined.",
    inputSchema: {
        type: "object",
        properties: {
            tableName: { type: "string", description: "Name for the new table." },
            columns: {
                type: "array",
                description: "Array of column definitions.",
                items: {
                    type: "object",
                    properties: {
                        title: { type: "string", description: "Name of the column." },
                        uidt: { type: "string", description: "NocoDB column type (e.g., 'SingleLineText', 'Number')." }
                    },
                    required: ["title", "uidt"]
                }
            }
        },
        required: ["tableName", "columns"]
    }
};

const ALL_TOOLS = [
    GET_RECORDS_TOOL,
    LIST_TABLES_TOOL,
    POST_RECORDS_TOOL,
    PATCH_RECORDS_TOOL,
    DELETE_RECORDS_TOOL,
    GET_TABLE_METADATA_TOOL,
    ADD_COLUMN_TOOL,
    REMOVE_COLUMN_TOOL,
    CREATE_TABLE_TOOL,
];
// --- End Tool Definitions ---


// --- MCP Server Setup ---
const server = new Server(
    {
        name: "nocodb-http-mcp-server", // Updated name
        version: "1.1.0", // Incremented version
    },
    {
        // Capabilities are dynamically reported via ListTools handler
        capabilities: { tools: {} }
    }
);

// --- Request Handlers ---
server.setRequestHandler(ListToolsRequestSchema, async () => {
    console.log(`[${new Date().toISOString()}] Handling ListTools request.`);
    return { tools: ALL_TOOLS };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Handling CallTool request for: ${name}`);
    console.log(`[${timestamp}] Arguments:`, JSON.stringify(args));

    try {
        // Add initial check for args
        if (typeof args !== 'object' || args === null) {
            throw new McpError(ErrorCode.InvalidParams, `Tool arguments must be an object, received: ${typeof args}`);
        }

        let result: any;
        // Input validation is handled by the SDK based on tool's inputSchema
        // We use type assertions below (e.g., args.tableName as string) to satisfy TypeScript,
        // relying on the SDK's prior validation.

        switch (name) {
            case GET_RECORDS_TOOL.name:
                result = await getRecords(
                    args.tableName as string,
                    args.filters as string | undefined,
                    args.limit as number | undefined,
                    args.offset as number | undefined,
                    args.sort as string | undefined,
                    args.fields as string | undefined
                );
                break;
            case LIST_TABLES_TOOL.name:
                // No arguments expected or needed for getListTables
                result = await getListTables();
                break;
            case POST_RECORDS_TOOL.name:
                 // NocoDB expects object for single, array for multiple. SDK validates input is one of these.
                result = await postRecords(args.tableName as string, args.data as object | Array<object>);
                break;
            case PATCH_RECORDS_TOOL.name:
                 // NocoDB expects array. SDK validates input is object/array with Id.
                result = await patchRecords(args.tableName as string, args.data as { Id: number } | Array<{ Id: number }>);
                break;
            case DELETE_RECORDS_TOOL.name:
                 // NocoDB expects array of objects with Id in body. SDK validates input.
                result = await deleteRecords(args.tableName as string, args.data as { Id: number } | Array<{ Id: number }>);
                break;
            case GET_TABLE_METADATA_TOOL.name:
                result = await getTableMetadata(args.tableName as string);
                break;
            case ADD_COLUMN_TOOL.name:
                result = await alterTableAddColumn(args.tableName as string, args.columnName as string, args.columnType as string);
                break;
            case REMOVE_COLUMN_TOOL.name:
                console.warn(`[${timestamp}] Executing potentially destructive operation: ${name} for columnId ${args.columnId as string}`);
                result = await alterTableRemoveColumn(args.columnId as string);
                break;
            case CREATE_TABLE_TOOL.name:
                result = await createTable(args.tableName as string, args.columns as ColumnDefinition[]);
                break;
            default:
                console.error(`[${timestamp}] Unknown tool requested: ${name}`);
                throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
        }

        console.log(`[${timestamp}] Tool ${name} executed successfully.`);
        // Ensure result is serializable, handle potential large objects if necessary
        let resultText: string;
        try {
            resultText = JSON.stringify(result, null, 2); // Pretty print for readability
        } catch (stringifyError) {
            console.error(`[${timestamp}] Error stringifying result for ${name}:`, stringifyError);
            resultText = JSON.stringify({ stringifyError: "Could not serialize result object." });
        }

        return {
            content: [{ type: "text", mimeType: "application/json", text: resultText }],
        };

    } catch (error: any) {
        const errorTimestamp = new Date().toISOString();
        console.error(`[${errorTimestamp}] Error executing tool ${name}:`, error);

        // If it's already an McpError, re-throw it for the SDK to handle
        if (error instanceof McpError) {
            // Log the details before re-throwing
             console.error(`[${errorTimestamp}] McpError details: Code=${error.code}, Message=${error.message}, Data=${JSON.stringify(error.data)}`);
            // Return structure expected by SDK for errors
             return {
                 isError: true,
                 error: { code: error.code, message: error.message, data: error.data },
                 content: [{ type: 'text', text: `MCP Error (${error.code}): ${error.message}` }]
             };
        }

        // Otherwise, wrap it in a generic McpError
        const message = error.message || String(error);
        // Return structure expected by SDK for errors
         return {
             isError: true,
             error: { code: ErrorCode.InternalError, message: message },
             content: [{ type: 'text', text: `Internal Server Error: ${message}` }]
         };
    }
});
// --- End Request Handlers ---


// --- Express Server Setup (Retained) ---
async function main() {
    const app = express();
    app.use(cors()); // Enable CORS for all origins
    app.use(express.json()); // Parse JSON request bodies

    const transports: { [sessionId: string]: SSEServerTransport } = {};

    // SSE connection endpoint
    app.get("/sse", async (req: Request, res: Response) => {
        const timestamp = new Date().toISOString();
        const remoteAddr = req.socket.remoteAddress || 'unknown';
        console.log(`[${timestamp}] New SSE connection request from ${remoteAddr}`);

        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Useful for Nginx proxying
        res.flushHeaders(); // Send headers immediately

        const transport = new SSEServerTransport('/messages', res); // Pass response object
        const sessionId = transport.sessionId;
        transports[sessionId] = transport;
        console.log(`[${timestamp}] SSE transport created for session: ${sessionId}`);

        // Send a connection confirmation event (optional)
        res.write(`event: mcp-connected\ndata: ${JSON.stringify({ sessionId })}\n\n`);

        res.on("close", () => {
            const closeTimestamp = new Date().toISOString();
            console.log(`[${closeTimestamp}] SSE connection closed for session: ${sessionId}`);
            // Clean up transport and potentially disconnect server if needed
            const closedTransport = transports[sessionId];
            if (closedTransport) {
                // closedTransport.close(); // SSEServerTransport might not have a close method, handled by stream end
                delete transports[sessionId];
                // Consider if server.disconnect(transport) is needed, but usually handled by transport closure
            }
            clearInterval(keepAliveInterval); // Stop sending keep-alive pings
        });

        // Keep-alive mechanism
        const keepAliveInterval = setInterval(() => {
            if (!res.writableEnded) {
                res.write(': keep-alive\n\n');
            } else {
                console.log(`[${new Date().toISOString()}] SSE stream ended for ${sessionId}, clearing keep-alive.`);
                clearInterval(keepAliveInterval);
            }
        }, 20000); // Send every 20 seconds

        // Connect the MCP Server instance to this specific transport
        try {
            // The server instance now handles initialize, listTools, callTool etc. via this transport
            await server.connect(transport);
            console.log(`[${new Date().toISOString()}] McpServer connected to transport for session: ${sessionId}`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Error connecting McpServer to transport ${sessionId}:`, error);
            clearInterval(keepAliveInterval);
            if (!res.writableEnded) {
                // Try sending an error event before closing
                try {
                     res.write(`event: mcp-error\ndata: ${JSON.stringify({ error: 'Failed to connect MCP server' })}\n\n`);
                } catch (writeError) {
                     console.error(`[${new Date().toISOString()}] Failed to write error event to SSE stream for ${sessionId}`);
                }
                res.end(); // Close the connection on error
            }
        }
    });

    // Endpoint for receiving client messages (POST requests)
    app.post("/messages", async (req: Request, res: Response) => {
        const sessionId = req.query.sessionId as string; // Session ID expected in query params
        const transport = transports[sessionId];
        const timestamp = new Date().toISOString();

        if (!sessionId || !transport) {
            console.error(`[${timestamp}] POST /messages error: No valid transport found for sessionId "${sessionId}". Known sessions: ${Object.keys(transports).join(', ')}`);
            return res.status(400).json({ error: "Invalid or missing sessionId in query parameters." });
        }

        console.log(`[${timestamp}] POST /messages received for session: ${sessionId}`);
        // console.log(`[${timestamp}] Request body:`, JSON.stringify(req.body)); // Log request body if needed

        // Let the SDK's transport handle the incoming message
        // This will parse the JSON-RPC request, find the appropriate handler
        // (e.g., for callTool), execute it, and send the response back via the SSE transport.
        // NO manual handling of 'initialize' needed here anymore.
        try {
            await transport.handlePostMessage(req, res);
            // handlePostMessage will send the response via the SSE stream associated with 'res'
            console.log(`[${timestamp}] SDK handled POST message for session: ${sessionId}`);
        } catch (error) {
            console.error(`[${timestamp}] Error processing POST message via SDK for session ${sessionId}:`, error);
            // Avoid sending response here if handlePostMessage already did or if headers sent
            if (!res.headersSent) {
                res.status(500).json({ error: "Internal server error processing message." });
            } else if (!res.writableEnded) {
                 console.warn(`[${timestamp}] Response headers already sent, attempting to end stream for ${sessionId}.`);
                 res.end();
            }
        }
    });

    const PORT = parseInt(process.env.PORT || "3000", 10);
    const HOST = process.env.HOST || '0.0.0.0'; // Listen on all interfaces by default

    app.listen(PORT, HOST, () => {
        const startTimestamp = new Date().toISOString();
        console.log(`[${startTimestamp}] NocoDB MCP Server (HTTP/SSE) started.`);
        console.log(`[${startTimestamp}] Listening on ${HOST}:${PORT}`);
        console.log(`[${startTimestamp}] SSE Endpoint: http://${HOST}:${PORT}/sse`);
        console.log(`[${startTimestamp}] Client POST Endpoint: http://${HOST}:${PORT}/messages?sessionId=<SESSION_ID>`);
        console.log(`[${startTimestamp}] Required Env Vars: NOCODB_URL, NOCODB_BASE_ID, NOCODB_API_TOKEN (or provide as args)`);
        console.log(`[${startTimestamp}] Configured NocoDB URL: ${NOCODB_URL}`);
        console.log(`[${startTimestamp}] Configured NocoDB Base ID: ${NOCODB_BASE_ID}`);
    });
}

main().catch((error) => {
    console.error("Fatal error during server startup:", error);
    process.exit(1);
});
