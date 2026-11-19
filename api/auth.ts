import { checkPassword, handle, json, readJson, requireMethod } from '../server/http.js';

export default {
  fetch: handle(async (request) => {
    requireMethod(request, 'POST');
    const body = (await readJson(request)) as { password?: unknown } | null;
    checkPassword(typeof body?.password === 'string' ? body.password : null);
    return json({ ok: true });
  }),
};
