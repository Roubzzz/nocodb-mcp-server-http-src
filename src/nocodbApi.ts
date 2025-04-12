import axios from "axios";
import fs from 'fs/promises';
import FormData from 'form-data';
import { nocodbClient, NocoDbBaseId } from "./config.js"; // Import client and Base ID

// --- Helper Function: Get Table ID ---
// This is used internally by many other functions, so keep it here.
export const getTableId = async (tableName: string): Promise<string> => {
    console.log(`[getTableId] Resolving ID for table: ${tableName}`);
    try {
        const response = await nocodbClient.get(`/api/v2/meta/bases/${NocoDbBaseId}/tables`);
        const tables = response.data.list || [];
        const table = tables.find((t: any) => t.title === tableName);
        if (!table) {
            console.error(`[getTableId] Table '${tableName}' not found in base ${NocoDbBaseId}`);
            throw new Error(`Table '${tableName}' not found`);
        }
        console.log(`[getTableId] Resolved tableId: ${table.id} for tableName: ${tableName}`);
        return table.id;
    } catch (error: any) {
        console.error(`[getTableId] Error retrieving table ID for '${tableName}': ${error.message}`);
        // Re-throw the error after logging
        if (axios.isAxiosError(error)) {
             console.error(`[getTableId] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw new Error(`Error retrieving table ID: ${error.message}`);
    }
};


// --- Core Record Operations ---

export async function getRecords(tableName: string,
                                 filters?: string,
                                 limit?: number,
                                 offset?: number,
                                 sort?: string,
                                 fields?: string,
) {
    console.log(`[getRecords] Called for table: ${tableName}, Filters: ${filters}, Limit: ${limit}, Offset: ${offset}, Sort: ${sort}, Fields: ${fields}`);
    const tableId = await getTableId(tableName);

    const paramsArray = []
    if (filters) paramsArray.push(`where=${filters}`);
    if (limit) paramsArray.push(`limit=${limit}`);
    if (offset) paramsArray.push(`offset=${offset}`);
    if (sort) paramsArray.push(`sort=${sort}`);
    if (fields) paramsArray.push(`fields=${fields}`);

    const queryString = paramsArray.length > 0 ? `?${paramsArray.join("&")}` : "";
    const requestUrl = `/api/v2/tables/${tableId}/records${queryString}`;
    console.log(`[getRecords] Requesting GET: ${nocodbClient.defaults.baseURL}${requestUrl}`);

    try {
        const response = await nocodbClient.get(requestUrl);
        console.log(`[getRecords] GET response status: ${response.status}`);
        // Return structure expected by the tool definition
        return {
            input: { tableName, filters, limit, offset, sort, fields },
            output: response.data
        };
    } catch (error: any) {
        console.error(`[getRecords] GET request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[getRecords] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw error;
    }
}

export async function postRecords(tableName: string, data: unknown) {
    console.log(`[postRecords] Called for table: ${tableName} with data: ${JSON.stringify(data)}`);
    const tableId = await getTableId(tableName);
    const requestUrl = `/api/v2/tables/${tableId}/records`;
    console.log(`[postRecords] Requesting POST: ${nocodbClient.defaults.baseURL}${requestUrl}`);

    try {
        const response = await nocodbClient.post(requestUrl, data);
        console.log(`[postRecords] POST response status: ${response.status}`);
        // Return structure expected by the tool definition
        return {
            output: response.data,
            input: data
        };
    } catch (error: any) {
        console.error(`[postRecords] POST request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[postRecords] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw error;
    }
}

export async function patchRecords(tableName: string, rowId: number, data: any) {
    console.log(`[patchRecords] Called for table: ${tableName}, rowId: ${rowId} with data: ${JSON.stringify(data)}`);
    const tableId = await getTableId(tableName);
    const requestUrl = `/api/v2/tables/${tableId}/records`;
    const patchData = { ...data, id: rowId }; // Ensure lowercase 'id' is in the body
    console.log(`[patchRecords] Requesting PATCH: ${nocodbClient.defaults.baseURL}${requestUrl} with data: ${JSON.stringify(patchData)}`);

    try {
        const response = await nocodbClient.patch(requestUrl, patchData);
        console.log(`[patchRecords] PATCH response status: ${response.status}`);
        // Return structure expected by the tool definition
        return {
            output: response.data,
            input: patchData
        }
    } catch (error: any) {
        console.error(`[patchRecords] PATCH request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[patchRecords] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw error;
    }
}

export async function deleteRecords(tableName: string, rowId: number) {
    console.log(`[deleteRecords] Called for table: ${tableName}, rowId: ${rowId}`);
    const tableId = await getTableId(tableName);
    const requestUrl = `/api/v2/tables/${tableId}/records`;
    const data = { id: rowId }; // Ensure lowercase 'id' is in the body
    console.log(`[deleteRecords] Requesting DELETE: ${nocodbClient.defaults.baseURL}${requestUrl} with data: ${JSON.stringify(data)}`);

    try {
        const response = await nocodbClient.delete(requestUrl, { data }); // Pass ID in the data payload
        console.log(`[deleteRecords] DELETE response status: ${response.status}`);
        // Return structure expected by the tool definition (often just the ID or success status)
        return response.data;
    } catch (error: any) {
        console.error(`[deleteRecords] DELETE request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[deleteRecords] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw error;
    }
}

export async function getRecord(tableName: string, recordId: string, fields?: string) {
    console.log(`[getRecord] Called for table: ${tableName}, recordId: ${recordId}, fields: ${fields}`);
    const tableId = await getTableId(tableName);
    let requestUrl = `/api/v2/tables/${tableId}/records/${recordId}`;
    if (fields) {
        requestUrl += `?fields=${fields}`;
    }
    console.log(`[getRecord] Requesting GET: ${nocodbClient.defaults.baseURL}${requestUrl}`);

    try {
        const response = await nocodbClient.get(requestUrl);
        console.log(`[getRecord] GET response status: ${response.status}`);
        return response.data;
    } catch (error: any) {
        console.error(`[getRecord] GET request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[getRecord] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw error;
    }
}

export async function countRecords(tableName: string, filters?: string, viewId?: string) {
    console.log(`[countRecords] Called for table: ${tableName}, filters: ${filters}, viewId: ${viewId}`);
    const tableId = await getTableId(tableName);
    let requestUrl = `/api/v2/tables/${tableId}/records/count`;
    const params = [];
    if (filters) params.push(`where=${filters}`);
    if (viewId) params.push(`viewId=${viewId}`);
    if (params.length > 0) {
        requestUrl += `?${params.join('&')}`;
    }
    console.log(`[countRecords] Requesting GET: ${nocodbClient.defaults.baseURL}${requestUrl}`);

    try {
        const response = await nocodbClient.get(requestUrl);
        console.log(`[countRecords] GET response status: ${response.status}`);
        return response.data; // NocoDB returns { count: number }
    } catch (error: any) {
        console.error(`[countRecords] GET request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[countRecords] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw error;
    }
}

// --- Linked Record Operations ---

export async function getLinkedRecords(
    tableName: string,
    linkFieldId: string,
    recordId: string,
    options?: {
        fields?: string;
        sort?: string;
        filters?: string;
        limit?: number;
        offset?: number;
    }
) {
    console.log(`[getLinkedRecords] Called for table: ${tableName}, linkFieldId: ${linkFieldId}, recordId: ${recordId}`);
    const tableId = await getTableId(tableName);
    let requestUrl = `/api/v2/tables/${tableId}/links/${linkFieldId}/records/${recordId}`;
    const params = [];
    if (options?.fields) params.push(`fields=${options.fields}`);
    if (options?.sort) params.push(`sort=${options.sort}`);
    if (options?.filters) params.push(`where=${options.filters}`);
    if (options?.limit) params.push(`limit=${options.limit}`);
    if (options?.offset) params.push(`offset=${options.offset}`);
    if (params.length > 0) {
        requestUrl += `?${params.join('&')}`;
    }
    console.log(`[getLinkedRecords] Requesting GET: ${nocodbClient.defaults.baseURL}${requestUrl}`);

    try {
        const response = await nocodbClient.get(requestUrl);
        console.log(`[getLinkedRecords] GET response status: ${response.status}`);
        return response.data;
    } catch (error: any) {
        console.error(`[getLinkedRecords] GET request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[getLinkedRecords] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw error;
    }
}

export async function linkRecords(tableName: string, linkFieldId: string, recordId: string, linksToAdd: any[]) {
    console.log(`[linkRecords] Called for table: ${tableName}, linkFieldId: ${linkFieldId}, recordId: ${recordId}`);
    const tableId = await getTableId(tableName);
    const requestUrl = `/api/v2/tables/${tableId}/links/${linkFieldId}/records/${recordId}`;
    console.log(`[linkRecords] Requesting POST: ${nocodbClient.defaults.baseURL}${requestUrl} with data: ${JSON.stringify(linksToAdd)}`);

    try {
        // NocoDB expects an array of objects like [{id: linkedRecordId1}, {id: linkedRecordId2}]
        const response = await nocodbClient.post(requestUrl, linksToAdd);
        console.log(`[linkRecords] POST response status: ${response.status}`);
        return response.data;
    } catch (error: any) {
        console.error(`[linkRecords] POST request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[linkRecords] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw error;
    }
}

export async function unlinkRecords(tableName: string, linkFieldId: string, recordId: string, linksToRemove: any[]) {
    console.log(`[unlinkRecords] Called for table: ${tableName}, linkFieldId: ${linkFieldId}, recordId: ${recordId}`);
    const tableId = await getTableId(tableName);
    const requestUrl = `/api/v2/tables/${tableId}/links/${linkFieldId}/records/${recordId}`;
    console.log(`[unlinkRecords] Requesting DELETE: ${nocodbClient.defaults.baseURL}${requestUrl} with data: ${JSON.stringify(linksToRemove)}`);

    try {
        // NocoDB expects the IDs to remove in the data payload for DELETE on links
        // It expects an array of objects like [{id: linkedRecordId1}, {id: linkedRecordId2}]
        const response = await nocodbClient.delete(requestUrl, { data: linksToRemove });
        console.log(`[unlinkRecords] DELETE response status: ${response.status}`);
        return response.data;
    } catch (error: any) {
        console.error(`[unlinkRecords] DELETE request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[unlinkRecords] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw error;
    }
}

// --- Attachment Operations ---

export async function uploadAttachment(filePathOnServer: string, storagePath: string, fileName: string, mimeType: string) {
    console.log(`[uploadAttachment] Called with filePath: ${filePathOnServer}, storagePath: ${storagePath}, fileName: ${fileName}, mimeType: ${mimeType}`);
    let fileContent: Buffer;
    try {
        fileContent = await fs.readFile(filePathOnServer);
        console.log(`[uploadAttachment] Read file ${filePathOnServer} successfully (${fileContent.length} bytes).`);
    } catch (readError: any) {
        console.error(`[uploadAttachment] Failed to read file: ${readError.message}`);
        throw new Error(`Failed to read file from path: ${filePathOnServer}. Error: ${readError.message}`);
    }

    const formData = new FormData();
    formData.append('file', fileContent, { filename: fileName, contentType: mimeType });

    const requestUrl = `/api/v2/storage/upload?path=${encodeURIComponent(storagePath)}`;
    console.log(`[uploadAttachment] Requesting POST: ${nocodbClient.defaults.baseURL}${requestUrl}`);

    try {
        const response = await nocodbClient.post(requestUrl, formData, {
            headers: {
                ...formData.getHeaders(), // Let form-data set Content-Type and boundary
            }
        });
        console.log(`[uploadAttachment] POST response status: ${response.status}`);
        return response.data; // NocoDB returns an array with attachment details
    } catch (error: any) {
        console.error(`[uploadAttachment] POST request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[uploadAttachment] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw error;
    }
}

// --- Metadata and Schema Operations ---

export async function getListTables() {
    console.log(`[getListTables] Called for base: ${NocoDbBaseId}`);
    const requestUrl = `/api/v2/meta/bases/${NocoDbBaseId}/tables`;
    console.log(`[getListTables] Requesting GET: ${nocodbClient.defaults.baseURL}${requestUrl}`);
    try {
        const response = await nocodbClient.get(requestUrl);
        const tables = response.data.list || [];
        console.log(`[getListTables] GET response status: ${response.status}, Found ${tables.length} tables.`);
        return tables.map((t: any) => t.title); // Return only titles as per original logic
    } catch (error: any) {
        console.error(`[getListTables] GET request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[getListTables] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw new Error(`Error getting list of tables: ${error.message}`);
    }
}

export async function getTableMetadata(tableName: string) {
    console.log(`[getTableMetadata] Called for table: ${tableName}`);
    const tableId = await getTableId(tableName);
    const requestUrl = `/api/v2/meta/tables/${tableId}`;
    console.log(`[getTableMetadata] Requesting GET: ${nocodbClient.defaults.baseURL}${requestUrl}`);
    try {
        const response = await nocodbClient.get(requestUrl);
        console.log(`[getTableMetadata] GET response status: ${response.status}`);
        return response.data;
    } catch (error: any) {
        console.error(`[getTableMetadata] GET request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[getTableMetadata] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw new Error(`Error getting table metadata: ${error.message}`);
    }
}

// Define options specific to LinkToAnotherRecord
interface LinkColumnOptions {
    parentId: string; // ID of the related table
    childId: string; // ID of the current table (where the column is added)
    relationType: 'hm' | 'bt' | 'mm'; // NocoDB relation types: HasMany, BelongsTo, ManyToMany
}

export async function alterTableAddColumn(
    tableName: string,
    columnName: string,
    columnType: string,
    options?: LinkColumnOptions // Optional parameters for link types
) {
    console.log(`[alterTableAddColumn] Called for table: ${tableName}, columnName: ${columnName}, columnType: ${columnType}, options: ${JSON.stringify(options)}`);
    const tableId = await getTableId(tableName); // This is the childId for links
    const requestUrl = `/api/v2/meta/tables/${tableId}/columns`;

    let payload: any;

    if (columnType === 'LinkToAnotherRecord') {
        if (!options) {
            throw new Error("Missing required options (parentId, relationType) for LinkToAnotherRecord column type.");
        }
        // Construct payload specific to LinkToAnotherRecord
        // Assuming NocoDB API field names based on common patterns and the error message
        payload = {
            title: columnName,
            uidt: columnType,
            fk_related_model_id: options.parentId, // ID of the table being linked TO
            // childId is implicitly the tableId where the column is created
            // fk_child_column_id, fk_parent_column_id might be handled by NocoDB or needed for specific cases (null for now)
            fk_child_column_id: null,
            fk_parent_column_id: null,
            // ManyToMany specific fields (null if not 'mm')
            fk_mm_model_id: options.relationType === 'mm' ? options.parentId : null, // Needs confirmation if parentId is correct here for MM
            fk_mm_child_column_id: null,
            fk_mm_parent_column_id: null,
            type: options.relationType // Relation type ('hm', 'bt', 'mm')
        };
        console.log(`[alterTableAddColumn] LinkToAnotherRecord payload constructed.`);
    } else {
        // Default payload for other column types
        payload = { title: columnName, uidt: columnType };
        console.log(`[alterTableAddColumn] Standard payload constructed.`);
    }

    console.log(`[alterTableAddColumn] Requesting POST: ${nocodbClient.defaults.baseURL}${requestUrl} with data: ${JSON.stringify(payload)}`);
    try {
        const response = await nocodbClient.post(requestUrl, payload);
        console.log(`[alterTableAddColumn] POST response status: ${response.status}`);
        return response.data;
    } catch (error: any) {
        console.error(`[alterTableAddColumn] POST request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[alterTableAddColumn] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw new Error(`Error adding column: ${error.message}`);
    }
}

export async function alterTableRemoveColumn(columnId: string) {
    console.log(`[alterTableRemoveColumn] Called for columnId: ${columnId}`);
    const requestUrl = `/api/v2/meta/columns/${columnId}`;
    console.log(`[alterTableRemoveColumn] Requesting DELETE: ${nocodbClient.defaults.baseURL}${requestUrl}`);
    try {
        const response = await nocodbClient.delete(requestUrl);
        console.log(`[alterTableRemoveColumn] DELETE response status: ${response.status}`);
        return response.data;
    } catch (error: any) {
        console.error(`[alterTableRemoveColumn] DELETE request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[alterTableRemoveColumn] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw new Error(`Error removing column: ${error.message}`);
    }
}

// Define types for createTable data structure
type ColumnType = "SingleLineText" | "Number" | "Checkbox" | "DateTime" | "ID" | string; // Allow string for flexibility
type TableColumnType = {
    title: string;
    uidt: ColumnType;
}

export async function createTable(tableName: string, columnsData: TableColumnType[]) {
    console.log(`[createTable] Called for tableName: ${tableName} with columns: ${JSON.stringify(columnsData)}`);
    // Ensure 'Id' column exists if not provided
    const hasId = columnsData.some(col => col.title.toLowerCase() === "id"); // Case-insensitive check
    if (!hasId) {
        columnsData.unshift({ title: "Id", uidt: "ID" });
        console.log("[createTable] Auto-added 'Id' column (type: ID).");
    }

    const requestUrl = `/api/v2/meta/bases/${NocoDbBaseId}/tables`;
    const payload = {
        title: tableName,
        columns: columnsData.map(col => ({ title: col.title, uidt: col.uidt })),
    };
    console.log(`[createTable] Requesting POST: ${nocodbClient.defaults.baseURL}${requestUrl} with data: ${JSON.stringify(payload)}`);

    try {
        const response = await nocodbClient.post(requestUrl, payload);
        console.log(`[createTable] POST response status: ${response.status}`);
        return response.data;
    } catch (error: any) {
        console.error(`[createTable] POST request failed: ${error.message}`);
        if (axios.isAxiosError(error)) {
            console.error(`[createTable] Status: ${error.response?.status}, Data: ${JSON.stringify(error.response?.data)}`);
        }
        throw new Error(`Error creating table: ${error.message}`);
    }
}
