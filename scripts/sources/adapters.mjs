#!/usr/bin/env node

/** Read-only bird-sighting source adapters with injected networking for fixtures. */
export const UNIFIED_FIELDS = [
  'source', 'sourceId', 'species', 'observedAt', 'publishedAt', 'region',
  'latitude', 'longitude', 'precision', 'evidenceUrl', 'reviewState',
  'rawFetchedAt', 'freshnessMinutes', 'status'
];
export const INATURALIST_ENDPOINT = 'https://api.inaturalist.org/v1/observations';
export const BIRDREPORT_SOURCE = 'china-birdreport';
export const CLOUDGUAN_SOURCE = 'huangpu-cloudguan';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export function parseRetryAfter(value, fallbackMs = 1000) {
  if (!value) return fallbackMs;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : fallbackMs;
}

export function createRateLimiter({minIntervalMs = 250, now = () => Date.now(), sleepFn = sleep} = {}) {
  let nextAllowedAt = 0;
  return {
    async wait() {
      const delay = Math.max(0, nextAllowedAt - now());
      if (delay) await sleepFn(delay);
      nextAllowedAt = Math.max(nextAllowedAt, now()) + minIntervalMs;
    },
    get nextAllowedAt() { return nextAllowedAt; }
  };
}

export async function fetchJsonWithRetry(url, {
  fetchImpl = globalThis.fetch, fetchOptions = {}, attempts = 3,
  baseDelayMs = 250, sleepFn = sleep, limiter
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable; provide fetchImpl for tests');
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (limiter) await limiter.wait();
    try {
      const response = await fetchImpl(url, fetchOptions);
      if (response.ok) return {response, json: await response.json(), attempts: attempt};
      const retryable = response.status === 408 || response.status === 425 || response.status === 429 || response.status >= 500;
      const error = new Error(`HTTP ${response.status} for ${url}`);
      error.status = response.status;
      error.retryable = retryable;
      error.retryAfterMs = parseRetryAfter(response.headers?.get?.('retry-after'), baseDelayMs * (2 ** (attempt - 1)));
      lastError = error;
      if (!retryable || attempt >= attempts) throw error;
      await sleepFn(error.retryAfterMs);
    } catch (error) {
      lastError = error;
      const retryable = error?.retryable ?? true;
      if (!retryable || attempt >= attempts) throw error;
      await sleepFn(baseDelayMs * (2 ** (attempt - 1)));
    }
  }
  throw lastError || new Error('request failed');
}

export function freshnessMinutes(publishedAt, now = new Date()) {
  if (!publishedAt) return null;
  const then = Date.parse(publishedAt);
  const current = now instanceof Date ? now.getTime() : Date.parse(now);
  if (!Number.isFinite(then) || !Number.isFinite(current)) return null;
  return Math.max(0, Math.round((current - then) / 60000));
}

export function fuzzSensitivePoint(latitude, longitude, {sensitive = false, gridDegrees = 0.05, precisionMeters = 5000} = {}) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return {latitude: null, longitude: null, precision: '区域级，未提供坐标'};
  }
  if (!sensitive) return {latitude, longitude, precision: '公开坐标（仍需人工复核）'};
  const round = (value) => Math.round(value / gridDegrees) * gridDegrees;
  return {latitude: Number(round(latitude).toFixed(4)), longitude: Number(round(longitude).toFixed(4)), precision: `约 ${precisionMeters / 1000} km，敏感点位已模糊化`};
}

function qualityToReviewState(quality) {
  if (quality === 'research') return 'research-grade';
  if (quality === 'needs_id') return 'needs-id';
  return quality || 'pending-review';
}

function makeRecord(fields, raw, now = new Date()) {
  const publishedAt = fields.publishedAt || null;
  return {
    source: fields.source,
    sourceId: String(fields.sourceId ?? ''),
    species: fields.species || '未识别鸟种',
    observedAt: fields.observedAt || null,
    publishedAt,
    region: fields.region || '未标注区域',
    latitude: fields.latitude ?? null,
    longitude: fields.longitude ?? null,
    precision: fields.precision || '未知，待核验',
    evidenceUrl: fields.evidenceUrl || null,
    reviewState: fields.reviewState || 'pending-review',
    rawFetchedAt: now.toISOString(),
    freshnessMinutes: freshnessMinutes(publishedAt, now),
    status: fields.status || 'ok',
    ...(fields.error ? {error: fields.error} : {}),
    raw
  };
}

export function normalizeINaturalistObservation(observation, {now = new Date(), sensitive = false} = {}) {
  const coords = observation.geojson?.coordinates || observation.location?.split?.(',').reverse?.().map(Number);
  const latitude = Number(coords?.[0]);
  const longitude = Number(coords?.[1]);
  const obscured = Boolean(observation.obscured || observation.geoprivacy === 'obscured' || observation.taxon?.conservation_status?.status === 'threatened');
  const point = fuzzSensitivePoint(latitude, longitude, {sensitive: sensitive || obscured});
  const taxon = observation.taxon || {};
  return makeRecord({
    source: 'inaturalist', sourceId: observation.id,
    species: taxon.preferred_common_name || taxon.name || observation.species_guess,
    observedAt: observation.observed_on || observation.observed_on_string,
    publishedAt: observation.created_at || observation.updated_at,
    region: observation.place_guess || '上海附近', latitude: point.latitude, longitude: point.longitude,
    precision: point.precision, evidenceUrl: observation.uri || `https://www.inaturalist.org/observations/${observation.id}`,
    reviewState: qualityToReviewState(observation.quality_grade), status: 'ok'
  }, {id: observation.id, quality_grade: observation.quality_grade, geoprivacy: observation.geoprivacy, obscured: observation.obscured, raw: observation}, now);
}

export function createINaturalistAdapter({fetchImpl = globalThis.fetch, limiter = createRateLimiter({minIntervalMs: 250}), now = () => new Date(), sleepFn = sleep} = {}) {
  return {
    source: 'inaturalist',
    buildUrl({lat = 31.2304, lng = 121.4737, radiusKm = 80, from, to, qualityGrades = ['research', 'needs_id'], perPage = 100, page = 1} = {}) {
      const url = new URL(INATURALIST_ENDPOINT);
      url.searchParams.set('lat', String(lat)); url.searchParams.set('lng', String(lng));
      url.searchParams.set('radius', String(radiusKm)); url.searchParams.set('taxon_id', '3');
      url.searchParams.set('quality_grade', qualityGrades.join(','));
      if (from) url.searchParams.set('d1', from); if (to) url.searchParams.set('d2', to);
      url.searchParams.set('per_page', String(perPage)); url.searchParams.set('page', String(page));
      url.searchParams.set('order_by', 'observed_on'); url.searchParams.set('order', 'desc');
      return url;
    },
    async collect(options = {}) {
      const url = this.buildUrl(options);
      const result = await fetchJsonWithRetry(url, {fetchImpl, limiter, sleepFn});
      const fetchedAt = now();
      const observations = Array.isArray(result.json?.results) ? result.json.results : [];
      return {source: 'inaturalist', status: 'ok', requestUrl: String(url), rawCount: observations.length, attempts: result.attempts, records: observations.map((item) => normalizeINaturalistObservation(item, {now: fetchedAt, sensitive: options.sensitive}))};
    }
  };
}

function asArray(payload) {
  if (Array.isArray(payload)) return payload;
  for (const key of ['records', 'data', 'list', 'items', 'result']) if (Array.isArray(payload?.[key])) return payload[key];
  return [];
}

function blockedResult(source, reason, details = {}) { return {source, status: 'blocked', records: [], reason, ...details}; }

function parseGenericRecord(item, {source, index, now, defaultRegion, sensitive = false} = {}) {
  const latitude = Number(item.latitude ?? item.lat ?? item.location?.lat);
  const longitude = Number(item.longitude ?? item.lng ?? item.lon ?? item.location?.lng);
  const point = fuzzSensitivePoint(latitude, longitude, {sensitive: sensitive || item.sensitive === true || item.geoprivacy === 'obscured'});
  const observedAt = item.observedAt || item.observed_at || item.observeTime || item.observation_time || item.time;
  const publishedAt = item.publishedAt || item.published_at || item.publishTime || item.created_at || item.updated_at;
  return makeRecord({source, sourceId: item.sourceId ?? item.id ?? item.recordId ?? `${source}-${index}`, species: item.species || item.speciesName || item.birdName || item.name, observedAt, publishedAt, region: item.region || item.place || item.location?.name || defaultRegion, latitude: point.latitude, longitude: point.longitude, precision: point.precision, evidenceUrl: item.evidenceUrl || item.source_url || item.url || null, reviewState: item.reviewState || item.review_state || 'pending-review', status: 'ok'}, item, now);
}

export const birdReportContract = {
  source: BIRDREPORT_SOURCE,
  endpoint: 'https://www.birdreport.cn/home/search/page.html',
  query: ['region', 'from', 'to', 'species', 'limit'],
  response: 'JSON records/data/list when an authorized documented endpoint is provided',
  policy: 'No login, signature reverse-engineering, CAPTCHA bypass, or rate-limit bypass.'
};

export function createBirdReportAdapter({endpoint = process.env.BIRDREPORT_ENDPOINT, fetchImpl = globalThis.fetch, limiter = createRateLimiter({minIntervalMs: 1000}), now = () => new Date(), sleepFn = sleep} = {}) {
  return {
    source: BIRDREPORT_SOURCE, contract: birdReportContract,
    async smoke(options = {}) {
      if (!endpoint) return blockedResult(BIRDREPORT_SOURCE, 'not_configured', {contract: birdReportContract});
      const url = new URL(endpoint);
      for (const [key, value] of Object.entries({region: options.region || '上海', from: options.from, to: options.to, limit: options.limit || 20})) if (value) url.searchParams.set(key, String(value));
      try {
        const result = await fetchJsonWithRetry(url, {fetchImpl, limiter, sleepFn});
        const records = asArray(result.json).map((item, index) => parseGenericRecord(item, {source: BIRDREPORT_SOURCE, index, now: now(), defaultRegion: '上海', sensitive: true}));
        return {source: BIRDREPORT_SOURCE, status: 'ok', requestUrl: String(url), records, rawCount: records.length, contract: birdReportContract};
      } catch (error) {
        const reason = [401, 403, 429].includes(error.status) ? 'authorized_endpoint_required' : 'live_request_failed';
        return blockedResult(BIRDREPORT_SOURCE, reason, {error: error.message, statusCode: error.status || null, contract: birdReportContract});
      }
    }
  };
}

export const cloudguanContract = {
  source: CLOUDGUAN_SOURCE,
  methods: ['getSoundRecord', 'getHongwaiRecord', 'speciesList'],
  response: 'JSON records/data/list/items/result; raw response retained for field review',
  policy: 'Only use a publicly documented URL supplied by the operator; no token extraction or QR/session replay.'
};

export function createCloudGuanAdapter({baseUrl = process.env.HUANGPU_CLOUDGUAN_BASE_URL, fetchImpl = globalThis.fetch, limiter = createRateLimiter({minIntervalMs: 500}), now = () => new Date(), sleepFn = sleep} = {}) {
  return {
    source: CLOUDGUAN_SOURCE, contract: cloudguanContract,
    async smoke({methods = cloudguanContract.methods, from, to} = {}) {
      if (!baseUrl) return blockedResult(CLOUDGUAN_SOURCE, 'not_configured', {contract: cloudguanContract, methods: methods.map((method) => ({method, status: 'blocked', reason: 'not_configured'}))});
      const results = [];
      for (const method of methods) {
        const url = new URL(`${baseUrl.replace(/\/$/, '')}/${method}`);
        if (from) url.searchParams.set('from', from); if (to) url.searchParams.set('to', to);
        try {
          const result = await fetchJsonWithRetry(url, {fetchImpl, limiter, sleepFn});
          const records = asArray(result.json).map((item, index) => parseGenericRecord(item, {source: `${CLOUDGUAN_SOURCE}:${method}`, index, now: now(), defaultRegion: '黄浦区', sensitive: true}));
          results.push({method, status: 'ok', requestUrl: String(url), records, rawCount: records.length, raw: result.json});
        } catch (error) {
          results.push({method, status: 'blocked', reason: error.status === 401 || error.status === 403 ? 'authorized_endpoint_required' : 'live_request_failed', error: error.message});
        }
      }
      return {source: CLOUDGUAN_SOURCE, status: results.every((item) => item.status === 'ok') ? 'ok' : 'partial', methods: results, contract: cloudguanContract};
    }
  };
}

export function createSocialLead({platform, evidenceUrl, author = null, publishedAt = null, locationHint = null, note = ''} = {}) {
  if (!platform || !evidenceUrl) throw new Error('platform and evidenceUrl are required');
  return {platform, evidenceUrl, author, publishedAt, locationHint, note, reviewState: 'manual-review', status: 'queued', capturedAt: new Date().toISOString()};
}

export function dedupeRecords(records) {
  const seen = new Map();
  for (const record of records) {
    const key = `${record.source}:${record.sourceId || `${record.species}:${record.observedAt}:${record.region}`}`;
    if (!seen.has(key)) seen.set(key, record);
  }
  return [...seen.values()];
}

export function validateUnifiedRecords(records, {now = new Date()} = {}) {
  const failures = [];
  for (const [index, record] of records.entries()) {
    for (const field of UNIFIED_FIELDS) if (!(field in record)) failures.push(`${index}:${field}:missing`);
    if (!record.sourceId) failures.push(`${index}:sourceId:empty`);
    if (record.latitude !== null && !Number.isFinite(record.latitude)) failures.push(`${index}:latitude:invalid`);
    if (record.longitude !== null && !Number.isFinite(record.longitude)) failures.push(`${index}:longitude:invalid`);
    if (record.evidenceUrl && !/^https?:\/\//.test(record.evidenceUrl)) failures.push(`${index}:evidenceUrl:invalid`);
    if (record.freshnessMinutes !== null && record.freshnessMinutes < 0) failures.push(`${index}:freshness:negative`);
    if (record.rawFetchedAt && !Number.isFinite(Date.parse(record.rawFetchedAt))) failures.push(`${index}:rawFetchedAt:invalid`);
    if (record.publishedAt && !Number.isFinite(Date.parse(record.publishedAt))) failures.push(`${index}:publishedAt:invalid`);
  }
  return {ok: failures.length === 0, failures, checkedAt: now.toISOString()};
}
