import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
  build: {
    target: "es2022",
    rolldownOptions: {
      // Vite 8 prints a plugin-timing report by default; it is informational, not a warning.
      checks: { bundlerTimings: false },
      output: {
        // ECharts is lazy (charts only). Split zrender from echarts so each chunk stays < 500 kB;
        // both load in parallel the first time a chart renders.
        codeSplitting: {
          groups: [
            // React first: groups pull in their dependencies, so without this ECharts' chunk would absorb React.
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/, priority: 30 },
            { name: "zrender", test: /node_modules[\\/]zrender[\\/]/, priority: 20 },
            { name: "echarts", test: /node_modules[\\/](echarts|echarts-for-react)[\\/]/, priority: 10 },
            // Small app-wide helpers: keep them out of page chunks so one lazy page never imports another.
            { name: "shared", test: /[\\/]src[\\/](hooks|lib|store)[\\/]/, priority: 5 },
          ],
        },
      },
    },
  },
});
