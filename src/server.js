const { createApp } = require('./app');

const port = Number(process.env.PORT) || 3000;
// 0.0.0.0, not localhost: inside a container, localhost is unreachable from
// outside, so probes and the load balancer could never connect.
const host = process.env.HOST || '0.0.0.0';

const server = createApp().listen(port, host, () => {
  console.log(`dentsu-demo-app listening on http://${host}:${port}`);
});

// Kubernetes sends SIGTERM before stopping a pod. Stop accepting new
// connections, let in-flight requests finish, then exit.
function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
