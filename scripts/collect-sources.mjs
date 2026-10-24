#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import {
  createINaturalistAdapter, createBirdReportAdapter, createCloudGuanAdapter,
  dedupeRecords, validateUnifiedRecords
} from './sources/adapters.mjs';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag, fallback = undefined) => { const index = args.indexOf(flag); return index >= 0 ? args[index + 1] ?? fallback : fallback; };
const root = process.cwd();
const now = new Date();
const from = value('--from', new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
const to = value('--to', now.toISOString().slice(0, 10));
const fixtureMode = has('--fixture');
const only = value('--source', 'all');
const output = value('--out');

const response = (json, status = 200) => ({ok: status >= 200 && status < 300, status, headers: {get: () => null}, json: async () => json});
const fixtureFetch = async (url) => {
  const text = String(url);
  if (text.includes('inaturalist')) return response(JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/sources/inaturalist-response.json'), 'utf8')));
  if (text.includes('birdreport')) return response(JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/sources/birdreport-response.json'), 'utf8')));
  if (text.includes('cloudguan')) {
    const payload = JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/sources/cloudguan-responses.json'), 'utf8'));
    const method = text.split('/').pop().split('?')[0];
    return response(payload[method] || {});
  }
  throw new Error(`No fixture route for ${text}`);
};
const fetchImpl = fixtureMode ? fixtureFetch : globalThis.fetch;
const sleepFn = fixtureMode ? async () => {} : undefined;

async function runInaturalist() {
  try {
    const result = await createINaturalistAdapter({fetchImpl, sleepFn}).collect({from, to, radiusKm: 80, sensitive: true});
    return result;
  } catch (error) {
    return {source: 'inaturalist', status: 'blocked', reason: 'live_request_failed', error: error.message, records: []};
  }
}
async function runBirdReport() {
  return createBirdReportAdapter({endpoint: fixtureMode ? 'https://fixture.local/birdreport' : undefined, fetchImpl, sleepFn}).smoke({region: '上海', from, to});
}
async function runCloudGuan() {
  return createCloudGuanAdapter({baseUrl: fixtureMode ? 'https://fixture.local/cloudguan' : undefined, fetchImpl, sleepFn}).smoke({from, to});
}

const results = [];
if (only === 'all' || only === 'inaturalist') results.push(await runInaturalist());
if (only === 'all' || only === 'birdreport') results.push(await runBirdReport());
if (only === 'all' || only === 'cloudguan') results.push(await runCloudGuan());
const records = dedupeRecords(results.flatMap((item) => item.records || item.methods?.flatMap((method) => method.records || []) || []));
const validation = validateUnifiedRecords(records);
const report = {
  mode: fixtureMode ? 'fixture' : 'live-smoke', from, to,
  sources: results.map((item) => ({source: item.source, status: item.status, reason: item.reason || null, rawCount: item.rawCount ?? item.records?.length ?? null, methods: item.methods?.map((method) => ({method: method.method, status: method.status, reason: method.reason || null})) || undefined})),
  records: records.length, validation
};
console.log(JSON.stringify(report, null, 2));
if (output) await fs.writeFile(path.resolve(root, output), JSON.stringify({fetchedAt: now.toISOString(), ...report, records}, null, 2) + '\n');
