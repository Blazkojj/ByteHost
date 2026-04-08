module.exports = {
  apps: [
    {
      name: "bytehost-panel",
      script: "server/index.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "production",
        PORT: 3000
      }
    }
  ]
};
