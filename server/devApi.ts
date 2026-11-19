import { Readable } from 'node:stream';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin } from 'vite';

const ROUTES = new Set(['auth', 'geocode', 'matrix']);

async function toRequest(req: IncomingMessage, url: URL): Promise<Request> {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
  return new Request(url, {
    method: req.method ?? 'GET',
    headers,
    ...(hasBody ? { body: Readable.toWeb(req) as ReadableStream, duplex: 'half' } : {}),
  } as RequestInit);
}

async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

/** Serves /api/* during `npm run dev` with the same handlers Vercel runs. */
export function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'route-planner-dev-api',
    apply: 'serve',
    configureServer(server) {
      for (const key of ['ORS_API_KEY', 'APP_PASSWORD']) {
        const value = env[key];
        if (value !== undefined) process.env[key] = value;
      }
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost');
        const route = /^\/api\/([a-z]+)$/.exec(url.pathname)?.[1];
        if (!route || !ROUTES.has(route)) {
          next();
          return;
        }
        try {
          const module = await server.ssrLoadModule(`/api/${route}.ts`);
          await sendResponse(res, await module.default.fetch(await toRequest(req, url)));
        } catch (err) {
          next(err as Error);
        }
      });
    },
  };
}
