#!/usr/bin/env node
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express, { Request, Response } from "express";
import cors from 'cors';
import { z } from "zod";
import axios, { AxiosInstance } from "axios";

// --- Configuration et fonctions NocoDB (inchangées) ---
let { NOCODB_URL, NOCODB_BASE_ID, NOCODB_API_TOKEN } = process.env;
if (!NOCODB_URL || !NOCODB_BASE_ID || !NOCODB_API_TOKEN) {
    NOCODB_URL = process.argv[2] || NOCODB_URL;
    NOCODB_BASE_ID = process.argv[3] || NOCODB_BASE_ID;
    NOCODB_API_TOKEN = process.argv[4] || NOCODB_API_TOKEN;
    if (!NOCODB_URL || !NOCODB_BASE_ID || !NOCODB_API_TOKEN) {
        throw new Error("Missing required environment variables");
    }
}

const filterRules =
    `
Comparison Operators
Operation Meaning Example
eq  equal (colName,eq,colValue)
neq not equal (colName,neq,colValue)
not not equal (alias of neq)  (colName,not,colValue)
gt  greater than  (colName,gt,colValue)
ge  greater or equal  (colName,ge,colValue)
lt  less than (colName,lt,colValue)
le  less or equal (colName,le,colValue)
is  is  (colName,is,true/false/null)
isnot is not  (colName,isnot,true/false/null)
in  in  (colName,in,val1,val2,val3,val4)
btw between (colName,btw,val1,val2)
nbtw  not between (colName,nbtw,val1,val2)
like  like  (colName,like,%name)
isWithin  is Within (Available in Date and DateTime only) (colName,isWithin,sub_op)
allof includes all of (colName,allof,val1,val2,...)
anyof includes any of (colName,anyof,val1,val2,...)
nallof  does not include all of (includes none or some, but not all of) (colName,nallof,val1,val2,...)
nanyof  does not include any of (includes none of)  (colName,nanyof,val1,val2,...)


Comparison Sub-Operators
The following sub-operators are available in Date and DateTime columns.

Operation Meaning Example
today today (colName,eq,today)
tomorrow  tomorrow  (colName,eq,tomorrow)
yesterday yesterday (colName,eq,yesterday)
oneWeekAgo  one week ago  (colName,eq,oneWeekAgo)
oneWeekFromNow  one week from now (colName,eq,oneWeekFromNow)
oneMonthAgo one month ago (colName,eq,oneMonthAgo)
oneMonthFromNow one month from now  (colName,eq,oneMonthFromNow)
daysAgo number of days ago  (colName,eq,daysAgo,10)
daysFromNow number of days from now (colName,eq,daysFromNow,10)
exactDate exact date  (colName,eq,exactDate,2022-02-02)

For isWithin in Date and DateTime columns, the different set of sub-operators are used.

Operation Meaning Example
pastWeek  the past week (colName,isWithin,pastWeek)
pastMonth the past month  (colName,isWithin,pastMonth)
pastYear  the past year (colName,isWithin,pastYear)
nextWeek  the next week (colName,isWithin,nextWeek)
nextMonth the next month  (colName,isWithin,nextMonth)
nextYear  the next year (colName,isWithin,nextYear)
nextNumberOfDays  the next number of days (colName,isWithin,nextNumberOfDays,10)
pastNumberOfDays  the past number of days (colName,isWithin,pastNumberOfDays,10)
Logical Operators

Operation Example
~or (checkNumber,eq,JM555205)~or((amount, gt, 200)~and(amount, lt, 2000))
~and  (checkNumber,eq,JM555205)~and((amount, gt, 200)~and(amount, lt, 2000))
~not  ~not(checkNumber,eq,JM555205)


For date null rule
(date,isnot,null) -> (date,notblank).
(date,is,null) -> (date,blank).
`; // Fin filterRules

const nocodbClient: AxiosInstance = axios.create({
    baseURL: NOCODB_URL.replace(/\/$/, ""),
    headers: {
        "xc-token": NOCODB_API_TOKEN,
        "Content-Type": "application/json",
    },
    timeout: 30000,
});

// --- Fonctions métiers NocoDB (getRecords, postRecords, etc. - inchangées) ---
export async function getRecords(tableName: string, filters?: string, limit?: number, offset?: number, sort?: string, fields?: string) {
    const tableId = await getTableId(tableName);
    const paramsArray = [];
    if (filters) paramsArray.push(`where=${filters}`);
    if (limit) paramsArray.push(`limit=${limit}`);
    if (offset) paramsArray.push(`offset=${offset}`);
    if (sort) paramsArray.push(`sort=${sort}`);
    if (fields) paramsArray.push(`fields=${fields}`);
    const queryString = paramsArray.join("&");
    const response = await nocodbClient.get(`/api/v2/tables/${tableId}/records?${queryString}`);
    return { input: { tableName, filters, limit, offset, sort, fields }, output: response.data };
}
export async function postRecords(tableName: string, data: unknown) {
    const tableId = await getTableId(tableName);
    const response = await nocodbClient.post(`/api/v2/tables/${tableId}/records`, data);
    return { output: response.data, input: data };
}
export async function patchRecords(tableName: string, rowId: number, data: any) {
    const tableId = await getTableId(tableName);
    const newData = [{ ...data, "Id": rowId }];
    const response = await nocodbClient.patch(`/api/v2/tables/${tableId}/records`, newData);
    return { output: response.data, input: data };
}
export async function deleteRecords(tableName: string, rowId: number) {
    const tableId = await getTableId(tableName);
    const data: any = { "Id": rowId };
    const response = await nocodbClient.delete(`/api/v2/tables/${tableId}/records`, { data });
    return response.data; // NocoDB retourne souvent un booléen ou un compte ici
}
export const getTableId = async (tableName: string): Promise<string> => {
    try {
        const response = await nocodbClient.get(`/api/v2/meta/bases/${NOCODB_BASE_ID}/tables`);
        const tables = response.data.list || [];
        const table = tables.find((t: any) => t.title === tableName);
        if (!table) throw new Error(`Table '${tableName}' not found`);
        return table.id;
    } catch (error: any) {
        throw new Error(`Error retrieving table ID: ${error.message}`);
    }
};
export async function getListTables() {
    try {
        const response = await nocodbClient.get(`/api/v2/meta/bases/${NOCODB_BASE_ID}/tables`);
        const tables = response.data.list || [];
        return tables.map((t: any) => t.title);
    } catch (error: any) {
        throw new Error(`Error get list tables: ${error.message}`);
    }
}
export async function getTableMetadata(tableName: string) {
    try {
        const tableId = await getTableId(tableName);
        const response = await nocodbClient.get(`/api/v2/meta/tables/${tableId}`);
        return response.data;
    } catch (error: any) {
        throw new Error(`Error getting table metadata: ${error.message}`); // Correction message erreur
    }
}
export async function alterTableAddColumn(tableName: string, columnName: string, columnType: string) {
    try {
        const tableId = await getTableId(tableName);
        const response = await nocodbClient.post(`/api/v2/meta/tables/${tableId}/columns`, { title: columnName, uidt: columnType });
        return response.data;
    } catch (error: any) {
        throw new Error(`Error adding column: ${error.message}`);
    }
}
export async function alterTableRemoveColumn(columnId: string) {
    try {
        const response = await nocodbClient.delete(`/api/v2/meta/columns/${columnId}`);
        return response.data;
    } catch (error: any) {
        throw new Error(`Error removing column: ${error.message}`); // Correction message erreur
    }
}
type ColumnType = "SingleLineText" | "Number" | "Checkbox" | "DateTime" | "ID";
type TableColumnType = { title: string; uidt: ColumnType };
export async function createTable(tableName: string, data: TableColumnType[]) {
    try {
        const hasId = data.some(x => x.title === "Id"); // Utiliser some pour vérifier l'existence
        if (!hasId) {
            data.unshift({ title: "Id", uidt: "ID" });
        }
        const response = await nocodbClient.post(`/api/v2/meta/bases/${NOCODB_BASE_ID}/tables`, {
            title: tableName,
            columns: data.map((value) => ({ title: value.title, uidt: value.uidt })),
        });
        return response.data;
    } catch (error: any) {
        throw new Error(`Error creating table: ${error.message}`);
    }
}
// --- Fin des fonctions NocoDB ---


// --- Création Serveur MCP ---
const server = new McpServer({
    name: "nocodb-mcp-server",
    version: "1.0.0"
});
// --- Fin Création Serveur MCP ---

// --- Définition Statique des Capabilities (avec JSON Schema) ---
const staticToolsCapabilities = {
    "nocodb-get-records": {
        description: "Nocodb - Get Records" + `hint:\n    1. Get all records from a table (limited to 10):\n       retrieve_records(table_name=\"customers\")\n       \n    3. Filter records with conditions:\n       retrieve_records(\n           table_name=\"customers\", \n           filters=\"(age,gt,30)~and(status,eq,active)\"\n       )\n       \n    4. Paginate results:\n       retrieve_records(table_name=\"customers\", limit=20, offset=40)\n       \n    5. Sort results:\n       retrieve_records(table_name=\"customers\", sort=\"-created_at\")\n       \n    6. Select specific fields:\n       retrieve_records(table_name=\"customers\", fields=\"id,name,email\")\n`,
        inputSchema: {
          type: "object",
          properties: {
            tableName: { type: "string" },
            filters: { type: "string", description: `Example: where=(field1,eq,value1)~and(field2,eq,value2) will filter records where 'field1' is equal to 'value1' AND 'field2' is equal to 'value2'.\nYou can also use other comparison operators like 'ne' (not equal), 'gt' (greater than), 'lt' (less than), and more, to create complex filtering rules.\n ${filterRules}` },
            limit: { type: "number" },
            offset: { type: "number" },
            sort: { type: "string", description: "Example: sort=field1,-field2 will sort the records first by 'field1' in ascending order and then by 'field2' in descending order." },
            fields: { type: "string", description: "Example: fields=field1,field2 will include only 'field1' and 'field2' in the API response." }
          },
          required: ["tableName"]
        }
    },
    "nocodb-get-list-tables": {
        description: "Nocodb - Get List Tables\nnotes: only show result from output to user",
        inputSchema: { type: "object", properties: {} }
    },
    "nocodb-post-records": {
        description: "Nocodb - Post Records",
        inputSchema: {
          type: "object",
          properties: {
            tableName: { type: "string", description: "table name" },
            data: true // Représente 'any'
          },
          required: ["tableName", "data"]
        }
    },
    "nocodb-patch-records": {
        description: "Nocodb - Patch Records",
        inputSchema: {
          type: "object",
          properties: {
            tableName: { type: "string" },
            rowId: { type: "number" },
            data: true // Représente 'any'
          },
          required: ["tableName", "rowId", "data"]
        }
    },
    "nocodb-delete-records": {
        description: "Nocodb - Delete Records",
        inputSchema: {
          type: "object",
          properties: {
            tableName: { type: "string" },
            rowId: { type: "number" }
          },
          required: ["tableName", "rowId"]
        }
    },
    "nocodb-get-table-metadata": {
        description: "Nocodb - Get Table Metadata",
        inputSchema: {
          type: "object",
          properties: {
            tableName: { type: "string" }
          },
          required: ["tableName"]
        }
    },
    "nocodb-alter-table-add-column": {
        description: "Nocodb - Alter Table Add Column",
        inputSchema: {
          type: "object",
          properties: {
            tableName: { type: "string" },
            columnName: { type: "string" },
            columnType: { type: "string", description: "SingleLineText, Number, Decimals, DateTime, Checkbox" }
          },
          required: ["tableName", "columnName", "columnType"]
        }
    },
    "nocodb-alter-table-remove-column": {
        description: "Nocodb - Alter Table Remove Column" + " get columnId from getTableMetadata" + " notes: remove column by columnId" + " example: c7uo2ruwc053a3a" + " [WARNING] this action is irreversible" + " [RECOMMENDATION] give warning to user",
        inputSchema: {
          type: "object",
          properties: {
            columnId: { type: "string" }
          },
          required: ["columnId"]
        }
    },
    "nocodb-create-table": {
        description: "Nocodb - Create Table",
        inputSchema: {
          type: "object",
          properties: {
            tableName: { type: "string" },
            data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  title: { type: "string" },
                  "uidt": { type: "string", enum: ["SingleLineText", "Number", "Checkbox", "DateTime"], description: "SingleLineText, Number, Checkbox, DateTime" }
                },
                required: ["title", "uidt"]
              },
              description: "The data to be inserted into the table.\n[WARNING] The structure of this object should match the columns of the table.\nexample:\nconst response = await createTable(\"Shinobi\", [\n        {\n            title: \"Name\",\n            uidt: \"SingleLineText\"\n        },\n        {\n            title: \"Age\",\n            uidt: \"Number\"\n        },\n        {\n            title: \"isHokage\",\n            uidt: \"Checkbox\"\n        },\n        {\n            title: \"Birthday\",\n            uidt: \"DateTime\"\n        }\n    ]\n)"
            }
          },
          required: ["tableName", "data"]
        }
    }
};
// --- Fin Définition Statique ---


async function main() {

    // --- Enregistrement des Outils avec server.tool() ---
    server.tool("nocodb-get-records",
        staticToolsCapabilities["nocodb-get-records"].description,
        // On passe le schéma Zod ici pour la validation interne du SDK si besoin
        {
            tableName: z.string(),
            filters: z.string().optional(),
            limit: z.number().optional(),
            offset: z.number().optional(),
            sort: z.string().optional(),
            fields: z.string().optional(),
        },
        async ({ tableName, filters, limit, offset, sort, fields }) => {
            console.log("[TOOL] nocodb-get-records called with:", { tableName, filters, limit, offset, sort, fields });
            try {
                const response = await getRecords(tableName, filters, limit, offset, sort, fields);
                console.log("[TOOL] nocodb-get-records response:", response);
                return { content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }] };
            } catch (error: any) {
                console.error("[TOOL] nocodb-get-records error:", error);
                return { isError: true, error: error?.message || String(error), content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify({ error: error?.message || String(error) }) }] };
            }
        }
    );

    server.tool("nocodb-get-list-tables",
        staticToolsCapabilities["nocodb-get-list-tables"].description,
        {}, // Pas d'arguments Zod ici car inputSchema est vide
        async () => {
            console.log("[TOOL] nocodb-get-list-tables called");
            try {
                const response = await getListTables();
                console.log("[TOOL] nocodb-get-list-tables response:", response);
                return { content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }] };
            } catch (error: any) {
                console.error("[TOOL] nocodb-get-list-tables error:", error);
                return { isError: true, error: error?.message || String(error), content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify({ error: error?.message || String(error) }) }] };
            }
        }
    );

    server.tool("nocodb-post-records",
        staticToolsCapabilities["nocodb-post-records"].description,
        { tableName: z.string(), data: z.any() }, // Schéma Zod pour validation interne
        async ({ tableName, data }) => {
            console.log("[TOOL] nocodb-post-records called with:", { tableName, data });
            try {
                const response = await postRecords(tableName, data);
                console.log("[TOOL] nocodb-post-records response:", response);
                return { content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }] };
            } catch (error: any) {
                console.error("[TOOL] nocodb-post-records error:", error);
                return { isError: true, error: error?.message || String(error), content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify({ error: error?.message || String(error) }) }] };
            }
        }
    );

    server.tool("nocodb-patch-records",
        staticToolsCapabilities["nocodb-patch-records"].description,
        { tableName: z.string(), rowId: z.number(), data: z.any() }, // Schéma Zod
        async ({ tableName, rowId, data }) => {
            console.log("[TOOL] nocodb-patch-records called with:", { tableName, rowId, data });
            try {
                const response = await patchRecords(tableName, rowId, data);
                console.log("[TOOL] nocodb-patch-records response:", response);
                return { content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }] };
            } catch (error: any) {
                console.error("[TOOL] nocodb-patch-records error:", error);
                return { isError: true, error: error?.message || String(error), content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify({ error: error?.message || String(error) }) }] };
            }
        }
    );

     server.tool("nocodb-delete-records",
        staticToolsCapabilities["nocodb-delete-records"].description,
        { tableName: z.string(), rowId: z.number() }, // Schéma Zod
        async ({ tableName, rowId }) => {
            console.log("[TOOL] nocodb-delete-records called with:", { tableName, rowId });
            try {
                const response = await deleteRecords(tableName, rowId);
                console.log("[TOOL] nocodb-delete-records response:", response);
                return { content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }] };
            } catch (error: any) {
                console.error("[TOOL] nocodb-delete-records error:", error);
                return { isError: true, error: error?.message || String(error), content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify({ error: error?.message || String(error) }) }] };
            }
        }
    );

     server.tool("nocodb-get-table-metadata",
        staticToolsCapabilities["nocodb-get-table-metadata"].description,
        { tableName: z.string() }, // Schéma Zod
        async ({ tableName }) => {
            console.log("[TOOL] nocodb-get-table-metadata called with:", { tableName });
            try {
                const response = await getTableMetadata(tableName);
                console.log("[TOOL] nocodb-get-table-metadata response:", response);
                return { content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }] };
            } catch (error: any) {
                console.error("[TOOL] nocodb-get-table-metadata error:", error);
                return { isError: true, error: error?.message || String(error), content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify({ error: error?.message || String(error) }) }] };
            }
        }
    );

     server.tool("nocodb-alter-table-add-column",
        staticToolsCapabilities["nocodb-alter-table-add-column"].description,
        { tableName: z.string(), columnName: z.string(), columnType: z.string() }, // Schéma Zod
        async ({ tableName, columnName, columnType }) => {
            console.log("[TOOL] nocodb-alter-table-add-column called with:", { tableName, columnName, columnType });
            try {
                const response = await alterTableAddColumn(tableName, columnName, columnType);
                console.log("[TOOL] nocodb-alter-table-add-column response:", response);
                return { content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }] };
            } catch (error: any) {
                console.error("[TOOL] nocodb-alter-table-add-column error:", error);
                return { isError: true, error: error?.message || String(error), content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify({ error: error?.message || String(error) }) }] };
            }
        }
    );

     server.tool("nocodb-alter-table-remove-column",
        staticToolsCapabilities["nocodb-alter-table-remove-column"].description,
        { columnId: z.string() }, // Schéma Zod
        async ({ columnId }) => {
            console.log("[TOOL] nocodb-alter-table-remove-column called with:", { columnId });
            try {
                const response = await alterTableRemoveColumn(columnId);
                console.log("[TOOL] nocodb-alter-table-remove-column response:", response);
                return { content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }] };
            } catch (error: any) {
                console.error("[TOOL] nocodb-alter-table-remove-column error:", error);
                return { isError: true, error: error?.message || String(error), content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify({ error: error?.message || String(error) }) }] };
            }
        }
    );

     server.tool("nocodb-create-table",
        staticToolsCapabilities["nocodb-create-table"].description,
        { tableName: z.string(), data: z.array(z.object({ title: z.string(), uidt: z.enum(["SingleLineText", "Number", "Checkbox", "DateTime"]) })) }, // Schéma Zod
        async ({ tableName, data }) => {
            console.log("[TOOL] nocodb-create-table called with:", { tableName, data });
            try {
                const response = await createTable(tableName, data);
                console.log("[TOOL] nocodb-create-table response:", response);
                return { content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }] };
            } catch (error: any) {
                console.error("[TOOL] nocodb-create-table error:", error);
                return { isError: true, error: error?.message || String(error), content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify({ error: error?.message || String(error) }) }] };
            }
        }
    );
    // --- Fin Enregistrement Outils ---


    // --- Démarrage Serveur Express + SSE ---
    const app = express();
    app.use(cors());
    app.use(express.json());

    const transports: { [sessionId: string]: SSEServerTransport } = {};

    app.get("/sse", async (req: Request, res: Response) => {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] Nouvelle requête de connexion SSE reçue.`);
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');

        const transport = new SSEServerTransport('/messages', res);
        const sessionId = transport.sessionId;
        transports[sessionId] = transport;
        console.log(`[${timestamp}] Transport SSE créé pour la session : ${sessionId}`);

        res.on("close", () => {
            const closeTimestamp = new Date().toISOString();
            console.log(`[${closeTimestamp}] Connexion SSE fermée pour la session : ${sessionId}`);
            delete transports[sessionId];
        });

        const keepAliveInterval = setInterval(() => {
            if (!res.writableEnded) {
                res.write(': keep-alive\n\n');
            } else {
                clearInterval(keepAliveInterval);
            }
        }, 25000);

        try {
            await server.connect(transport);
            console.log(`[${new Date().toISOString()}] McpServer connecté au transport pour la session : ${sessionId}`);
        } catch (error) {
            console.error(`[${new Date().toISOString()}] Erreur lors de la connexion de McpServer au transport ${sessionId}:`, error);
            clearInterval(keepAliveInterval);
            if (!res.writableEnded) {
                res.status(500).end();
            }
        }
    });

    app.post("/messages", async (req: Request, res: Response) => {
        const sessionId = req.query.sessionId as string;
        const transport = transports[sessionId];
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] POST reçu sur /messages pour la session : ${sessionId}`);
        console.log(`[${timestamp}] POST /messages Body brut reçu :`, JSON.stringify(req.body));

        // Interception manuelle de la requête d'initialisation MCP
        if (req.body && req.body.method === "initialize") {
            console.log(`[${timestamp}] Tentative de gestion manuelle de l'initialisation`);
            try {
                // Utiliser l'objet capabilities statique construit au démarrage
                const response = {
                    jsonrpc: "2.0",
                    id: req.body.id,
                    result: {
                        protocolVersion: req.body.params.protocolVersion, // Utiliser la version demandée par le client
                        serverInfo: {
                            name: "nocodb-mcp-server", // Utiliser la valeur statique
                            version: "1.0.0" // Utiliser la valeur statique
                        },
                        capabilities: {
                            tools: staticToolsCapabilities // Utilisation de l'objet statique avec JSON Schemas
                        }
                    }
                };
                console.log(`[${timestamp}] Réponse d'initialisation manuelle (statique) envoyée pour ID ${req.body.id}`);
                res.json(response);
                return; // Important: sortir de la fonction après avoir répondu
            } catch (error) {
                console.error(`[${timestamp}] Erreur lors de la réponse manuelle (statique):`, error);
                if (!res.headersSent) {
                    res.status(500).json({ jsonrpc: "2.0", id: req.body.id, error: { code: -32000, message: "Erreur interne lors de la construction de la réponse d'initialisation" } });
                }
            }
        }

        // Gérer les autres messages (ex: callTool) via le SDK
        if (transport) {
            try {
                await transport.handlePostMessage(req, res); // Le SDK devrait router vers les handlers server.tool
            } catch (error) {
                console.error(`[${timestamp}] Erreur lors du traitement du message POST par le SDK pour la session ${sessionId}:`, error);
                if (!res.headersSent) {
                    res.status(500).send('Erreur lors du traitement du message par le SDK');
                } else if (!res.writableEnded) {
                    res.end();
                }
            }
        } else {
            console.error(`[${timestamp}] Aucun transport trouvé pour la session ${sessionId} dans la requête POST /messages.`);
            res.status(400).send('Aucun transport trouvé pour cet ID de session (sessionId manquant ou invalide dans les query params ?)');
        }
    });

    const PORT = parseInt(process.env.PORT || "3000", 10);
    app.listen(PORT, '0.0.0.0', () => {
        const startTimestamp = new Date().toISOString();
        console.log(`[${startTimestamp}] Serveur MCP (HTTP/SSE) démarré.`);
        console.log(`[${startTimestamp}] Écoute sur le port : ${PORT}`);
        console.log(`[${startTimestamp}] Endpoint SSE disponible sur : http://<votre-ip>:${PORT}/sse`);
        console.log(`[${startTimestamp}] Endpoint pour messages client : POST http://<votre-ip>:${PORT}/messages?sessionId=<ID>`);
    });
    // --- Fin Démarrage Serveur ---
}

void main();
