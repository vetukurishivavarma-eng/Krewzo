// Publish an APK update: bump "version" in krewzo-<app>/package.json, then
//   node scripts/release.mjs partner|customer ["what changed"]
// Builds the signed APK and creates GitHub release <app>-v<version>. Installed apps find it on next launch.
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const REPO = 'vetukurishivavarma-eng/Krewzo';
const app = process.argv[2];
if (!['partner', 'customer'].includes(app)) throw new Error('usage: node scripts/release.mjs partner|customer ["notes"]');
const dir = `krewzo-${app}`;
const { version } = JSON.parse(fs.readFileSync(`${dir}/package.json`, 'utf8'));
const tag = `${app}-v${version}`;

const token = execSync('git credential fill', { input: 'protocol=https\nhost=github.com\n\n' }).toString().match(/^password=(.+)$/m)?.[1];
if (!token) throw new Error('No GitHub token from git credential fill');
const gh = async (url, opts = {}) => {
  const r = await fetch(url, { ...opts, headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', ...opts.headers } });
  if (!r.ok) throw new Error(`${r.status} ${url}\n${await r.text()}`);
  return r.json();
};

// Refuse to overwrite: a release tag is what installed apps compare against.
const exists = await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, { headers: { authorization: `Bearer ${token}` } });
if (exists.ok) throw new Error(`${tag} already released. Bump the version in ${dir}/package.json first.`);

process.env.VITE_API_URL ||= 'https://krewzo-api.onrender.com';
execSync(`npm run apk -w ${dir}`, { stdio: 'inherit' });
const apkPath = `${dir}/android/app/build/outputs/apk/release/app-release.apk`;
const name = `krewzo-${app}-${version}.apk`;

const rel = await gh(`https://api.github.com/repos/${REPO}/releases`, {
  method: 'POST',
  body: JSON.stringify({ tag_name: tag, target_commitish: 'main', name: `Krewzo ${app} ${version}`, body: process.argv[3] || '' }),
});
await gh(`https://uploads.github.com/repos/${REPO}/releases/${rel.id}/assets?name=${name}`, {
  method: 'POST', headers: { 'content-type': 'application/vnd.android.package-archive' }, body: fs.readFileSync(apkPath),
});
fs.copyFileSync(apkPath, path.join(os.homedir(), 'Downloads', name));
console.log(`Released ${tag}: ${rel.html_url}\nCopy: Downloads\\${name}`);
