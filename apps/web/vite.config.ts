import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const rootDir = new URL(".", import.meta.url).pathname;
  const srcDir = new URL("./src", import.meta.url).pathname;
  const env = loadEnv(mode, rootDir, "");
  const apiTarget = env.VITE_API_TARGET || "http://localhost:3000";
  const clientId = env.WEB_API_CLIENT_ID || "";
  const clientSecret = env.WEB_API_CLIENT_SECRET || "";

  const proxyHeaders =
    clientId && clientSecret
      ? {
        "X-Client-Id": clientId,
        "X-Client-Secret": clientSecret,
      }
      : undefined;

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": srcDir,
      },
    },
    server: {
      port: 5173,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          ws: true,
          headers: proxyHeaders,
        },
        "/public": {
          target: apiTarget,
          changeOrigin: true,
          headers: proxyHeaders,
        },
      },
    },
  };
});
