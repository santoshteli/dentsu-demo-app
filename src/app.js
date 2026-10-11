const express = require('express');

// Static sample data. Phase 6 changes this response to show a deployment end to end.
const users = [
  { id: 1, name: 'Asha Rao', role: 'admin' },
  { id: 2, name: 'Vikram Shah', role: 'developer' },
  { id: 3, name: 'Meera Iyer', role: 'viewer' },
];

function createApp() {
  const app = express();
  app.disable('x-powered-by');

  // Used by the Kubernetes readiness and liveness probes and the ALB health check.
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/users', (req, res) => {
    res.json(users);
  });

  return app;
}

module.exports = { createApp, users };
