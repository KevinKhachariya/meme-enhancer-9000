import { cpSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../..');
const resources = resolve(root, 'resources');
const neutralinoClient = resolve(root, 'neutralino.js');
const neutralinoWindowsBinary = resolve(root, 'bin/neutralino-win_x64.exe');

if (!existsSync(neutralinoClient) || !existsSync(neutralinoWindowsBinary)) {
  execSync('npx neu update', { cwd: root, stdio: 'inherit' });
}

execSync('npm run build', { cwd: root, stdio: 'inherit' });

rmSync(resources, { recursive: true, force: true });
mkdirSync(resources, { recursive: true });
cpSync(resolve(root, 'dist'), resources, { recursive: true });
cpSync(resolve(root, 'neutralino-icon.png'), resolve(resources, 'neutralino-icon.png'));
cpSync(neutralinoClient, resolve(resources, 'neutralino.js'));

const indexPath = resolve(resources, 'index.html');
const indexHtml = readFileSync(indexPath, 'utf8');
const neutralinoBootstrap = '<script src="/neutralino.js"></script><script>window.Neutralino?.init?.();</script>';
writeFileSync(indexPath, indexHtml.replace('</head>', `${neutralinoBootstrap}\n</head>`));
