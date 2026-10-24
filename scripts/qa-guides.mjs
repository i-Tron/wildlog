#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const articleId = process.argv[2] || 'js-dongtai-tiaozini';
const jsonPath = path.resolve(root, `content/guides/${articleId}.json`);
const htmlPath = path.resolve(root, `content/guides/${articleId}.html`);
const fixturePath = path.resolve(root, `tests/fixtures/${articleId}.json`);
const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const html = fs.readFileSync(htmlPath, 'utf8');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
const failures = [];
const checks = [];
const check = (name, ok, detail = '') => { checks.push({name, ok, detail}); if (!ok) failures.push(`${name}${detail ? `: ${detail}` : ''}`); };

// Layer 1: schema and evidence
for (const field of ['article_id','slug','title','status','last_checked_at','next_review_at','conditions','route','timeline','habitats','targets','safety','sources','qa']) check(`schema:${field}`, data[field] !== undefined && data[field] !== null, 'missing');
check('schema:article-id', data.article_id === fixture.article_id, `${data.article_id} != ${fixture.article_id}`);
check('schema:source-count', data.sources.length >= fixture.min_sources, `${data.sources.length} < ${fixture.min_sources}`);
check('schema:https-sources', data.sources.every(source => /^https:\/\//.test(source.url)), 'a source URL is not HTTPS');
check('evidence:source-id-unique', new Set(data.sources.map(s => s.id)).size === data.sources.length, 'duplicate source id');
const sourceIds = new Set(data.sources.map(s => s.id));
const evidenceRefs = [...data.conditions.flatMap(i => i.source_ids), ...data.route.preflight.flatMap(i => i.evidence_ids), ...data.route.stops.flatMap(i => i.evidence_ids), ...data.habitats.flatMap(i => i.source_ids), ...data.targets.flatMap(i => i.source_ids), ...data.safety.source_ids];
check('evidence:references-resolve', evidenceRefs.every(id => sourceIds.has(id)), 'unresolved source reference');
const conditionComplete = data.conditions.filter(item => item.status && item.source_date && item.retrieved_at && item.valid_until && item.confidence).length / data.conditions.length;
check('evidence:condition-five-tuple>=90%', conditionComplete >= 0.9, `${Math.round(conditionComplete * 100)}%`);
const sourceTypes = new Set(data.sources.flatMap(s => s.evidence_roles || [ /法规|管理/.test(s.type) ? 'management' : /生态|观察|论文|自然教育/.test(s.type) ? 'ecology' : /政府/.test(s.type) ? 'management' : 'other']));
check('evidence:two-source-types', sourceTypes.has('management') && sourceTypes.has('ecology'), [...sourceTypes].join(','));
check('schema:condition-count', data.conditions.length >= fixture.min_condition_count, String(data.conditions.length));
check('evidence:source-metadata', data.sources.every(s => s.published_at && s.retrieved_at && s.valid_until && s.confidence && s.copyright), 'incomplete source metadata');
const factualItems = [...data.route.preflight, ...data.route.stops, ...data.habitats, ...data.targets.filter(t => !t.needs_review), data.safety];
const evidenceCoverage = factualItems.filter(i => (i.source_ids || i.evidence_ids || []).length > 0).length / factualItems.length;
check('evidence:fact-links>=90%', evidenceCoverage >= (fixture.metrics.evidence_link_target || 0.9), `${Math.round(evidenceCoverage * 100)}%`);

// Layer 2: semantic structure and content
const sections = fixture.sections;
for (const section of sections) check(`semantic:${section}`, html.includes(`data-section="${section}"`), 'missing section');
for (const field of ['decision','conditions','route','timeline','habitats','targets','safety']) check(`semantic:${field}-content`, Array.isArray(data[field]) ? data[field].length > 0 : Object.keys(data[field] || {}).length > 0, 'empty');
check('semantic:master-embedded', html.includes('id="guide-master"'), 'missing master snapshot');
let embeddedMaster;
try { embeddedMaster = JSON.parse(html.match(/<script type="application\/json" id="guide-master">([\s\S]*?)<\/script>/)?.[1]); } catch {}
check('semantic:embedded-master-equality', JSON.stringify(embeddedMaster) === JSON.stringify(data), 'embedded snapshot differs from source');
check('semantic:article-id', html.includes(`data-article-id="${data.article_id}"`), 'article id absent in HTML');
check('semantic:route-stop-boundaries', data.route.stops.every(stop => stop.boundary && stop.evidence_ids), 'route stop missing boundary/evidence');

// Layer 3: static HTML
check('static:doctype', /^<!doctype html>/i.test(html), 'doctype missing');
check('static:title', html.includes(`<title>${data.title} · 野录 WildLog</title>`), 'title mismatch');
check('static:source-links', (html.match(/https:\/\//g) || []).length >= data.sources.length, 'not all source URLs rendered');
check('static:responsive-table', html.includes('overflow:auto'), 'table overflow rule missing');
check('static:balanced-section-tags', (html.match(/<section\b/g) || []).length === (html.match(/<\/section>/g) || []).length, 'section tags unbalanced');
check('static:no-placeholder', !/undefined|null/.test(html), 'placeholder value found');
const visibleHtml = html.replace(/<script\b[\s\S]*?<\/script>/g, '');
const escapeHtml = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const renderedItems = [...data.route.stops.flatMap(s => [s.access,s.observe,s.boundary]), ...data.timeline.flatMap(s => [s.action,s.stop_rule]), ...data.habitats.map(s => s.relationship), ...data.targets.map(s => s.claim), ...data.conditions.map(s => s.value), ...data.safety.rules];
const renderCoverage = renderedItems.filter(value => visibleHtml.includes(escapeHtml(value))).length / renderedItems.length;
check('static:visible-content>=90%', renderCoverage >= 0.9, `${Math.round(renderCoverage * 100)}%`);

// Layer 4: editorial and safety
const safetyText = `${data.safety.rules.join(' ')} ${data.route.stops.map(s => s.boundary).join(' ')}`;
check('editorial:sensitive-coordinates', /不公开[^。]*(GPS|经纬度|精确坐标)/.test(safetyText) && !/(发布|提供|寻找|绕过)[^。]*(GPS|经纬度|精确坐标)/.test(safetyText), 'sensitive coordinate instruction found');
check('editorial:prohibited-behaviour', ['不追逐','不投喂','不播放诱鸟音','不进入禁入区'].every(term => safetyText.includes(term)), 'missing safety guardrail');
check('editorial:copyright', html.includes('版权'), 'copyright statement missing');
check('editorial:review-state', data.status === '待核验' && data.qa.review_status === '待核验', 'unsafe approval state');

const passed = checks.filter(item => item.ok).length;
const layer = prefix => checks.filter(item => item.name.startsWith(prefix)).every(item => item.ok) ? 'passed' : 'failed';
const report = {article_id: data.article_id, passed_checks: passed, total_checks: checks.length, failed_checks: failures, metrics:{condition_tuple_ratio:conditionComplete, factual_link_ratio:evidenceCoverage, visible_content_ratio:renderCoverage, semantic_sections:sections.length}, unrun_checks: data.qa.unrun_checks || [], reviewer: data.qa.reviewer, reviewed_at: data.qa.reviewed_at, next_action: data.qa.next_action, layers: {schema_evidence: layer('schema:') === 'passed' && layer('evidence:') === 'passed' ? 'passed' : 'failed', semantic: layer('semantic:'), static: layer('static:'), editorial_safety: layer('editorial:')}};
console.log(JSON.stringify(report, null, 2));
if (failures.length) process.exit(1);
