import {
  PASSWORD_HEADER,
  checkPassword,
  defaultProvider,
  handle,
  json,
  parseSearchText,
  requireMethod,
} from '../server/http.js';

export default {
  fetch: handle(async (request) => {
    requireMethod(request, 'GET');
    checkPassword(request.headers.get(PASSWORD_HEADER));
    const text = parseSearchText(new URL(request.url).searchParams.get('text'));
    return json({ places: await defaultProvider().geocode(text) });
  }),
};
