import { defineConfig } from "vite";

// Страница выкладывается в подпапку сайта (fedorov-n.ru/rekvizity/),
// поэтому пути к файлам относительные.
export default defineConfig({
  base: "./",
  build: { target: "es2022" },
});
