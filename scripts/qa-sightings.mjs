#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const file = path.resolve(root, 'content/sightings.json');
const htmlFile = path.resolve(root, 'index.html');
const payload = JSON.parse(fs.readFileSync(file, 'utf8'));
const records = payload.records;
const failures = [];
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({name, ok, detail});
  if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`);
};
const required = ['id', 'species', 'observed_at', 'published_at', 'source', 'source_url', 'source_title', 'location', 'map_point', 'evidence', 'route'];
check('schema:records-array', Array.isArray(records) && records.length >= 5);
check('schema:id-unique', new Set(records.map(item => item.id)).size === records.length);
for (const [index, item] of records.entries()) {
  for (const field of required) check(`schema:${index}:${field}`, item[field] !== undefined && item[field] !== null);
  check(`source:${index}:https`, /^https:\/\//.test(item.source_url));
  check(`location:${index}:precision`, Boolean(item.location?.precision));
  check(`location:${index}:coordinate-system`, Boolean(item.location?.coordinate_system));
  check(`safety:${index}:no-exact-coordinates`, item.location?.coordinates === null);
  check(`safety:${index}:coarse-granularity`, /区域级/.test(item.location?.granularity || ''));
  check(`evidence:${index}:status`, Boolean(item.evidence?.status));
  check(`evidence:${index}:audit-status`, Boolean(item.evidence?.audit_status));
  check(`route:${index}:destination`, Boolean(item.route?.destination_keyword));
  check(`map:${index}:normalized-point`, Number.isFinite(item.map_point?.x) && Number.isFinite(item.map_point?.y) && item.map_point.x >= 0 && item.map_point.x <= 100 && item.map_point.y >= 0 && item.map_point.y <= 100);
}
check('editorial:demo-label', payload.data_status.includes('演示') && payload.data_status.includes('核验'));
check('editorial:coordinate-policy', /不保存或公开.*精确坐标/.test(payload.coordinate_policy));
const html = fs.readFileSync(htmlFile, 'utf8');
const embeddedMatch = html.match(/<script type="application\/json" id="sightings-data">([\s\S]*?)<\/script>/);
let embedded;
try { embedded = JSON.parse(embeddedMatch?.[1] || ''); } catch {}
check('html:embedded-data-present', Boolean(embeddedMatch));
check('html:embedded-data-equals-json', JSON.stringify(embedded) === JSON.stringify(payload));
const report = {
  file: path.relative(root, file),
  records: records.length,
  passed_checks: checks.filter(item => item.ok).length,
  total_checks: checks.length,
  failed_checks: failures,
  next_action: failures.length ? '修复结构化记录后重跑' : '保持演示/待核验状态，接入真实来源后再人工复核'
};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
