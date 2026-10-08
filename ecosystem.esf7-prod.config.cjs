module.exports = {
  apps: [
    {
      name: 'insighted-esf7-prod-backend',
      script: 'server/server.js',
      cwd: '/var/www/html/InsightED-ROSDO/insighted-esf7-prod',
      instances: 4,
      exec_mode: 'cluster',
      kill_timeout: 15000,
      wait_ready: true,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        PORT: 5007
      },
      max_memory_restart: '3G',
      node_args: '--max-old-space-size=3072',
      error_file: '/var/www/html/InsightED-ROSDO/insighted-esf7-prod/logs/error.log',
      out_file: '/var/www/html/InsightED-ROSDO/insighted-esf7-prod/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
