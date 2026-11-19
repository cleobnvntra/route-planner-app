import * as directApi from './directApi.js';
import { IS_APK } from './platform.js';
import * as serverApi from './serverApi.js';

export { ApiError } from './apiError.js';

/** The one switch between the APK and a hosted website. */
const backend = IS_APK ? directApi : serverApi;

export const { login, geocode, distanceMatrix } = backend;
