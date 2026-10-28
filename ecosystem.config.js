module.exports = {
  apps: [
    {
      name: "tradedesk-engine",
      cwd: "./engine",
      script: "uv",
      args: "run uvicorn app.main:app --host 127.0.0.1 --port 8000",
      env: {
        PYTHONUNBUFFERED: "1",
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
    {
      name: "tradedesk-web",
      cwd: "./web",
      script: "npm",
      args: "start",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      restart_delay: 3000,
      max_restarts: 10,
    },
  ],
};
