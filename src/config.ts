import axios, { AxiosInstance } from "axios";

// --- Environment Variable Loading & Validation ---
let { NOCODB_URL, NOCODB_BASE_ID, NOCODB_API_TOKEN } = process.env;

if (!NOCODB_URL || !NOCODB_BASE_ID || !NOCODB_API_TOKEN) {
    // Check from npx param input as fallback
    NOCODB_URL = process.argv[2] || NOCODB_URL;
    NOCODB_BASE_ID = process.argv[3] || NOCODB_BASE_ID;
    NOCODB_API_TOKEN = process.argv[4] || NOCODB_API_TOKEN;

    if (!NOCODB_URL || !NOCODB_BASE_ID || !NOCODB_API_TOKEN) {
        console.error("Error: Missing required NocoDB configuration.");
        console.error("Please provide NOCODB_URL, NOCODB_BASE_ID, and NOCODB_API_TOKEN via environment variables or command-line arguments.");
        process.exit(1); // Exit if configuration is missing
    }
}

// Ensure URL doesn't have a trailing slash for consistency
const cleanNocoDbUrl = NOCODB_URL.replace(/\/$/, "");

// --- NocoDB Axios Client Initialization ---
export const nocodbClient: AxiosInstance = axios.create({
    baseURL: cleanNocoDbUrl,
    headers: {
        "xc-token": NOCODB_API_TOKEN,
        "Content-Type": "application/json",
    },
    timeout: 30000, // 30 seconds timeout
});

// --- Export Configuration Values ---
export const NocoDbUrl = cleanNocoDbUrl;
export const NocoDbBaseId = NOCODB_BASE_ID;
export const NocoDbApiToken = NOCODB_API_TOKEN; // Though used internally by client, might be useful elsewhere

// --- Filter Rules Constant ---
// (Keeping this here as it's somewhat configuration-like, related to API usage)
export const filterRules =
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
`;

console.log(`[Config] NocoDB URL: ${NocoDbUrl}`);
console.log(`[Config] NocoDB Base ID: ${NocoDbBaseId}`);
// Avoid logging the token itself for security
console.log(`[Config] NocoDB API Token: ${NocoDbApiToken ? 'Loaded' : 'Missing!'}`);
