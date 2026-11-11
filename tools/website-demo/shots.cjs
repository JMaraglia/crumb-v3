#!/usr/bin/env node
// tools/website-demo/shots.cjs — retakes the website screenshots from the REAL current app, with the made-up
// demo data in seed.js and "today" fixed to Thu Nov 12, 2026, 9:47 AM. Not part of the app build.
//
//   node tools/website-demo/shots.cjs [outDir] [only1,only2] [--midnight]
//
// Needs esbuild and Playwright (the founder never runs this; Claude does). react-router-dom is swapped for
// mini-router.js and Supabase for a blank stub, so nothing talks to the cloud.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.resolve(__dirname, '../..');
const WORK = '/tmp/website-demo';
const OUT = path.resolve(process.argv[2] || path.join(WORK, 'out'));
const ONLY = (process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3].split(',') : null);
const MIDNIGHT = process.argv.includes('--midnight');
const ESBUILD = process.env.ESBUILD || '/opt/npm-tools/node_modules/esbuild/bin/esbuild';
const PW = process.env.PLAYWRIGHT || 'playwright';
const TODAY = new Date(2026, 10, 12, 9, 47);

fs.mkdirSync(WORK, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(WORK, 'sb.js'), "export const createClient=()=>({auth:{getSession:async()=>({data:{session:null}}),onAuthStateChange:()=>({data:{subscription:{unsubscribe(){}}}})}});\n");
fs.writeFileSync(path.join(WORK, 'seed-entry.js'), `import { websiteDemo } from '${ROOT}/tools/website-demo/seed.js';\nwindow.__seed = websiteDemo();\n`);
fs.writeFileSync(path.join(WORK, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#f2f2f7"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script src="/seed.js"></script><script>(function(){var s=window.__seed;if(!localStorage.getItem('crumb_contacts')){for(var k in s)localStorage.setItem(k,s[k]);}var o=window.__ls||{};for(var j in o)localStorage.setItem(j,o[j]);if(o.__midnight)document.documentElement.setAttribute('data-theme','midnight');${MIDNIGHT ? "var a=JSON.parse(localStorage.getItem('crumb_app_settings')||'{}');a.theme='midnight';localStorage.setItem('crumb_app_settings',JSON.stringify(a));document.documentElement.setAttribute('data-theme','midnight');" : ''}})();</script><script src="/app.js"></script></body></html>`);

const env = '--define:import.meta.env={"VITE_SUPABASE_URL":"","VITE_SUPABASE_PUBLISHABLE_KEY":"","MODE":"production","DEV":false,"PROD":true}';
execFileSync(ESBUILD, [path.join(WORK, 'seed-entry.js'), '--bundle', '--format=iife', `--outfile=${path.join(WORK, 'seed.js')}`, '--log-level=error']);
execFileSync(ESBUILD, [path.join(ROOT, 'src/main.jsx'), '--bundle', '--format=iife', '--jsx=automatic', '--loader:.js=jsx', '--loader:.png=dataurl', '--loader:.svg=dataurl',
  `--alias:react-router-dom=${path.join(ROOT, 'tools/website-demo/mini-router.js')}`, `--alias:@supabase/supabase-js=${path.join(WORK, 'sb.js')}`, env,
  `--outfile=${path.join(WORK, 'app.js')}`, '--log-level=error']);

const server = http.createServer((req, res) => {
  const p = req.url.split('?')[0];
  const file = ['/app.js', '/app.css', '/seed.js'].includes(p) ? path.join(WORK, p) : path.join(WORK, 'index.html');
  res.writeHead(200, { 'Content-Type': p.endsWith('.js') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html' });
  fs.createReadStream(file).pipe(res);
}).listen(0);
const BASE = `http://localhost:${server.address().port}`;

// Each shot: name, path, and optional steps. Taken as an iPhone (390×844, 2x), then saved at the website's sizes.
const toBottom = async (p) => {
  await p.evaluate(() => {
    const els = [document.scrollingElement, ...document.querySelectorAll('*')].filter((e) => e && e.scrollHeight > e.clientHeight + 20 && getComputedStyle(e).overflowY !== 'visible' || e === document.scrollingElement);
    els.forEach((e) => { e.scrollTop = e.scrollHeight; });
    window.scrollTo(0, document.body.scrollHeight);
  });
  await p.waitForTimeout(400);
};
const checkIns = async (p) => {
  await toBottom(p);
  const row = p.getByText('Due For A Check-In', { exact: false }).first();
  if (await row.count()) { await row.click(); await p.waitForTimeout(400); }
  await toBottom(p);
};
const SHOTS = [
  ['f/cust', '/customers/1'],
  ['f/prospect', '/prospects/11'],
  ['f/groups', '/prospects', async (p) => { const g = p.getByText('3 Locations').first(); if (await g.count()) await g.click(); await p.waitForTimeout(300); }],
  ['f/itinerary', '/itinerary'],
  ['f/checkins', '/itinerary', checkIns],
  ['f/wrapup', '/wrap-up'],
  ['f/month', '/calendar', async (p) => { await p.getByText('Month', { exact: true }).click(); await p.waitForTimeout(400); }],
  ['f/day', '/calendar', async (p) => { await p.getByText('Day', { exact: true }).click(); await p.waitForTimeout(400); }],
  ['f/reminders', '/notifications'],
  ['f/notes', '/prospect-notes/11'],
  ['f/allnotes', '/notes'],
  ['f/todo', '/todo'],
  ['f/callsheet-phone', '/customers/1'],
  ['home', '/'],
  // Customization (Nov 11): 5th item = localStorage values set for that shot only.
  ['c/settings', '/settings'],
  ['c/callsheet-off', '/settings/call-sheet', null, null, { crumb_callsheet_settings: '{"show":false,"online":true,"orders":true}' }],
  ['c/home-off', '/', null, null, { crumb_callsheet_settings: '{"show":false,"online":true,"orders":true}' }],
  ['c/appearance', '/settings/appearance', null, null, { crumb_app_settings: '{"theme":"midnight"}', __midnight: '1' }],
  ['c/home-midnight', '/', null, null, { crumb_app_settings: '{"theme":"midnight"}', __midnight: '1' }],
  ['c/labels', '/settings/note-labels'],
  ['c/calsettings', '/calendar', async (p) => { await p.getByLabel(/settings/i).first().click(); await p.waitForTimeout(500); }],
  ['c/home-trim', '/', null, null, { crumb_callsheet_settings: '{"show":false}', crumb_app_settings: '{"todo":false}' }],
  ['c/month-midnight', '/calendar', async (p) => { await p.getByText('Month', { exact: true }).click(); await p.waitForTimeout(400); }, null, { crumb_app_settings: '{"theme":"midnight"}', __midnight: '1' }],
  ['c/stops-midnight', '/itinerary', null, null, { crumb_app_settings: '{"theme":"midnight"}', __midnight: '1' }],
  ['itin', '/itinerary', null, [480, 1038]],
  ['cust', '/customers', async (p) => { await p.getByText('Ashgrove Builders').first().click(); await p.waitForTimeout(400); }, [480, 1038]],
  ['cal', '/calendar', null, [480, 1038]],
  ['stale', '/itinerary', checkIns, [480, 1038]],
];

(async () => {
  const { chromium } = require(PW);
  const browser = await chromium.launch();
  for (const [name, url, steps, size, ls] of SHOTS) {
    if (ONLY && !ONLY.includes(name)) continue;
    const [outW, outH] = size || [600, 1298];
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
    });
    await ctx.addInitScript(() => {
      // Pretend notifications are allowed and Crumb runs from the Home Screen (for the Notifications shot).
      try { Object.defineProperty(window.Notification, 'permission', { get: () => 'granted' }); } catch (e) {}
      try { Object.defineProperty(window.navigator, 'standalone', { get: () => true }); } catch (e) {}
    });
    if (ls) await ctx.addInitScript((o) => { window.__ls = o; }, ls);
    const page = await ctx.newPage();
    page.on('pageerror', (e) => console.log(name, 'ERROR', e.message));
    await page.clock.setFixedTime(TODAY);
    await page.goto(BASE + url);
    await page.waitForTimeout(900);
    if (steps) await steps(page);
    const file = path.join(OUT, `${name}.png`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const raw = file.replace(/\.png$/, '.raw.png');
    await page.screenshot({ path: raw });
    execFileSync('python3', ['-c', `from PIL import Image; im=Image.open('${raw}'); im.resize((${outW}, ${outH}), Image.LANCZOS).convert('RGB').save('${file}')`]);
    fs.unlinkSync(raw);
    console.log('shot', name);
    await ctx.close();
  }
  await browser.close();
  server.close();
})();
