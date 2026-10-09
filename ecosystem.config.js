// PM2 Ecosystem Configuration for InsightED ESF7
// Log rotation is managed via pm2-logrotate:
//   pm2 install pm2-logrotate
//   pm2 set pm2-logrotate:max_size 10M
//   pm2 set pm2-logrotate:retain 14
//   pm2 set pm2-logrotate:compress true

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
      max_memory_restart: '1500M',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
