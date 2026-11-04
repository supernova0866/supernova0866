import * as api from './functions/api/[[route]].js';
import * as auth from './functions/nova/auth/[[route]].js';
import { migrate } from './db/schema.js';

let ready;
function ensureSchema(env) {
  if (!ready) {
    ready = (async () => {
      if (!env.TURSO_URL || !env.TURSO_AUTH_TOKEN) return;
      await migrate(env);
    })().catch((e) => {
      ready = undefined;
      console.error('schema migrate failed', e);
    });
  }
  return ready;
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      await ensureSchema(env);
      return api.onRequest({ request, env, ctx });
    }

    if (pathname === '/nova/auth' || pathname.startsWith('/nova/auth/')) {
      await ensureSchema(env);
      return auth.onRequest({ request, env, ctx });
    }

    return env.ASSETS.fetch(request);
  },
};
