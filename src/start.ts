#!/usr/bin/env node
import {McpServer, ResourceTemplate} from "@modelcontextprotocol/sdk/server/mcp.js";
import {SSEServerTransport} from "@modelcontextprotocol/sdk/server/sse.js";
import express, { Request, Response } from "express";
import cors from 'cors';
import {z} from "zod";
import axios, {AxiosInstance} from "axios";

let {NOCODB_URL, NOCODB_BASE_ID, NOCODB_API_TOKEN} = process.env;
if (!NOCODB_URL || !NOCODB_BASE_ID || !NOCODB_API_TOKEN) {
    // check from npx param input
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
`

const nocodbClient: AxiosInstance = axios.create({
    baseURL: NOCODB_URL.replace(/\/$/, ""),
    headers: {
        "xc-token": NOCODB_API_TOKEN,
        "Content-Type": "application/json",
    },
    timeout: 30000,
});

export async function getRecords(tableName: string,
                                 filters?: string,
                                 limit?: number,
                                 offset?: number,
                                 sort?: string,
                                 fields?: string,
) {
    const tableId = await getTableId(tableName);

    const paramsArray = []
    if (filters) {
        paramsArray.push(`where=${filters}`);
    }
    if (limit) {
        paramsArray.push(`limit=${limit}`);
    }
    if (offset) {
        paramsArray.push(`offset=${offset}`);
    }
    if (sort) {
        paramsArray.push(`sort=${sort}`);
    }
    if (fields) {
        paramsArray.push(`fields=${fields}`);
    }

    const queryString = paramsArray.join("&");
    const response = await nocodbClient.get(`/api/v2/tables/${tableId}/records?${queryString}`,);
    return {
        input: {
            tableName,
            filters,
            limit,
            offset,
            sort,
            fields
        },
        output: response.data
    };
}

export async function postRecords(tableName: string, data: unknown) {
    const tableId = await getTableId(tableName);
    const response = await nocodbClient.post(`/api/v2/tables/${tableId}/records`, data);
    return {
        output: response.data,
        input: data
    };
}

export async function patchRecords(tableName: string, rowId: number, data: any) {
    const tableId = await getTableId(tableName);
    const newData = [{
        ...data,
        "Id": rowId,
    }]

    const response = await nocodbClient.patch(`/api/v2/tables/${tableId}/records`, newData);
    return {
        output: response.data,
        input: data
    };
}

export async function deleteRecords(tableName: string, rowId: number) {
    const tableId = await getTableId(tableName);
    const data: any =
        {
            "Id": rowId
        }
    const response = await nocodbClient.delete(`/api/v2/tables/${tableId}/records`, {data});
    return response.data;
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
        throw new Error(`Error adding column: ${error.message}`);
    }
}


// column type

// SingleLineText
// Number
// Decimals
// DateTime
// Checkbox
export async function alterTableAddColumn(tableName: string, columnName: string, columnType: string) {
    try {
        const tableId = await getTableId(tableName);
        const response = await nocodbClient.post(`/api/v2/meta/tables/${tableId}/columns`, {
            title: columnName,
            uidt: columnType,
        });
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
        throw new Error(`Error remove column: ${error.message}`);
    }
}

type ColumnType = "SingleLineText" | "Number" | "Checkbox" | "DateTime" | "ID";
type TableColumnType = {
    title: string;
    uidt: ColumnType
}

export async function createTable(tableName: string, data: TableColumnType[]) {
    try {

        const hasId = data.filter(x => x.title === "Id").length > 0
        if (!hasId) {
            // insert at first
            data.unshift({
                title: "Id",
                uidt: "ID"
            })
        }

        const response = await nocodbClient.post(`/api/v2/meta/bases/${NOCODB_BASE_ID}/tables`, {
            title: tableName,
            columns: data.map((value) => ({
                title: value.title,
                uidt: value.uidt
            })),
        });
        return response.data;
    } catch (error: any) {
        throw new Error(`Error creating table: ${error.message}`);
    }
}


// Create an MCP server
const server = new McpServer({
    name: "nocodb-mcp-server",
    version: "1.0.0"
});

async function main() {

    server.tool("nocodb-get-records",
        "Nocodb - Get Records" +
        `hint:
    1. Get all records from a table (limited to 10):
       retrieve_records(table_name="customers")

    3. Filter records with conditions:
       retrieve_records(
           table_name="customers",
           filters="(age,gt,30)~and(status,eq,active)"
       )

    4. Paginate results:
       retrieve_records(table_name="customers", limit=20, offset=40)

    5. Sort results:
       retrieve_records(table_name="customers", sort="-created_at")

    6. Select specific fields:
       retrieve_records(table_name="customers", fields="id,name,email")
`,
        {
            tableName: z.string(),
            filters: z.string().optional().describe(
                `Example: where=(field1,eq,value1)~and(field2,eq,value2) will filter records where 'field1' is equal to 'value1' AND 'field2' is equal to 'value2'.
You can also use other comparison operators like 'ne' (not equal), 'gt' (greater than), 'lt' (less than), and more, to create complex filtering rules.
` + " " + filterRules),
            limit: z.number().optional(),
            offset: z.number().optional(),
            sort: z.string().optional().describe("Example: sort=field1,-field2 will sort the records first by 'field1' in ascending order and then by 'field2' in descending order."),
            fields: z.string().optional().describe("Example: fields=field1,field2 will include only 'field1' and 'field2' in the API response."),
        },
        async ({tableName, filters, limit, offset, sort, fields}) => {
            const response = await getRecords(tableName, filters, limit, offset, sort, fields);
            return {
                content: [{
                    type: 'text',
                    mimeType: 'application/json',
                    text: JSON.stringify(response),
                }],
            }
        }
    );

    server.tool(
        "nocodb-get-list-tables",
        `Nocodb - Get List Tables
notes: only show result from output to user
`,
        {},
        async () => {
            const response = await getListTables()
            return {
                content: [{
                    type: 'text',
                    mimeType: 'application/json',
                    text: JSON.stringify(response),
                }],
            }
        }
    )

    server.tool(
        "nocodb-post-records",
        "Nocodb - Post Records",
        {
            tableName: z.string().describe("table name"),
            data: z.any()
                .describe(`The data to be inserted into the table.
[WARNING] The structure of this object should match the columns of the table.
example:
const response = await postRecords("Shinobi", {
        Title: "sasuke"
})`)
        },
        async ({tableName, data}) => {
            const response = await postRecords(tableName, data)
            return {
                content: [{
                    type: 'text',
                    mimeType: 'application/json',
                    text: JSON.stringify(response),
                }],
            }
        }
    );


    server.tool("nocodb-patch-records",
        "Nocodb - Patch Records",
        {
            tableName: z.string(),
            rowId: z.number(),
            data: z.any().describe(`The data to be updated in the table.
[WARNING] The structure of this object should match the columns of the table.
example:
const response = await patchRecords("Shinobi", 2, {
            Title: "sasuke-updated"
})`)
        },
        async ({tableName, rowId, data}) => {
            const response = await patchRecords(tableName, rowId, data)
            return {
                content: [{
                    type: 'text',
                    mimeType: 'application/json',
                    text: JSON.stringify(response),
                }],
            }
        }
    );

    server.tool("nocodb-delete-records",
        "Nocodb - Delete Records",
        {tableName: z.string(), rowId: z.number()},
        async ({tableName, rowId}) => {
            const response = await deleteRecords(tableName, rowId)
            return {
                content: [{
                    type: 'text',
                    mimeType: 'application/json',
                    text: JSON.stringify(response),
                }],
            }
        }
    );

    server.tool("nocodb-get-table-metadata",
        "Nocodb - Get Table Metadata",
        {tableName: z.string()},
        async ({tableName}) => {
            const response = await getTableMetadata(tableName)
            return {
                content: [{
                    type: 'text',
                    mimeType: 'application/json',
                    text: JSON.stringify(response),
                }],
            }
        }
    );

    server.tool("nocodb-alter-table-add-column",
        "Nocodb - Alter Table Add Column",
        {
            tableName: z.string(),
            columnName: z.string(),
            columnType: z.string().describe("SingleLineText, Number, Decimals, DateTime, Checkbox")
        },
        async ({tableName, columnName, columnType}) => {
            const response = await alterTableAddColumn(tableName, columnName, columnType)
            return {
                content: [{
                    type: 'text',
                    mimeType: 'application/json',
                    text: JSON.stringify(response),
                }],
            }
        }
    );

    server.tool("nocodb-alter-table-remove-column",
        "Nocodb - Alter Table Remove Column" +
        " get columnId from getTableMetadata" +
        " notes: remove column by columnId" +
        " example: c7uo2ruwc053a3a" +
        " [WARNING] this action is irreversible" +
        " [RECOMMENDATION] give warning to user",
        {columnId: z.string()},
        async ({columnId}) => {
            const response = await alterTableRemoveColumn(columnId)
            return {
                content: [{
                    type: 'text',
                    mimeType: 'application/json',
                    text: JSON.stringify(response),
                }],
            }
        }
    );

    server.tool("nocodb-create-table",
        "Nocodb - Create Table",
        {
            tableName: z.string(),
            data: z.array(z.object({
                title: z.string(),
                uidt: z.enum(["SingleLineText", "Number", "Checkbox", "DateTime"]).describe("SingleLineText, Number, Checkbox, DateTime")

            }).describe(`The data to be inserted into the table.
[WARNING] The structure of this object should match the columns of the table.
example:
const response = await createTable("Shinobi", [
        {
            title: "Name",
            uidt: "SingleLineText"
        },
        {
            title: "Age",
            uidt: "Number"
        },
        {
            title: "isHokage",
            uidt: "Checkbox"
        },
        {
            title: "Birthday",
            uidt: "DateTime"
        }
    ]
)`))
        },
        async ({tableName, data}) => {
            const response = await createTable(tableName, data)
            return {
                content: [{
                    type: 'text',
                    mimeType: 'application/json',
                    text: JSON.stringify(response),
                }],
            }
        }
    );


    // Add a dynamic greeting resource
    server.resource(
        "greeting",
        new ResourceTemplate("greeting://{name}", {list: undefined}),
        async (uri, {name}) => ({
            contents: [{
                uri: uri.href,
                text: `Hello, ${name}!`
            }]
        })
    );

    // ---> Début : Implémentation Serveur HTTP/SSE <---
    const app = express();
    app.use(cors()); // Active CORS (Cross-Origin Resource Sharing)
    app.use(express.json()); // Active le parsing des corps de requête JSON pour la route POST /messages

    // Dictionnaire pour stocker les transports actifs par ID de session
    const transports: {[sessionId: string]: SSEServerTransport} = {};

    // Endpoint pour les connexions SSE (Server-Sent Events)
    app.get("/sse", async (req: Request, res: Response) => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] Nouvelle requête de connexion SSE reçue.`);

      // Headers requis pour SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      // res.flushHeaders(); // Envoie les headers immédiatement

      // Crée un nouveau transport SSE pour cette connexion spécifique
      // Le '/messages' indique au client où envoyer les messages via POST
      const transport = new SSEServerTransport('/messages', res);
      const sessionId = transport.sessionId;
      transports[sessionId] = transport; // Enregistre le transport
      console.log(`[${timestamp}] Transport SSE créé pour la session : ${sessionId}`);

      // Gestion de la déconnexion client
      res.on("close", () => {
        const closeTimestamp = new Date().toISOString();
        // Log additional details about the response state at the time of closure
        console.log(`[${closeTimestamp}] Connexion SSE fermée pour la session : ${sessionId}. Headers Sent: ${res.headersSent}, Writable Ended: ${res.writableEnded}`);
        // Stop the keep-alive interval when the connection closes
        clearInterval(keepAliveInterval);
        delete transports[sessionId]; // Nettoie le transport
        // Note: Vérifier si transport.close() ou une méthode similaire existe dans le SDK pour un nettoyage plus propre
      });

      // Envoi périodique de commentaires pour maintenir la connexion ouverte (évite certains timeouts proxy)
      const keepAliveInterval = setInterval(() => {
        if (!res.writableEnded) {
            res.write(': keep-alive\n\n'); // Envoie un commentaire SSE
        } else {
            // Arrête si la connexion est déjà fermée
            clearInterval(keepAliveInterval);
        }
      }, 25000); // Toutes les 25 secondes

      // Connecte la logique du serveur MCP à cette instance de transport
      try {
          await server.connect(transport);
          console.log(`[${new Date().toISOString()}] McpServer connecté au transport pour la session : ${sessionId}`);
      } catch (error) {
          console.error(`[${new Date().toISOString()}] Erreur lors de la connexion de McpServer au transport ${sessionId}:`, error);
          clearInterval(keepAliveInterval); // Arrête le keep-alive en cas d'erreur
          if (!res.writableEnded) {
              // Termine la réponse si une erreur survient pendant la connexion
              res.status(500).end();
          }
      }
    });

    // Endpoint pour recevoir les messages envoyés par le client via POST
    app.post("/messages", async (req: Request, res: Response) => {
      const sessionId = req.query.sessionId as string; // L'ID de session est requis dans l'URL (?sessionId=...)
      const transport = transports[sessionId]; // Trouve le transport correspondant
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] POST reçu sur /messages pour la session : ${sessionId}`);

      if (transport) {
        console.log(`[${timestamp}] Début du traitement du message POST pour la session ${sessionId}...`);
        try {
          // Délègue la gestion du message au transport SSE approprié
          await transport.handlePostMessage(req, res);
          // handlePostMessage devrait gérer l'envoi de la réponse HTTP au client
          console.log(`[${new Date().toISOString()}] Fin du traitement du message POST (handlePostMessage terminé) pour la session ${sessionId}. Headers Sent: ${res.headersSent}, Writable Ended: ${res.writableEnded}`);
        } catch (error) {
          console.error(`[${new Date().toISOString()}] Erreur DANS handlePostMessage pour la session ${sessionId}:`, error);
          // Tente d'envoyer une réponse d'erreur si possible
          if (!res.headersSent) {
            res.status(500).send('Erreur lors du traitement du message');
          } else if (!res.writableEnded){
            res.end(); // Termine la connexion si les headers sont déjà envoyés
          }
        }
      } else {
        // Aucun transport trouvé pour cet ID de session
        console.error(`[${timestamp}] Aucun transport trouvé pour la session ${sessionId} dans la requête POST /messages.`);
        res.status(400).send('Aucun transport trouvé pour cet ID de session (sessionId manquant ou invalide dans les query params ?)');
      }
    });

    // Définition du port d'écoute, priorité à la variable d'environnement PORT, sinon 3000 par défaut
    const PORT = parseInt(process.env.PORT || "3000", 10);

    // Démarrage du serveur Express qui écoute sur le port défini
    app.listen(PORT, '0.0.0.0', () => { // Écoute sur 0.0.0.0 pour être accessible depuis Docker
      const startTimestamp = new Date().toISOString();
      console.log(`[${startTimestamp}] Serveur MCP (HTTP/SSE) démarré.`);
      console.log(`[${startTimestamp}] Écoute sur le port : ${PORT}`);
      console.log(`[${startTimestamp}] Endpoint SSE disponible sur : http://<votre-ip>:${PORT}/sse`);
      console.log(`[${startTimestamp}] Endpoint pour messages client : POST http://<votre-ip>:${PORT}/messages?sessionId=<ID>`);
    });
    // ---> Fin : Implémentation Serveur HTTP/SSE <---
}

void main();
