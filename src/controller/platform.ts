/** True in the Android build (`vite build --mode apk`), which has no server. */
export const IS_APK = import.meta.env.MODE === 'apk';
