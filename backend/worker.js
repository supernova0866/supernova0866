import * as api from './functions/api/[[route]].js';
import * as auth from './functions/nova/auth/[[route]].js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const { pathname } = url;

    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return api.onRequest({ request, env, ctx });
    }

    if (pathname.startsWith('/nova/auth')) {
      return auth.onRequest({ request, env, ctx });
    }

    if (pathname === '/oblitus' || pathname === '/oblitus/') {
      return env.ASSETS.fetch(new Request(new URL('/oblitus/oblitus', url), request));
    }

    return env.ASSETS.fetch(request);
  },
};
