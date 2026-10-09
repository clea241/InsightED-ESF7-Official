module.exports = {
  apps: [
    {
      name: 'insighted-backend',
      script: './server/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      kill_timeout: 15000,
      wait_ready: true,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
