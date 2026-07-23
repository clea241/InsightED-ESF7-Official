module.exports = {
  apps: [
    {
      name: 'insighted-esf7-staging-backend',
      script: 'server/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5035,
      },
      instances: 2,
      exec_mode: 'cluster',
      max_memory_restart: '2G',
      node_args: '--max-old-space-size=4096',
      error_file: '/mnt/insighted-esf7-staging/logs/error.log',
      out_file: '/mnt/insighted-esf7-staging/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ]
};
