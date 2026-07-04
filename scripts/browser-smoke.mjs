#!/usr/bin/env node
// Browser smoke test: logs in with the seeded owner and verifies the
// virtualized TruthGrids and key DoD states render after hydration.
// Uses the locally installed Chrome via playwright-core.
import { chromium } from "playwright-core";

const BASE = process.env.BASE_URL || "http://localhost:4780";

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const results = [];
const check = (name, ok) => {
  results.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
};

try {
  // Login
  await page.goto(`${BASE}/login`);
  await page.fill('input[type="email"]', "nick@legenex.com");
  await page.fill('input[type="password"]', "dashflo2026");
  await page.click('button[type="submit"]');
  await page.waitForURL(`${BASE}/`, { timeout: 20000 });
  check("login redirects to overview", true);

  // Overview: StatPairs + panels
  await page.waitForSelector("text=Booked revenue vs verified income", { timeout: 15000 });
  const agRisk = await page.locator("text=AG1 Walker").first().isVisible();
  check("overview shows AG1 Walker in risk panel", agRisk);
  check("overview action queue rendered", await page.locator("text=at risk").first().isVisible());

  // Buyers grid: virtualized rows render with DoD amounts
  await page.goto(`${BASE}/distribution/buyers`);
  await page.waitForSelector("text=AG1 Walker", { timeout: 15000 });
  const bodyText = await page.textContent("body");
  check("buyers grid renders rows", bodyText.includes("AG2 Quintessa") && bodyText.includes("Overflow Network"));
  check("buyers shows short-paid chip", bodyText.includes("Short Paid"));
  check("buyers shows No Payment Source", bodyText.includes("No Payment Source"));

  // Campaigns: Depo false profit + Cut
  await page.goto(`${BASE}/distribution/campaigns`);
  await page.waitForSelector("text=Mass Tort Depo-Provera", { timeout: 15000 });
  const campText = await page.textContent("body");
  check("campaigns shows False Profit", campText.includes("False Profit"));
  check("campaigns shows Cut decision", campText.includes("Cut"));

  // Leads grid renders and drawer opens
  await page.goto(`${BASE}/leads`);
  await page.waitForSelector("text=Leads", { timeout: 15000 });
  await page.waitForTimeout(1200);
  const leadRows = await page.locator('[role="row"]').count();
  check(`leads grid virtualized rows render (${leadRows})`, leadRows > 5);
  if (leadRows > 0) {
    await page.locator('[role="row"]').first().click();
    await page.waitForTimeout(1000);
    check("lead drawer opens with tabs", await page.locator("text=Financial Truth").first().isVisible());
  }

  // Reconciliation match queue
  await page.goto(`${BASE}/reconciliation?tab=queue`);
  await page.waitForTimeout(1500);
  const queueText = await page.textContent("body");
  check("match queue renders unmatched payments", queueText.includes("unmatched payments"));

  // AI chat renders starters
  await page.goto(`${BASE}/ai/chat`);
  await page.waitForSelector("text=Am I owed money right now and by whom", { timeout: 15000 });
  check("ai chat starters render", true);

  // Reports rebuild: index + a report page with hydrated cards and state table
  await page.goto(`${BASE}/reports`);
  await page.waitForSelector("text=Performance Overview", { timeout: 15000 });
  check("reports index lists default pages", await page.locator("text=Lead Quality").first().isVisible());
  await page.goto(`${BASE}/reports/view/performance-overview`);
  await page.waitForSelector("text=Net Revenue", { timeout: 15000 });
  await page.waitForTimeout(1500);
  const reportText = await page.textContent("body");
  check("report page renders money cards", reportText.includes("Net Profit"));
  check("report page renders state table", reportText.includes("State Performance"));

  // Portal preview + settings hubs
  await page.goto(`${BASE}/portal`);
  await page.waitForSelector("text=Portal", { timeout: 15000 });
  check("portal renders published partner pages", (await page.textContent("body")).includes("AG1 Walker"));
  await page.goto(`${BASE}/settings/ai-models`);
  await page.waitForSelector("text=Anthropic Claude", { timeout: 15000 });
  check("ai models hub renders providers", (await page.textContent("body")).includes("Google Gemini"));
  await page.goto(`${BASE}/settings/integrations`);
  await page.waitForSelector("text=Facebook Lead Forms", { timeout: 15000 });
  await page.waitForTimeout(1200);
  check("integrations lead forms table renders", (await page.textContent("body")).includes("Depo-Provera Screener"));

  // Docs
  await page.goto(`${BASE}/docs/api-reference`);
  await page.waitForSelector("text=API Reference", { timeout: 15000 });
  check("docs api reference renders", true);
} catch (err) {
  console.error("SMOKE ERROR:", err.message);
  results.push(["no exception", false]);
}

await browser.close();
const failed = results.filter(([, ok]) => !ok);
console.log(`\n${results.length - failed.length}/${results.length} browser checks passed`);
process.exit(failed.length > 0 ? 1 : 0);
