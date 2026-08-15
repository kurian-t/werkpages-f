import { defineConfig, Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import istanbul from "vite-plugin-istanbul";
import path from "path";
import { createServer } from "./server";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  // Vitest picks up *.spec.ts everywhere by default, which would sweep in the
  // Playwright e2e specs under tests/. Scope unit tests to client/shared.
  test: {
    include: ["client/**/*.{test,spec}.{ts,tsx}", "shared/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["client/**/*.{ts,tsx}"],
      exclude: [
        "client/**/*.{spec,test}.{ts,tsx}",
        "client/components/ui/**",
      ],
    },
  },
  server: {
    host: "::",
    port: 8080,
    proxy: {
      "/api": {
        target: "http://localhost:8888",
        changeOrigin: true,
      },
    },
    fs: {
      allow: [".", "./client", "./shared"],
      deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "server/**"],
    },
  },
  build: {
    outDir: "dist/spa",
    // Source maps required so nyc can map coverage back to source files
    sourcemap: process.env.PLAYWRIGHT_COVERAGE === "true" ? "inline" : false,
  },
  plugins: [
    react(),
    expressPlugin(),
    // Only instrument for coverage when building the Playwright coverage build
    process.env.PLAYWRIGHT_COVERAGE === "true" && istanbul({
      include: "client/**",
      exclude: [
        "node_modules", "tests/",
        "client/**/*.{spec,test}.{ts,tsx}",
        "client/components/ui/**",
        // Dead / unreachable code — no page calls useData(); use-toast is a Radix
        // internal state machine not exercised by any component under test.
        "client/contexts/DataContext.tsx",
        "client/hooks/use-toast.ts",
      ],
      extension: [".ts", ".tsx"],
      requireEnv: false,
      forceBuildInstrument: true,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client"),
      "@shared": path.resolve(__dirname, "./shared"),
    },
  },
}));

function expressPlugin(): Plugin {
  return {
    name: "express-plugin",
    apply: "serve", // Only apply during development (serve mode)
    configureServer(server) {
      const app = createServer();

      // Add Express app as middleware to Vite dev server
      server.middlewares.use(app);
    },
  };
}
