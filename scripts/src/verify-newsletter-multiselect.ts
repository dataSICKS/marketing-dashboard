type NewsletterItem = {
  label: string;
  deliveryCount: number;
};

type NewsletterResponse = {
  items: NewsletterItem[];
  summary: {
    deliveryCount: number;
    prevDeliveryCount: number | null;
  };
  availableScenarios?: string[];
  scenarioGroups?: Array<{
    scenarioName: string;
    summary: { deliveryCount: number };
  }>;
};

const API_BASE = process.env.NEWSLETTER_API_BASE ?? "http://localhost:80/api/newsletter";

async function getData(params: Record<string, string>): Promise<NewsletterResponse> {
  const url = new URL(`${API_BASE}/data`);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} failed with ${response.status}`);
  }
  return response.json() as Promise<NewsletterResponse>;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function normalizeDateLabel(label: string) {
  return label.replace(/\//g, "-");
}

function rangeTotal(items: NewsletterItem[], from: string, to: string) {
  return sum(
    items
      .filter((item) => {
        const label = normalizeDateLabel(item.label);
        return label >= from && label <= to;
      })
      .map((item) => item.deliveryCount),
  );
}

async function main() {
  const all = await getData({ groupBy: "day" });
  const scenarios = all.availableScenarios?.slice(0, 2) ?? [];
  assert(scenarios.length === 2, "Expected at least two scenarios");

  const scenarioTotals = await Promise.all(
    scenarios.map((scenarioName) =>
      getData({ groupBy: "day", scenarioName }).then((data) => data.summary.deliveryCount),
    ),
  );
  const multiScenario = await getData({
    groupBy: "day",
    scenarioName: scenarios.join("|"),
  });
  assert(
    multiScenario.summary.deliveryCount === sum(scenarioTotals),
    `Scenario OR mismatch: expected ${sum(scenarioTotals)}, got ${multiScenario.summary.deliveryCount}`,
  );
  assert(
    multiScenario.scenarioGroups?.map((group) => group.scenarioName).join("|") === scenarios.join("|"),
    "Scenario groups did not preserve the selected scenarios",
  );

  const scenarioTemplates = await getData({
    groupBy: "template",
    scenarioName: scenarios[0],
  });
  const templates = scenarioTemplates.items.slice(0, 2).map((item) => item.label);
  assert(templates.length === 2, "Expected at least two templates for the selected scenario");

  const templateTotals = await Promise.all(
    templates.map((templateName) =>
      getData({ groupBy: "day", templateName }).then((data) => data.summary.deliveryCount),
    ),
  );
  const multiTemplate = await getData({
    groupBy: "day",
    templateName: templates.join("|"),
  });
  assert(
    multiTemplate.summary.deliveryCount === sum(templateTotals),
    `Template OR mismatch: expected ${sum(templateTotals)}, got ${multiTemplate.summary.deliveryCount}`,
  );

  const individualCombinationTotals = await Promise.all(
    scenarios.flatMap((scenarioName) =>
      templates.map((templateName) =>
        getData({ groupBy: "day", scenarioName, templateName }).then(
          (data) => data.summary.deliveryCount,
        ),
      ),
    ),
  );
  const combined = await getData({
    groupBy: "day",
    scenarioName: scenarios.join("|"),
    templateName: templates.join("|"),
  });
  assert(
    combined.summary.deliveryCount === sum(individualCombinationTotals),
    `Scenario/template AND mismatch: expected ${sum(individualCombinationTotals)}, got ${combined.summary.deliveryCount}`,
  );

  const datedItems = all.items
    .map((item) => normalizeDateLabel(item.label))
    .filter((label) => /^\d{4}-\d{2}-\d{2}$/.test(label))
    .sort();
  assert(datedItems.length > 0, "Expected dated newsletter items");

  const latestDate = datedItems[datedItems.length - 1];
  const currentTo = latestDate;
  const currentFrom = addDays(currentTo, -30);
  const previousTo = addDays(currentFrom, -1);
  const previousFrom = addDays(previousTo, -30);
  const expectedCurrent = rangeTotal(all.items, currentFrom, currentTo);
  const expectedPrevious = rangeTotal(all.items, previousFrom, previousTo);
  assert(expectedCurrent > 0 && expectedPrevious > 0, "Expected data in both comparison periods");

  const comparison = await getData({
    groupBy: "day",
    dateFrom: currentFrom,
    dateTo: currentTo,
    compareFrom: previousFrom,
    compareTo: previousTo,
  });
  assert(
    comparison.summary.deliveryCount === expectedCurrent,
    `Current comparison total mismatch: expected ${expectedCurrent}, got ${comparison.summary.deliveryCount}`,
  );
  assert(
    comparison.summary.prevDeliveryCount === expectedPrevious,
    `Previous comparison total mismatch: expected ${expectedPrevious}, got ${comparison.summary.prevDeliveryCount}`,
  );

  console.log(
    JSON.stringify(
      {
        scenarios,
        templates,
        scenarioOrDeliveryCount: multiScenario.summary.deliveryCount,
        templateOrDeliveryCount: multiTemplate.summary.deliveryCount,
        andDeliveryCount: combined.summary.deliveryCount,
        comparison: {
          currentFrom,
          currentTo,
          previousFrom,
          previousTo,
          currentDeliveryCount: comparison.summary.deliveryCount,
          previousDeliveryCount: comparison.summary.prevDeliveryCount,
        },
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});