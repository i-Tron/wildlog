#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createINaturalistAdapter, createBirdReportAdapter, createCloudGuanAdapter,
  createSocialLead, dedupeRecords, fetchJsonWithRetry, freshnessMinutes,
  fuzzSensitivePoint, validateUnifiedRecords, UNIFIED_FIELDS
} from './sources/adapters.mjs';

const root = process.cwd();
const fixture = (name) => JSON.parse(fs.readFileSync(path.join(root, 'tests/fixtures/sources', name), 'utf8'));
const okResponse = (json) => ({ok: true, status: 200, headers: {get: () => null}, json: async () => json});
const fakeFetch = (routes) => async (url) => {
  const key = String(url);
  const route = routes.find((item) => key.includes(item.match));
  if (!route) throw new Error(`unexpected URL: ${key}`);
  return typeof route.response === 'function' ? route.response(url) : okResponse(route.response);
};
const checks = [];
const check = (name, fn) => { fn(); checks.push(name); };

const inatPayload = fixture('inaturalist-response.json');
const inat = createINaturalistAdapter({fetchImpl: fakeFetch([{match: 'api.inaturalist.org', response: inatPayload}]), now: () => new Date('2026-10-15T00:00:00Z'), sleepFn: async () => {}});
const inatResult = await inat.collect({lat: 31.23, lng: 121.47, from: '2026-10-01', to: '2026-10-15', qualityGrades: ['research'], perPage: 2});
check('inat:filters-and-url', () => { assert.match(inatResult.requestUrl, /quality_grade=research/); assert.match(inatResult.requestUrl, /d1=2026-10-01/); assert.equal(inatResult.records.length, 2); });
check('inat:unified-fields', () => { assert.deepEqual(Object.keys(inatResult.records[0]).filter((key) => UNIFIED_FIELDS.includes(key)), UNIFIED_FIELDS); });
check('inat:obscured-fuzzy', () => { assert.match(inatResult.records[1].precision, /模糊化/); assert.notEqual(inatResult.records[1].latitude, 31.2); });
check('freshness', () => assert.equal(freshnessMinutes('2026-10-14T00:00:00Z', new Date('2026-10-15T00:00:00Z')), 1440));
check('dedupe', () => { const records = dedupeRecords([...inatResult.records, inatResult.records[0]]); assert.equal(records.length, 2); });
check('sensitive-grid', () => { const point = fuzzSensitivePoint(31.23456, 121.47654, {sensitive: true}); assert.equal(point.latitude, 31.25); assert.equal(point.longitude, 121.5); });
check('birdreport:contract-blocked', async () => {});
const birdBlocked = await createBirdReportAdapter({endpoint: '', fetchImpl: fakeFetch([])}).smoke();
check('birdreport:not-configured', () => { assert.equal(birdBlocked.status, 'blocked'); assert.equal(birdBlocked.reason, 'not_configured'); assert.ok(birdBlocked.contract.query.includes('region')); });
const bird = await createBirdReportAdapter({endpoint: 'https://authorized.example/birdreport', fetchImpl: fakeFetch([{match: 'authorized.example', response: fixture('birdreport-response.json')}]), now: () => new Date('2026-10-15T00:00:00Z'), sleepFn: async () => {}}).smoke({region: '上海'});
check('birdreport:fixture-normalize', () => { assert.equal(bird.status, 'ok'); assert.equal(bird.records[0].sourceId, 'br-1'); assert.match(bird.records[0].precision, /模糊化/); });
const cloudFixture = fixture('cloudguan-responses.json');
const cloud = await createCloudGuanAdapter({baseUrl: 'https://authorized.example/cloudguan', fetchImpl: fakeFetch([{match: 'authorized.example/cloudguan/getSoundRecord', response: cloudFixture.getSoundRecord}, {match: 'authorized.example/cloudguan/getHongwaiRecord', response: cloudFixture.getHongwaiRecord}, {match: 'authorized.example/cloudguan/speciesList', response: cloudFixture.speciesList}]), now: () => new Date('2026-10-15T00:00:00Z'), sleepFn: async () => {}}).smoke();
check('cloudguan:methods-and-fields', () => { assert.equal(cloud.methods.length, 3); assert.equal(cloud.methods.every((item) => item.status === 'ok'), true); assert.equal(cloud.methods[0].records[0].species, '白鹭'); });
const cloudBlocked = await createCloudGuanAdapter({baseUrl: '', fetchImpl: fakeFetch([])}).smoke();
check('cloudguan:not-configured', () => { assert.equal(cloudBlocked.reason, 'not_configured'); assert.equal(cloudBlocked.methods.every((item) => item.status === 'blocked'), true); });
let attempts = 0; const retry = await fetchJsonWithRetry('https://retry.example', {attempts: 3, sleepFn: async () => {}, fetchImpl: async () => { attempts += 1; if (attempts === 1) return {ok: false, status: 429, headers: {get: () => '0'}, json: async () => ({})}; return okResponse({ok: true}); }});
check('retry-backoff', () => { assert.equal(attempts, 2); assert.equal(retry.json.ok, true); });
const lead = createSocialLead({platform: '抖音', evidenceUrl: 'https://www.douyin.com/video/example', locationHint: '上海（区域级）'});
check('social-manual-queue', () => { assert.equal(lead.status, 'queued'); assert.equal(lead.reviewState, 'manual-review'); });
const validation = validateUnifiedRecords(inatResult.records);
check('validation', () => { assert.equal(validation.ok, true); assert.equal(validation.failures.length, 0); });
console.log(JSON.stringify({passed: checks.length, checks, sourceStatuses: {inaturalist: inatResult.status, birdreport: {fixture: bird.status, live: birdBlocked.status}, cloudguan: {fixture: cloud.status, live: cloudBlocked.status}, social: lead.status}}, null, 2));
