// Node 24 запускает .ts сам, но не ищет файл по импорту без расширения ("./schema").
// Подключение: node --import ./scripts/labeling/ts-resolve.mjs scripts/labeling/<скрипт>.ts
import { registerHooks } from "node:module";

registerHooks({
  resolve(spec, ctx, next) {
    try {
      return next(spec, ctx);
    } catch (e) {
      if (spec.startsWith(".") && !/\.[cm]?[jt]s$/.test(spec)) return next(`${spec}.ts`, ctx);
      throw e;
    }
  },
});
