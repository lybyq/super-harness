import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { test } from 'node:test';
import { HubClient, HubError } from '../hub-client.mjs';

async function serve(t, handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  });
  return `http://127.0.0.1:${server.address().port}/api/v1`;
}

function client(apiBaseUrl, overrides = {}) {
  return new HubClient({
    apiBaseUrl,
    getAccessToken: async () => 'fixture-token',
    allowInsecureHttp: true,
    timeoutMs: 2000,
    maxResponseBytes: 4096,
    ...overrides,
  });
}

test('catalog filters use the existing API prefix and bearer header', async t => {
  const base = await serve(t, (request, response) => {
    assert.equal(request.headers.authorization, 'Bearer fixture-token');
    const url = new URL(request.url, 'http://localhost');
    assert.equal(url.pathname, '/api/v1/catalog/search');
    assert.equal(url.searchParams.get('q'), 'jira & wiki');
    assert.equal(url.searchParams.get('page'), '2');
    assert.equal(url.searchParams.has('token'), false);
    response.end(JSON.stringify({ data: [], total: 0, page: 2, pageSize: 20 }));
  });
  assert.equal((await client(base).search({ q: 'jira & wiki', page: 2 })).page, 2);
});

test('capability and role calls use the existing Hub routes', async t => {
  const paths = [];
  const base = await serve(t, (request, response) => {
    paths.push(request.url);
    response.end('{}');
  });
  const hub = client(`${base}/`);
  await hub.capability('jira-mcp');
  await hub.roles();
  assert.deepEqual(paths, ['/api/v1/capabilities/jira-mcp', '/api/v1/roles?view=published']);
  assert.throws(() => hub.capability('../roles'), { code: 'HUB_CAPABILITY_ID_INVALID' });
});

test('resolve sends an explicit runtime instead of accepting the Hub default', async t => {
  const base = await serve(t, async (request, response) => {
    assert.equal(request.method, 'POST');
    assert.equal(request.url, '/api/v1/resolve');
    let body = '';
    for await (const chunk of request) body += chunk;
    assert.deepEqual(JSON.parse(body), { role: 'frontend', runtime: 'deepseek-harness' });
    response.end('{"capabilities":[]}');
  });
  assert.deepEqual(await client(base).resolve({ role: 'frontend', runtime: 'deepseek-harness' }), { capabilities: [] });
  assert.throws(() => client(base).resolve({ role: 'frontend' }), { code: 'HUB_RESOLVE_INPUT_INVALID' });
});

test('endpoint configuration rejects embedded credentials and insecure defaults', () => {
  for (const endpoint of ['bad-url', 'https://user:password@hub.example/api/v1', 'https://hub.example/?token=x', 'https://hub.example/#x', 'file:///tmp/hub']) {
    assert.throws(() => client(endpoint), { code: 'HUB_CONFIG_INVALID' });
  }
  assert.throws(() => client('http://hub.example/api/v1', { allowInsecureHttp: false }), { code: 'HUB_CONFIG_INVALID' });
  assert.throws(() => client('https://hub.example/api/v1', { timeoutMs: 0 }), { code: 'HUB_CONFIG_INVALID' });
  assert.throws(() => client('https://hub.example/api/v1', { maxResponseBytes: 0 }), { code: 'HUB_CONFIG_INVALID' });
});

test('missing or unreadable credentials prevent network access without leaking errors', async () => {
  let calls = 0;
  const fetch = async () => { calls++; throw new Error('network should not be reached'); };
  const base = 'https://hub.example/api/v1';
  await assert.rejects(client(base, { fetch, getAccessToken: async () => undefined }).roles(), { code: 'HUB_AUTH_REQUIRED' });
  const failed = client(base, { fetch, getAccessToken: async () => { throw new Error('private-credential-detail'); } });
  await assert.rejects(failed.roles(), error => error.code === 'HUB_CREDENTIAL_UNAVAILABLE' && !String(error).includes('private-credential-detail'));
  assert.equal(calls, 0);
});

test('explicit open Hub never reads or sends a bearer token', async t => {
  const base = await serve(t, (request, response) => {
    assert.equal(request.headers.authorization, undefined);
    response.end('[]');
  });
  assert.deepEqual(await client(base, { authentication: 'none', getAccessToken: async () => { throw new Error('must not read'); } }).roles(), []);
});

test('bearer authentication failure never falls back to an anonymous request', async t => {
  const headers = [];
  const base = await serve(t, (request, response) => {
    headers.push(request.headers.authorization); response.writeHead(401); response.end('{}');
  });
  await assert.rejects(client(base, { authentication: 'bearer' }).roles(), { code: 'HUB_HTTP_ERROR', status: 401 });
  assert.deepEqual(headers, ['Bearer fixture-token']);
});

test('HTTP failures expose status but never remote response text', async t => {
  const base = await serve(t, (_request, response) => {
    response.writeHead(401);
    response.end('{"message":"fixture-token private-server-detail"}');
  });
  await assert.rejects(client(base).roles(), error => {
    assert.ok(error instanceof HubError);
    assert.equal(error.status, 401);
    assert.equal(error.code, 'HUB_HTTP_ERROR');
    assert.equal(JSON.stringify(error).includes('fixture-token'), false);
    return true;
  });
});

test('redirects do not forward credentials to a different destination', async t => {
  let forwarded = 0;
  const destination = await serve(t, (_request, response) => { forwarded++; response.end('{}'); });
  const base = await serve(t, (_request, response) => {
    response.writeHead(302, { Location: `${destination}/roles` });
    response.end();
  });
  await assert.rejects(client(base).roles(), { code: 'HUB_UNAVAILABLE' });
  assert.equal(forwarded, 0);
});

test('response limits count streamed UTF-8 bytes, including JSON wrappers', async t => {
  const document = JSON.stringify({ text: '内网' });
  const bytes = Buffer.byteLength(document);
  const base = await serve(t, (_request, response) => response.end(document));
  assert.deepEqual(await client(base, { maxResponseBytes: bytes }).roles(), { text: '内网' });
  await assert.rejects(client(base, { maxResponseBytes: bytes - 1 }).roles(), { code: 'HUB_RESPONSE_TOO_LARGE' });
});

test('malformed JSON is refused rather than treated as an empty catalog', async t => {
  const base = await serve(t, (_request, response) => response.end('not JSON'));
  await assert.rejects(client(base).roles(), { code: 'HUB_RESPONSE_INVALID' });
});

test('network and body reads share the configured timeout', async t => {
  const base = await serve(t, (_request, response) => {
    response.writeHead(200);
    response.write('{');
  });
  await assert.rejects(client(base, { timeoutMs: 100 }).roles(), { code: 'HUB_TIMEOUT' });
});

test('caller cancellation is distinguished from timeout', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(client('https://hub.example/api/v1').roles(controller.signal), { code: 'HUB_CANCELLED' });
});
