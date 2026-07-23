module.exports = {
  apps: [
    {
      name: 'insighted-backend',
      script: './server/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
