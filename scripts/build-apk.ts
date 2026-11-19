import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

/**
 * Builds the signed APK: web files, Capacitor sync, then Gradle.
 * Output: release/route-planner-app.apk
 *
 * Bump versionCode in android/app/build.gradle for each release you hand out.
 * Keep signing/ backed up: Android only installs an update signed by the same key.
 */

const root = resolve(import.meta.dirname, '..');
const localAppData = process.env.LOCALAPPDATA ?? '';
const javaHome = process.env.ROUTE_PLANNER_JAVA_HOME ?? join(localAppData, 'route-planner-build', 'jdk-21');
const sdk = process.env.ANDROID_HOME ?? join(localAppData, 'Android', 'Sdk');

function fail(message: string): never {
  console.error(`APK build stopped: ${message}`);
  process.exit(1);
}

if (!existsSync(join(javaHome, 'bin', 'java.exe'))) fail(`Java 21 not found at ${javaHome}`);
if (!existsSync(join(sdk, 'platforms'))) fail(`Android SDK not found at ${sdk}`);

const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_HOME: sdk };

function run(command: string, args: string[], cwd = root): void {
  console.log(`\n> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: true });
  if (result.status !== 0) fail(`"${command}" exited with ${String(result.status)}`);
}

/** Creates the signing key once. Its password never leaves signing/. */
function ensureSigningKey(): void {
  const dir = join(root, 'signing');
  const props = join(dir, 'keystore.properties');
  if (existsSync(props)) return;
  mkdirSync(dir, { recursive: true });
  const password = randomBytes(24).toString('hex');
  const store = 'release.jks';
  console.log('\n> Creating the signing key');
  const result = spawnSync(
    join(javaHome, 'bin', 'keytool.exe'),
    [
      '-genkeypair',
      '-keystore', join(dir, store),
      '-alias', 'release',
      '-keyalg', 'RSA',
      '-keysize', '2048',
      '-validity', '10000',
      '-storepass', password,
      '-keypass', password,
      '-dname', 'CN=Route Planner, O=Route Planner',
    ],
    { env, stdio: ['ignore', 'ignore', 'pipe'] },
  );
  if (result.status !== 0) fail('could not create the signing key');
  writeFileSync(
    props,
    `storeFile=${store}\nstorePassword=${password}\nkeyAlias=release\nkeyPassword=${password}\n`,
  );
}

writeFileSync(join(root, 'android', 'local.properties'), `sdk.dir=${sdk.replaceAll('\\', '/')}\n`);
ensureSigningKey();
run('npx', ['tsc', '--noEmit']);
run('npx', ['vitest', 'run', '--reporter=dot']);
run('npx', ['vite', 'build', '--mode', 'apk']);
run('npx', ['cap', 'sync', 'android']);
// A full path: Windows may be set not to run programs from the current folder.
run(`"${join(root, 'android', 'gradlew.bat')}"`, ['assembleRelease', '--no-daemon', '--console=plain'], join(root, 'android'));

const built = join(root, 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk');
if (!existsSync(built)) fail('Gradle finished but no signed APK was produced');
mkdirSync(join(root, 'release'), { recursive: true });
const output = join(root, 'release', 'route-planner-app.apk');
copyFileSync(built, output);
console.log(`\nAPK ready: ${output} (${(statSync(output).size / 1_048_576).toFixed(1)} MB)`);
