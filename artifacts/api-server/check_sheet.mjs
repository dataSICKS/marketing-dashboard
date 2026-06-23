import { ReplitConnectors } from "@replit/connectors-sdk";

const connectors = new ReplitConnectors();
const spreadsheetId = "1zITxm8hxMkjNYJb7CKqY1B7JzQWvv20N8afMBkZWVbU";

// calcシートの最初の5行を取得
const response = await connectors.proxy("google-sheet", `/v4/spreadsheets/${spreadsheetId}/values/calc!A1:L5`, {
  method: "GET",
});
const data = await response.json();
console.log("calc sheet (first 5 rows):", JSON.stringify(data.values, null, 2));
