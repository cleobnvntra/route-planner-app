import {
  PASSWORD_HEADER,
  checkPassword,
  defaultProvider,
  handle,
  json,
  parsePoints,
  readJson,
  requireMethod,
} from '../server/http.js';

export default {
  fetch: handle(async (request) => {
    requireMethod(request, 'POST');
    checkPassword(request.headers.get(PASSWORD_HEADER));
    const points = parsePoints(await readJson(request));
    return json(await defaultProvider().distanceMatrix(points));
  }),
};
