// PM2 Production Ecosystem Configuration for InsightED ESF7
// Secrets are loaded from the runtime environment (systemd, /etc/environment, or server/.env)
// Log rotation is managed via pm2-logrotate:
//   pm2 install pm2-logrotate
//   pm2 set pm2-logrotate:max_size 10M
//   pm2 set pm2-logrotate:retain 14
//   pm2 set pm2-logrotate:compress true

module.exports = {
  apps: [
    {
      name: "insighted-esf7-prod-backend",
      script: "server/server.js",
      cwd: "/var/www/html/InsightED-ROSDO/insighted-esf7-prod",
      instances: 4,
      exec_mode: "cluster",
      kill_timeout: 25000,
      wait_ready: true,
      listen_timeout: 10000,
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 5007,
        START_LOCAL_WORKER: "false",
        JWT_SECRET: process.env.JWT_SECRET,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        DB_HOST: process.env.DB_HOST || "127.0.0.1",
        DB_PORT: process.env.DB_PORT || "6432",
        DB_NAME: process.env.DB_NAME || "insighted_esf7",
        DB_SSL: process.env.DB_SSL || "false",
        REDIS_HOST: process.env.REDIS_HOST || "127.0.0.1",
        REDIS_PORT: process.env.REDIS_PORT || "6379",
      },
      max_memory_restart: "1500M",
      node_args: "--max-old-space-size=1024",
      error_file:
        "/var/www/html/InsightED-ROSDO/insighted-esf7-prod/logs/error.log",
      out_file:
        "/var/www/html/InsightED-ROSDO/insighted-esf7-prod/logs/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "insighted-esf7-prod-worker",
      script: "server/run_redis_worker.js",
      cwd: "/var/www/html/InsightED-ROSDO/insighted-esf7-prod",
      instances: 1,
      exec_mode: "fork",
      kill_timeout: 25000,
      wait_ready: true,
      listen_timeout: 10000,
      env: {
        NODE_ENV: "production",
        PORT: process.env.PORT || 5007,
        JWT_SECRET: process.env.JWT_SECRET,
        DB_USER: process.env.DB_USER,
        DB_PASSWORD: process.env.DB_PASSWORD,
        DB_HOST: process.env.DB_HOST || "127.0.0.1",
        DB_PORT: process.env.DB_PORT || "6432",
        DB_NAME: process.env.DB_NAME || "insighted_esf7",
        DB_SSL: process.env.DB_SSL || "false",
        REDIS_HOST: process.env.REDIS_HOST || "127.0.0.1",
        REDIS_PORT: process.env.REDIS_PORT || "6379",
      },
      max_memory_restart: "1500M",
      node_args: "--max-old-space-size=1024",
      error_file:
        "/var/www/html/InsightED-ROSDO/insighted-esf7-prod/logs/worker-error.log",
      out_file:
        "/var/www/html/InsightED-ROSDO/insighted-esf7-prod/logs/worker-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
