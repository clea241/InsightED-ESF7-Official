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
        PORT: 5007,
        START_LOCAL_WORKER: 'false',
        JWT_SECRET: 'insighted_super_secret_jwt_token_key_2026_esf7_prod_secure',
        DB_USER: 'Administrator1',
        DB_PASSWORD: 'pRZTbQ2T1JD7',
        DB_HOST: '127.0.0.1',
        DB_PORT: '6432',
        DB_NAME: 'insighted_esf7',
        DB_SSL: 'false',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379'
      },
      max_memory_restart: '1500M',
      node_args: '--max-old-space-size=1024',
      error_file: '/var/www/html/InsightED-ROSDO/insighted-esf7-prod/logs/error.log',
      out_file: '/var/www/html/InsightED-ROSDO/insighted-esf7-prod/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'insighted-esf7-prod-worker',
      script: 'server/run_redis_worker.js',
      cwd: '/var/www/html/InsightED-ROSDO/insighted-esf7-prod',
      instances: 1,
      exec_mode: 'fork',
      kill_timeout: 15000,
      wait_ready: true,
      listen_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        PORT: 5007,
        JWT_SECRET: 'insighted_super_secret_jwt_token_key_2026_esf7_prod_secure',
        DB_USER: 'Administrator1',
        DB_PASSWORD: 'pRZTbQ2T1JD7',
        DB_HOST: '127.0.0.1',
        DB_PORT: '6432',
        DB_NAME: 'insighted_esf7',
        DB_SSL: 'false',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '6379'
      },
      max_memory_restart: '1500M',
      node_args: '--max-old-space-size=1024',
      error_file: '/var/www/html/InsightED-ROSDO/insighted-esf7-prod/logs/worker-error.log',
      out_file: '/var/www/html/InsightED-ROSDO/insighted-esf7-prod/logs/worker-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};
