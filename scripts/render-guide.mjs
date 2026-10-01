#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const input = process.argv[2] || 'content/guides/js-dongtai-tiaozini.json';
const data = JSON.parse(fs.readFileSync(path.resolve(root, input), 'utf8'));
const out = process.argv[3] || `content/guides/${data.article_id}.html`;
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const inline = value => esc(value).replaceAll('`', '<code>').replaceAll('</code><code>', '');
const li = values => (values || []).map(value => `<li>${inline(value)}</li>`).join('');
const sourceById = new Map(data.sources.map(source => [source.id, source]));
const sourceLinks = ids => (ids || []).map(id => {
  const source = sourceById.get(id);
  return source ? `<a href="${esc(source.url)}" target="_blank" rel="noopener" data-source-id="${esc(id)}">${esc(id)}</a>` : `<code>${esc(id)}</code>`;
}).join('、') || '<span class="muted">无直接来源；待核验</span>';
const statusClass = status => /待核验|低/.test(status) ? 'status-pending' : /需现场/.test(status) ? 'status-watch' : 'status-supported';
const conditionRows = data.conditions.map(item => `<tr><th scope="row">${inline(item.label)}</th><td>${inline(item.value)}</td><td><span class="status ${statusClass(item.status)}">${inline(item.status)}</span></td><td>${sourceLinks(item.source_ids)}<br><span class="muted">来源日期 ${esc(item.source_date)} · 检索 ${esc(item.retrieved_at)}</span></td><td>${inline(item.valid_until)}<br><span class="confidence">置信度 ${esc(item.confidence)} · ${item.needs_review ? '需复核' : '已复核'}</span></td></tr>`).join('');
const sourceRows = data.sources.map(source => `<tr><th scope="row" id="source-${esc(source.id)}"><code>${esc(source.id)}</code></th><td>${inline(source.type)}</td><td><a href="${esc(source.url)}" target="_blank" rel="noopener">${inline(source.title)}</a><br><span class="muted">${inline(source.excerpt)}</span></td><td>${esc(source.published_at)}</td><td>${inline(source.valid_until)}<br><span class="confidence">${esc(source.confidence)} · ${inline(source.copyright)}</span></td></tr>`).join('');
const preflight = data.route.preflight.map(item => `<li><strong>${item.step}.</strong> ${inline(item.action)}<small>证据：${sourceLinks(item.evidence_ids)}</small></li>`).join('');
const stops = data.route.stops.map(stop => `<article class="route-stop"><div class="eyebrow">观察点 ${stop.order}</div><h3>${inline(stop.name)}</h3><p><strong>进入：</strong>${inline(stop.access)}</p><p><strong>观察：</strong>${inline(stop.observe)}</p><p><strong>边界：</strong>${inline(stop.boundary)}</p><small>证据：${sourceLinks(stop.evidence_ids)}</small></article>`).join('');
const timeline = data.timeline.map(item => `<li><div class="timeline-phase">${inline(item.phase)} <span>${inline(item.relative_time)}</span></div><p>${inline(item.action)}</p><small>停止条件：${inline(item.stop_rule)}</small></li>`).join('');
const habitats = data.habitats.map(item => `<article class="habitat"><h3>${inline(item.name)}</h3><p>${inline(item.relationship)}</p><p><strong>观察信号：</strong>${item.signals.map(inline).join(' · ')}</p><small>证据：${sourceLinks(item.source_ids)} · 置信度 ${esc(item.confidence)}</small></article>`).join('');
const targets = data.targets.map(item => `<article class="target"><div class="eyebrow">${inline(item.group)}</div><h3>${item.items.length ? item.items.map(inline).join('、') : '暂无实时鸟讯'}</h3><p><strong>证据等级：</strong>${inline(item.evidence_level)}。${inline(item.claim)}</p><small>证据：${sourceLinks(item.source_ids)}${item.needs_review ? ' · 待复核' : ''}</small></article>`).join('');
const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="description" content="${esc(data.title)}｜${esc(data.summary)}">
<meta name="robots" content="index,follow">
<title>${esc(data.title)} · 野录 WildLog</title>
<style>
:root{--ink:#17342f;--muted:#637772;--line:#d8e4de;--wash:#e9f3ef;--accent:#e76f51;--warn:#fff0df;--paper:#fff}*{box-sizing:border-box}body{margin:0;background:#f7f7f2;color:var(--ink);font:16px/1.75 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif}header{background:#dff0e8;padding:22px 6vw}.top,main,.footer{max-width:980px;margin:auto}.brand{font-weight:800;font-size:21px}.brand span{color:var(--accent)}main{padding:34px 6vw 70px}h1{font-size:clamp(30px,5vw,48px);line-height:1.15;margin:12px 0}h2{margin:42px 0 14px;color:#235b50;border-top:1px solid var(--line);padding-top:24px}h3{margin:9px 0;color:#2a6b5f}p{margin:8px 0}a{color:#1d786d}small,.muted,.meta{color:var(--muted);font-size:13px}.status{display:inline-block;padding:4px 10px;border-radius:99px;font-size:13px}.status-pending{background:var(--warn);color:#9a4c25}.status-watch{background:#fff7c7;color:#785d00}.status-supported{background:#dff0e8;color:#21624f}.hero{background:var(--paper);border:1px solid var(--line);border-radius:16px;padding:20px 22px;box-shadow:0 5px 20px #17342f0d}.hero-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:16px}.metric{background:var(--wash);border-radius:12px;padding:10px 12px}.metric b{display:block;font-size:13px;color:var(--muted)}.metric span{display:block;margin-top:2px}.callout{margin:18px 0;padding:14px 17px;border-left:4px solid var(--accent);background:#fff8ed}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px}.card,.route-stop,.habitat,.target{background:var(--paper);border:1px solid var(--line);border-radius:12px;padding:15px}.eyebrow{text-transform:uppercase;letter-spacing:.08em;color:#6b8c83;font-size:12px}.preflight{padding-left:1.4em}.preflight li{margin:9px 0}.preflight small{display:block}.route-stop p{margin:6px 0}.timeline{border-left:3px solid #9bc8b8;padding-left:18px;list-style:none}.timeline li{margin:0 0 18px}.timeline-phase{font-weight:700;color:#235b50}.timeline-phase span{font-weight:400;color:var(--muted);font-size:13px;margin-left:8px}.table-wrap{overflow:auto;margin:16px 0}table{border-collapse:collapse;min-width:880px;width:100%;background:var(--paper);border:1px solid var(--line)}th,td{padding:10px 12px;border:1px solid var(--line);text-align:left;vertical-align:top}thead th{background:var(--wash)}tbody th{font-weight:600;background:#fbfdfb}.footer{padding:30px 6vw;color:var(--muted);font-size:13px}.back{display:inline-block;margin-top:26px}code{background:var(--wash);padding:2px 5px;border-radius:4px;font-size:.9em}.confidence{font-size:12px;color:#657d76}@media(max-width:600px){main{padding-top:24px}.hero-grid{grid-template-columns:1fr 1fr}h2{margin-top:32px}}
</style>
</head>
<body>
<header><div class="top"><div class="brand">野录 <span>WildLog</span></div><div class="meta">公开资料整理 · <span class="status status-pending">${esc(data.status)}</span> · 母版 ${esc(data.schema_version)}</div></div></header>
<main data-article-id="${esc(data.article_id)}" data-generated-from="${esc(input)}" data-last-checked="${esc(data.last_checked_at)}">
<section class="hero" data-section="decision" aria-labelledby="decision-title"><div class="eyebrow">Decision / 出发决策</div><h1 id="decision-title">${esc(data.title)}</h1><p class="callout"><strong>摘要：</strong>${inline(data.summary)}</p><div class="hero-grid"><div class="metric"><b>状态</b><span>${esc(data.status)}</span></div><div class="metric"><b>适用月份</b><span>${data.decision.months.join('、')} 月</span></div><div class="metric"><b>难度</b><span>${inline(data.decision.difficulty)}</span></div><div class="metric"><b>停留</b><span>${inline(data.decision.duration)}</span></div></div><p>${inline(data.decision.audience)}</p><p>${inline(data.decision.season_note)}</p><p><strong>观察价值：</strong>${inline(data.decision.value)}</p><h3>出发/取消门槛</h3><ul>${li(data.decision.go_no_go)}</ul></section>
<section data-section="conditions" aria-labelledby="conditions-title"><h2 id="conditions-title">Conditions｜出发前条件</h2><p>所有实时字段保留状态、来源日期、检索日期、有效期和置信度；“待核验”表示需要在出发前重新取得来源。</p><div class="table-wrap"><table><thead><tr><th scope="col">字段</th><th scope="col">当前值</th><th scope="col">状态</th><th scope="col">来源与日期</th><th scope="col">有效期/置信度</th></tr></thead><tbody>${conditionRows}</tbody></table></div></section>
<section data-section="route" aria-labelledby="route-title"><h2 id="route-title">Route｜结构化路线</h2><h3>先核验</h3><ol class="preflight">${preflight}</ol><div class="grid">${stops}</div><h3>撤离条件</h3><ul>${li(data.route.abort_conditions)}</ul></section>
<section data-section="timeline" aria-labelledby="timeline-title"><h2 id="timeline-title">Timeline｜相对时间线</h2><ol class="timeline">${timeline}</ol></section>
<section data-section="habitats" aria-labelledby="habitats-title"><h2 id="habitats-title">Habitats｜生境观察</h2><div class="grid">${habitats}</div></section>
<section data-section="targets" aria-labelledby="targets-title"><h2 id="targets-title">Targets｜重点鸟种与证据等级</h2><div class="grid">${targets}</div></section>
<section data-section="safety" aria-labelledby="safety-title"><h2 id="safety-title">Safety｜安全与生态保护</h2><div class="grid"><article class="card"><h3>必须遵守</h3><ul>${li(data.safety.rules)}</ul></article><article class="card"><h3>现场风险</h3><ul>${li(data.safety.risks)}</ul><p>${inline(data.safety.legal_basis)}</p></article></div></section>
<section data-section="sources" aria-labelledby="sources-title"><h2 id="sources-title">Sources｜来源、版权与 QA</h2><div class="table-wrap"><table><thead><tr><th scope="col">来源 ID</th><th scope="col">类型</th><th scope="col">用途</th><th scope="col">发布日期</th><th scope="col">有效期/版权</th></tr></thead><tbody>${sourceRows}</tbody></table></div><div class="callout"><strong>QA 状态：</strong>${inline(data.qa.review_status)} · ${inline(data.qa.next_action)}<br>${data.qa.review_notes.map(inline).join('<br>')}<br><strong>版权：</strong>${inline(data.copyright)}</div></section>
<a class="back" href="index.html">← 返回攻略索引</a>
</main>
<footer class="footer">资料检索日：${esc(data.last_checked_at)} · 下次复核：${esc(data.next_review_at)} · 条件字段和当天鸟讯须按出行日期复核。</footer>
<script type="application/json" id="guide-master">${JSON.stringify(data).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026')}</script>
</body></html>`;
fs.writeFileSync(path.resolve(root, out), html + '\n');
console.log(`rendered ${out} from ${input}`);
