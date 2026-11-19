import {registerHooks} from 'node:module';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';

// Support the application's extensionless TypeScript imports in Node's test runner.
registerHooks({
  resolve(specifier, context, nextResolve) {
    // Next resolves this marker to its empty server implementation.
    if (specifier === "server-only") return nextResolve("next/dist/compiled/server-only/empty.js", context);
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(specifier, context.parentURL);
      for (const suffix of ['.ts', '/index.ts']) {
        if (existsSync(fileURLToPath(url) + suffix)) {
          return nextResolve(url.href + suffix, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
