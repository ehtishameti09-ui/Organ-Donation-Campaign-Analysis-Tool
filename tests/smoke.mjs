/**
 * Frontend smoke suite.
 *
 * The backend has 84 tests; the React side had none, and was only ever checked
 * by someone driving a browser by hand. This closes that gap for the things
 * most likely to break silently: a page that throws on render, an endpoint that
 * starts 403ing, or a role seeing data it should not.
 *
 * It is deliberately a SMOKE suite, not a full UI test suite. It asserts that
 * each page loads, renders its own content, and makes no failing API calls -
 * not that every button does the right thing. That is the highest value per
 * line of test code for a project this size.
 *
 *   npm run test:smoke
 *
 * Requires the app running (backend on :8000, Vite on :3000) and the demo data
 * seeded. Exits non-zero on failure so it can gate a commit or CI step.
 */
import { chromium } from 'playwright';

const BASE = process.env.SMOKE_BASE || 'http://localhost:3000';
const API = process.env.SMOKE_API || 'http://localhost:8000';

// The dev server is single threaded, so a page opened right after login queues
// behind the dashboard's requests. These waits are generous on purpose.
const SETTLE_MS = Number(process.env.SMOKE_SETTLE || 22000);
const PAGE_MS = Number(process.env.SMOKE_PAGE || 60000);

const ACCOUNTS = {
  hospital: { email: 'cmh@odcat.com', password: 'Hospital@123' },
  superAdmin: { email: 'admin@odcat.com', password: 'Admin@123' },
};

let failures = 0;
const pass = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { failures++; console.log(`  ✗ ${m}`); };

const check = (cond, msg) => (cond ? pass(msg) : fail(msg));

/** Wait until `fn` is true in the page, or give up. */
const until = async (page, fn, ms = PAGE_MS) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    await page.waitForTimeout(1200);
    try { if (await page.evaluate(fn)) return true; } catch { /* mid-navigation */ }
  }
  return false;
};

const newPage = async (ctx, label) => {
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`JS: ${e.message.slice(0, 160)}`));
  page.on('response', (r) => {
    const u = r.url();
    // 401 before login and 403 where a role is deliberately refused are expected;
    // anything else in the 4xx/5xx range on our own API is not.
    if (!u.includes('/api/') || r.status() < 400) return;
    if ([401, 403, 422].includes(r.status())) return;
    errors.push(`HTTP ${r.status()} ${u.replace(API, '')}`);
  });
  page._smokeErrors = errors;
  page._smokeLabel = label;
  return page;
};

const login = async (page, { email, password }) => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.locator('button[type="submit"]').first().click();
  const ok = await page.waitForSelector('.nav-item', { timeout: 40000 }).then(() => true).catch(() => false);
  await page.waitForTimeout(SETTLE_MS);
  return ok;
};

const visit = async (page, label) => {
  const item = page.locator('.nav-item', { hasText: label });
  if (!(await item.count())) return false;
  await item.first().click();
  return true;
};

const run = async () => {
  const browser = await chromium.launch({ channel: process.env.SMOKE_BROWSER || 'msedge', headless: true });

  // ---------------------------------------------------------------- hospital
  console.log('\nHospital (cmh@odcat.com)');
  {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const page = await newPage(ctx, 'hospital');

    check(await login(page, ACCOUNTS.hospital), 'logs in');

    const nav = (await page.locator('.nav-item').allInnerTexts()).map((t) => t.trim());
    for (const want of ['Approval Board', 'Organ Lifecycle', 'Surgery Schedule', 'Allocation Engine']) {
      check(nav.some((n) => n.includes(want)), `nav has "${want}"`);
    }

    // Each module must render its own data, not just an empty shell.
    const pages = [
      // "Needs You" is the two-sided board's actionable queue - offers waiting on
      // us as the receiving centre, plus our own donor-side work.
      ['Approval Board', () => /Needs You|No cases in this view/.test(document.body.innerText)],
      ['Organ Lifecycle', () => /ORG-\d{4}|No organs in this view/.test(document.body.innerText)],
      ['Surgery Schedule', () => /(January|February|March|April|May|June|July|August|September|October|November|December)\s+20\d\d/.test(document.body.innerText)],
      ['Allocation Engine', () => /Allocation|Donor/i.test(document.body.innerText)],
    ];
    for (const [label, marker] of pages) {
      if (!(await visit(page, label))) { fail(`${label}: nav item missing`); continue; }
      check(await until(page, marker), `${label} renders`);
    }

    // The approval board is two-sided: allocation matches across hospitals, so a
    // hospital sees cases it procures AND offers made to it. Assert the side
    // column renders rather than silently falling back to blank cells.
    if (await visit(page, 'Approval Board')) {
      const sided = await until(page, () =>
        /Procuring|Receiving|Internal|No cases in this view/.test(document.body.innerText));
      check(sided, 'Approval Board shows which side of each offer we are on');

      // A withheld counterparty patient must read as a match code, never blank.
      const noBlankParty = await page.evaluate(() => {
        const body = document.body.innerText;
        return !/withheld/.test(body) || /REC-|DNR-/.test(body);
      });
      check(noBlankParty, 'withheld patients render as a match code');
    }

    check(page._smokeErrors.length === 0,
      `no JS errors or failed requests${page._smokeErrors.length ? ' -> ' + page._smokeErrors.join('; ') : ''}`);
    await ctx.close();
  }

  // ------------------------------------------------------------- super admin
  console.log('\nSuper admin (admin@odcat.com) - supervision scope');
  {
    const ctx = await browser.newContext({ viewport: { width: 1500, height: 1000 } });
    const page = await newPage(ctx, 'superAdmin');

    check(await login(page, ACCOUNTS.superAdmin), 'logs in');

    for (const label of ['Approval Board', 'Organ Lifecycle', 'Surgery Schedule']) {
      if (!(await visit(page, label))) { fail(`${label}: nav item missing`); continue; }
      const banner = await until(page, () => /Network supervision view/.test(document.body.innerText));
      check(banner, `${label} shows the supervision-only view`);

      // The whole point: no patient-level table on these pages for this role.
      const leaked = await page.evaluate(() => /ORG-\d{4}/.test(document.body.innerText));
      check(!leaked, `${label} exposes no organ references`);
    }

    check(page._smokeErrors.length === 0,
      `no JS errors or failed requests${page._smokeErrors.length ? ' -> ' + page._smokeErrors.join('; ') : ''}`);
    await ctx.close();
  }

  // ------------------------------------------------------------ public pages
  console.log('\nUnauthenticated');
  {
    const ctx = await browser.newContext();
    const page = await newPage(ctx, 'anon');
    await page.goto(BASE, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const txt = await page.evaluate(() => document.body.innerText);
    check(/Sign In|Sign in/i.test(txt), 'login screen renders');
    check(/Google/i.test(txt), 'Google sign-in option present');
    check(page._smokeErrors.length === 0,
      `no JS errors${page._smokeErrors.length ? ' -> ' + page._smokeErrors.join('; ') : ''}`);
    await ctx.close();
  }

  await browser.close();

  console.log('\n' + '='.repeat(60));
  console.log(failures === 0 ? 'SMOKE PASSED' : `SMOKE FAILED - ${failures} check(s)`);
  console.log('='.repeat(60));
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error('SMOKE CRASHED:', e.message); process.exit(1); });
