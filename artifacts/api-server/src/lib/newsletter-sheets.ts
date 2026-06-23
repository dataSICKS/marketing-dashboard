import { ReplitConnectors } from "@replit/connectors-sdk";
import type { NewsletterRow } from "./newsletter-types.js";
import { logger } from "./logger.js";

const SPREADSHEET_ID = "1zITxm8hxMkjNYJb7CKqY1B7JzQWvv20N8afMBkZWVbU";
const SHEET_NAME = "calc";
const MAX_ROWS = 4000;

function parseNumber(val: string): number {
  const n = Number(val.replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

export async function fetchCalcSheet(): Promise<NewsletterRow[]> {
  const connectors = new ReplitConnectors();

  const range = `${SHEET_NAME}!A2:L${MAX_ROWS}`;
  const response = await connectors.proxy(
    "google-sheet",
    `/v4/spreadsheets/${SPREADSHEET_ID}/values/${encodeURIComponent(range)}`,
    { method: "GET" }
  );

  const data = await response.json() as { values?: string[][] };

  if (!data.values || data.values.length === 0) {
    logger.info("No data returned from Google Sheets calc sheet");
    return [];
  }

  const rows: NewsletterRow[] = [];

  for (const row of data.values) {
    if (row.length < 9) continue;

    const deliveryYearMonth = row[0] ?? "";
    const deliveryWeek = row[1] ?? "";
    const deliveryDate = row[2] ?? "";
    const scenarioName = row[3] ?? "";
    const segment = row[4] ?? "";
    const deliveryMethod = row[5] ?? "";
    const templateName = row[6] ?? "";
    const subject = row[7] ?? "";
    const deliveryCount = parseNumber(row[8] ?? "0");
    const openCount = parseNumber(row[9] ?? "0");
    const clickCount = parseNumber(row[10] ?? "0");
    const cvCount = parseNumber(row[11] ?? "0");

    if (!deliveryDate || !scenarioName) continue;

    rows.push({
      deliveryYearMonth,
      deliveryWeek,
      deliveryDate,
      scenarioName,
      segment,
      deliveryMethod,
      templateName,
      subject,
      deliveryCount,
      openCount,
      clickCount,
      cvCount,
    });
  }

  logger.info({ rowCount: rows.length }, "Fetched rows from Google Sheets");
  return rows;
}
