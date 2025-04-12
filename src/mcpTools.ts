import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { filterRules } from "./config.js"; // Import filter rules description
import * as NocoDB from "./nocodbApi.js"; // Import all API functions

// Define a function to register all tools with the MCP server instance
export function registerNocoDbTools(server: McpServer) {

    console.log("[mcpTools] Registering NocoDB tools...");

    // --- Record Tools ---
    server.tool("nocodb-get-records",
        "Nocodb - Get Records. Retrieves a list of records from a table, with options for filtering, sorting, pagination, and field selection." +
        `\nHints:\n` +
        `1. Get all records (default limit applies): get_records(table_name="customers")\n` +
        `2. Filter records: get_records(table_name="orders", filters="(status,eq,completed)~and(total,gt,100)")\n` +
        `3. Paginate: get_records(table_name="products", limit=50, offset=100)\n` +
        `4. Sort: get_records(table_name="users", sort="-lastLogin,name")\n` +
        `5. Select fields: get_records(table_name="tasks", fields="id,title,dueDate")\n` +
        `Filter Rules:\n${filterRules}`,
        {
            tableName: z.string().describe("Name of the NocoDB table."),
            filters: z.string().optional().describe("Filtering conditions using NocoDB's query language."),
            limit: z.number().int().positive().optional().describe("Maximum number of records to return."),
            offset: z.number().int().nonnegative().optional().describe("Number of records to skip (for pagination)."),
            sort: z.string().optional().describe("Comma-separated list of fields to sort by. Prefix with '-' for descending order (e.g., '-createdAt,name')."),
            fields: z.string().optional().describe("Comma-separated list of field names to include in the response."),
        },
        async (params) => {
            const response = await NocoDB.getRecords(params.tableName, params.filters, params.limit, params.offset, params.sort, params.fields);
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    server.tool("nocodb-post-records",
        "Nocodb - Post Records. Creates one or more new records in a specified table." +
        `\nIMPORTANT: Use 'nocodb-get-table-metadata' first to confirm the exact column names (case-sensitive) required for the table.` +
        `\nExample:\n` +
        `post_records(table_name="tasks", data={"title": "New Task", "priority": "High", "dueDate": "2025-12-31"})`,
        {
            tableName: z.string().describe("Name of the NocoDB table."),
            data: z.any().describe("An object representing a single record or an array of objects for multiple records. Keys must match table column names exactly.")
        },
        async (params) => {
            const response = await NocoDB.postRecords(params.tableName, params.data);
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    server.tool("nocodb-patch-records",
        "Nocodb - Patch Records. Updates one or more existing records in a specified table." +
        `\nIMPORTANT: Use 'nocodb-get-table-metadata' first to confirm the exact column names (case-sensitive) for the fields you want to update.` +
        `\nExample:\n` +
        `patch_records(table_name="tasks", row_id=5, data={"status": "Completed", "completedAt": "2025-04-13"})`,
        {
            tableName: z.string().describe("Name of the NocoDB table."),
            rowId: z.number().int().positive().describe("The ID of the record to update."), // Assuming single record update for simplicity, NocoDB API might support batch
            data: z.any().describe("An object containing the fields to update. Keys must match table column names exactly.")
        },
        async (params) => {
            // Note: The underlying NocoDB.patchRecords function expects rowId separately
            const response = await NocoDB.patchRecords(params.tableName, params.rowId, params.data);
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    server.tool("nocodb-delete-records",
        "Nocodb - Delete Records. Deletes one or more records from a specified table." +
        `\nExample:\n` +
        `delete_records(table_name="tasks", row_id=10)`,
        {
            tableName: z.string().describe("Name of the NocoDB table."),
            rowId: z.number().int().positive().describe("The ID of the record to delete.") // Assuming single record delete
        },
        async (params) => {
            const response = await NocoDB.deleteRecords(params.tableName, params.rowId);
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    server.tool("nocodb-get-record",
        "Nocodb - Get Record. Retrieves a single specific record by its ID." +
        `\nHints:\n` +
        `1. Get record by ID: get_record(table_name="customers", record_id=123)\n` +
        `2. Select specific fields: get_record(table_name="customers", record_id=123, fields="id,name,email")`,
        {
            tableName: z.string().describe("Name of the NocoDB table."),
            recordId: z.string().or(z.number()).describe("The ID of the specific record to retrieve."),
            fields: z.string().optional().describe("Comma-separated list of fields to return.")
        },
        async (params) => {
            const response = await NocoDB.getRecord(params.tableName, String(params.recordId), params.fields);
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    server.tool("nocodb-count-records",
        "Nocodb - Count Records. Counts the number of records in a table, optionally applying filters." +
        `\nHints:\n` +
        `1. Count all: count_records(table_name="orders")\n` +
        `2. Count with filter: count_records(table_name="orders", filters="(status,eq,pending)")\n` +
        `3. Count in view: count_records(table_name="orders", view_id="vw_abc123")`,
        {
            tableName: z.string().describe("Name of the NocoDB table."),
            filters: z.string().optional().describe("Filtering conditions (same format as get-records)."),
            viewId: z.string().optional().describe("Optional view ID to count records within a specific view.")
        },
        async (params) => {
            const response = await NocoDB.countRecords(params.tableName, params.filters, params.viewId);
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    // --- Linked Record Tools ---
    server.tool("nocodb-get-linked-records",
        "Nocodb - Get Linked Records. Retrieves records linked to a specific record via a LinkToAnotherRecord field." +
        `\nHints:\n` +
        `1. Get all linked: get_linked_records(table_name="orders", link_field_id="cl_xyz123", record_id=1)\n` +
        `2. With options: get_linked_records(table_name="orders", link_field_id="cl_xyz123", record_id=1, fields="id,product_name", limit=10)`,
        {
            tableName: z.string().describe("Name of the table containing the link field."),
            linkFieldId: z.string().describe("The ID of the LinkToAnotherRecord column (e.g., 'cl_xyz123'). Get this from table metadata."),
            recordId: z.string().or(z.number()).describe("The ID of the record whose linked records you want to retrieve."),
            fields: z.string().optional().describe("Fields to return for the linked records."),
            sort: z.string().optional().describe("Sorting for the linked records."),
            filters: z.string().optional().describe("Filtering for the linked records."),
            limit: z.number().int().positive().optional(),
            offset: z.number().int().nonnegative().optional()
        },
        async (params) => {
            const options = { fields: params.fields, sort: params.sort, filters: params.filters, limit: params.limit, offset: params.offset };
            const response = await NocoDB.getLinkedRecords(params.tableName, params.linkFieldId, String(params.recordId), options);
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    server.tool("nocodb-link-records",
        "Nocodb - Link Records. Creates links between a record and one or more other records." +
        `\nExample:\n` +
        `link_records(table_name="projects", link_field_id="cl_abc456", record_id=10, links_to_add=[{"id": 25}, {"id": 30}])`,
        {
            tableName: z.string().describe("Name of the table containing the link field."),
            linkFieldId: z.string().describe("The ID of the LinkToAnotherRecord column."),
            recordId: z.string().or(z.number()).describe("The ID of the record to link from."),
            linksToAdd: z.array(z.object({ id: z.number() }))
                .min(1)
                .describe("Array of objects, each containing the 'id' (lowercase) of a record to link to. E.g., [{'id': 5}, {'id': 6}]")
        },
        async (params) => {
            const response = await NocoDB.linkRecords(params.tableName, params.linkFieldId, String(params.recordId), params.linksToAdd);
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    server.tool("nocodb-unlink-records",
        "Nocodb - Unlink Records. Removes links between a record and one or more other records." +
        `\nExample:\n` +
        `unlink_records(table_name="projects", link_field_id="cl_abc456", record_id=10, links_to_remove=[{"id": 25}])`,
        {
            tableName: z.string().describe("Name of the table containing the link field."),
            linkFieldId: z.string().describe("The ID of the LinkToAnotherRecord column."),
            recordId: z.string().or(z.number()).describe("The ID of the record to unlink from."),
            linksToRemove: z.array(z.object({ id: z.number() }))
                .min(1)
                .describe("Array of objects, each containing the 'id' (lowercase) of a linked record to remove. E.g., [{'id': 5}, {'id': 6}]")
        },
        async (params) => {
            const response = await NocoDB.unlinkRecords(params.tableName, params.linkFieldId, String(params.recordId), params.linksToRemove);
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    // --- Attachment Tool ---
    server.tool("nocodb-upload-attachment",
        "Nocodb - Upload Attachment. Uploads a file from the MCP server's local filesystem to NocoDB storage." +
        `\nExample:\n` +
        `upload_attachment(file_path_on_server="/app/data/report.pdf", storage_path="reports/2025", file_name="Q1_Report.pdf", mime_type="application/pdf")`,
        {
            filePathOnServer: z.string().describe("Absolute path to the file on the server running this MCP."),
            storagePath: z.string().describe("Path within NocoDB storage (e.g., 'attachments/images')."),
            fileName: z.string().describe("The desired file name for the attachment in NocoDB."),
            mimeType: z.string().describe("MIME type of the file (e.g., 'image/jpeg', 'application/pdf').")
        },
        async (params) => {
            const response = await NocoDB.uploadAttachment(params.filePathOnServer, params.storagePath, params.fileName, params.mimeType);
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    // --- Metadata and Schema Tools ---
    server.tool("nocodb-get-list-tables",
        "Nocodb - Get List Tables. Retrieves a list of all table names in the configured NocoDB base.",
        {}, // No parameters
        async () => {
            const response = await NocoDB.getListTables();
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    server.tool("nocodb-get-table-metadata",
        "Nocodb - Get Table Metadata. Retrieves detailed metadata for a specific table, including column names, types, and IDs." +
        `\nCRITICAL: Use this tool before 'nocodb-post-records' or 'nocodb-patch-records' to get the exact column names required.` +
        `\nExample: get_table_metadata(table_name="users")`,
        {
            tableName: z.string().describe("Name of the NocoDB table.")
        },
        async (params) => {
            const response = await NocoDB.getTableMetadata(params.tableName);
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    server.tool("nocodb-alter-table-add-column",
        "Nocodb - Alter Table Add Column. Adds a new column to an existing table." +
        `\nSupported column types (uidt): SingleLineText, LongText, Number, Decimal, Date, DateTime, Time, Year, Duration, Currency, Percent, Rollup, Formula, LinkToAnotherRecord, LookUp, Checkbox, MultiSelect, SingleSelect, Collaborator, Attachment, Barcode, QRCode, CreatedTime, LastModifiedTime, AutoNumber, Url, Email, Phone, Formula, User, CreatedBy, LastModifiedBy, SpecificDBType` +
        `\nIMPORTANT: For 'LinkToAnotherRecord', you MUST provide 'parentTableName' and 'relationType'.` +
        `\nExamples:\n` +
        `1. Standard column: alter_table_add_column(table_name="products", column_name="StockCount", column_type="Number")\n` +
        `2. Link column (HasMany): alter_table_add_column(table_name="authors", column_name="Books", column_type="LinkToAnotherRecord", parent_table_name="books", relation_type="hm")\n` +
        `3. Link column (BelongsTo): alter_table_add_column(table_name="books", column_name="Author", column_type="LinkToAnotherRecord", parent_table_name="authors", relation_type="bt")`,
        {
            tableName: z.string().describe("Name of the NocoDB table where the column will be added."),
            columnName: z.string().describe("Name for the new column."),
            columnType: z.string().describe("Type of the new column (NocoDB UIDT)."),
            // Optional fields, but required if columnType is LinkToAnotherRecord
            parentTableName: z.string().optional().describe("Required if columnType is 'LinkToAnotherRecord'. Name of the table this column links TO."),
            relationType: z.enum(['hm', 'bt', 'mm']).optional().describe("Required if columnType is 'LinkToAnotherRecord'. Type of relationship: 'hm' (HasMany), 'bt' (BelongsTo), 'mm' (ManyToMany).")
        },
        async (params) => {
            let response;
            if (params.columnType === 'LinkToAnotherRecord') {
                // Validate required fields for LinkToAnotherRecord
                if (!params.parentTableName || !params.relationType) {
                    throw new Error("For 'LinkToAnotherRecord' column type, 'parentTableName' and 'relationType' parameters are required.");
                }
                // Resolve IDs
                const childId = await NocoDB.getTableId(params.tableName); // ID of the table where column is added
                const parentId = await NocoDB.getTableId(params.parentTableName); // ID of the table being linked to

                const linkOptions = {
                    parentId: parentId,
                    childId: childId,
                    relationType: params.relationType
                };
                response = await NocoDB.alterTableAddColumn(params.tableName, params.columnName, params.columnType, linkOptions);

            } else {
                // For other column types, call without link options
                response = await NocoDB.alterTableAddColumn(params.tableName, params.columnName, params.columnType);
            }
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    server.tool("nocodb-alter-table-remove-column",
        "Nocodb - Alter Table Remove Column. Removes an existing column from a table." +
        `\nWARNING: This action is irreversible and will delete the column and all its data.` +
        `\nGet the 'columnId' from 'nocodb-get-table-metadata'.` +
        `\nExample: alter_table_remove_column(column_id="cl_abc123xyz")`,
        {
            columnId: z.string().describe("The unique ID of the column to remove (obtained from metadata).")
        },
        async (params) => {
            // Consider adding a confirmation step here in a real application
            const response = await NocoDB.alterTableRemoveColumn(params.columnId);
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    server.tool("nocodb-create-table",
        "Nocodb - Create Table. Creates a new table with specified columns." +
        `\nAn 'Id' column (type: ID) will be added automatically if not provided.` +
        `\nSupported column types (uidt): See 'nocodb-alter-table-add-column'.` +
        `\nExample:\n` +
        `create_table(table_name="employees", data=[{"title": "Name", "uidt": "SingleLineText"}, {"title": "HireDate", "uidt": "Date"}, {"title": "Salary", "uidt": "Currency"}])`,
        {
            tableName: z.string().describe("Name for the new NocoDB table."),
            data: z.array(z.object({
                title: z.string().describe("Name of the column."),
                uidt: z.string().describe("Type of the column (NocoDB UIDT).")
            })).min(1).describe("Array defining the columns for the new table.")
        },
        async (params) => {
            const response = await NocoDB.createTable(params.tableName, params.data);
            return {
                content: [{ type: 'text', mimeType: 'application/json', text: JSON.stringify(response) }],
            }
        }
    );

    console.log("[mcpTools] All NocoDB tools registered.");
}
