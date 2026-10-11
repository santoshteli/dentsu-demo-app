const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createApp, users } = require('../src/app');

let server;
let baseUrl;

before(async () => {
  // Port 0: the OS picks a free port, so tests never clash with a running app.
  server = createApp().listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

test('GET /health returns 200 and status ok', async () => {
  const res = await fetch(`${baseUrl}/health`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { status: 'ok' });
});

test('GET /users returns the list of users', async () => {
  const res = await fetch(`${baseUrl}/users`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/json/);

  const body = await res.json();
  assert.ok(Array.isArray(body));
  assert.equal(body.length, users.length);
  for (const user of body) {
    assert.equal(typeof user.id, 'number');
    assert.equal(typeof user.name, 'string');
  }
});

test('unknown paths return 404', async () => {
  const res = await fetch(`${baseUrl}/does-not-exist`);
  assert.equal(res.status, 404);
});
