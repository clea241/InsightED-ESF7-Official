module.exports = {
  apps: [
    {
      name: 'insighted-esf7-staging-backend',
      script: 'server/server.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5035,
        START_LOCAL_WORKER: 'false'
      },
      instances: 2,
      exec_mode: 'cluster',
      kill_timeout: 15000,
      wait_ready: true,
      listen_timeout: 10000,
      max_memory_restart: '1500M',
      node_args: '--max-old-space-size=1024',
      error_file: '/mnt/insighted-esf7-staging/logs/error.log',
      out_file: '/mnt/insighted-esf7-staging/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
    {
      name: 'insighted-esf7-staging-worker',
      script: 'server/run_redis_worker.js',
      cwd: '/mnt/insighted-esf7-staging',
      env: {
        NODE_ENV: 'production',
        PORT: 5035
      },
      instances: 1,
      exec_mode: 'fork',
      kill_timeout: 15000,
      wait_ready: true,
      listen_timeout: 10000,
      max_memory_restart: '1500M',
      node_args: '--max-old-space-size=1024',
      error_file: '/mnt/insighted-esf7-staging/logs/worker-error.log',
      out_file: '/mnt/insighted-esf7-staging/logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    }
  ]
};
