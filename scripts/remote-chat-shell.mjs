#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
    createReadStream,
    existsSync,
    readFileSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellRoot = path.join(repoRoot, 'src-tauri', 'crates', 'remote-chat-shell');
const shellFrontendRoot = path.join(repoRoot, 'remote-chat-shell');
const tauriCli = path.join(repoRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

if (!existsSync(tauriCli)) {
    console.error(`Missing Tauri CLI at ${tauriCli}. Run pnpm install first.`);
    process.exit(1);
}

const args = process.argv.slice(2).filter((arg, index, list) => !(index === 0 && arg === '--'));
if (args.length === 0) {
    console.error('Usage: node scripts/remote-chat-shell.mjs <web:build|web:dev|ios <init|build|dev>> [options]');
    process.exit(2);
}

const webBuild = args[0] === 'web:build';
const webDev = args[0] === 'web:dev';
const command = webBuild || webDev
    ? path.join(repoRoot, 'node_modules', '@rspack', 'cli', 'bin', 'rspack.js')
    : tauriCli;
const commandArgs = webBuild || webDev
    ? [
        'build',
        '--config',
        path.join(repoRoot, 'rspack.config.js'),
        '--mode',
        webDev ? 'development' : 'production',
        '--env',
        'remoteChatShell',
    ]
    : args;
if (!webBuild && !webDev && args[0] !== 'ios') {
    console.error('Usage: node scripts/remote-chat-shell.mjs <web:build|web:dev|ios <init|build|dev>> [options]');
    process.exit(2);
}

const result = spawnSync(process.execPath, [command, ...commandArgs], {
    cwd: webBuild || webDev ? repoRoot : shellRoot,
    stdio: 'inherit',
    env: {
        ...process.env,
        TAURI_APP_PATH: shellRoot,
        TAURI_FRONTEND_PATH: shellFrontendRoot,
    },
});

if (result.error) {
    console.error(result.error.message);
    process.exit(1);
}

if (!webBuild && !webDev && args[0] === 'ios' && args[1] === 'init' && result.status === 0) {
    const projectFile = path.join(shellRoot, 'gen', 'apple', 'project.yml');
    const project = readFileSync(projectFile, 'utf8');
    const buildPhaseName = '        name: Build Rust Code';
    const buildPhaseIndex = project.indexOf(buildPhaseName);
    const scriptMarker = '      - script: |\n';
    const scriptStart = project.lastIndexOf(scriptMarker, buildPhaseIndex);
    if (buildPhaseIndex < 0 || scriptStart < 0) {
        console.error(`Cannot locate Tauri's Xcode Rust build phase in ${projectFile}.`);
        process.exit(1);
    }

    const xcodeEnvironment = [
        '          export TAURI_APP_PATH="${SRCROOT}/../.."',
        '          export TAURI_FRONTEND_PATH="${SRCROOT}/../../../../../remote-chat-shell"',
        '          echo "Remote Chat Xcode app: $TAURI_APP_PATH"',
        '          echo "Remote Chat Xcode frontend: $TAURI_FRONTEND_PATH"',
        '          cd "$TAURI_FRONTEND_PATH" || exit 1',
        '          if [ ! -f "package.json" ]; then',
        '            echo "error: Remote Chat shell package.json not found in $TAURI_FRONTEND_PATH" >&2',
        '            exit 1',
        '          fi',
        '',
    ].join('\n');
    if (!project.slice(scriptStart, buildPhaseIndex).includes('export TAURI_FRONTEND_PATH=')) {
        const insertAt = scriptStart + scriptMarker.length;
        writeFileSync(projectFile, `${project.slice(0, insertAt)}${xcodeEnvironment}${project.slice(insertAt)}`);
        const xcodegen = spawnSync(
            'xcodegen',
            ['generate', '--spec', projectFile],
            { cwd: path.dirname(projectFile), stdio: 'inherit', env: process.env },
        );
        if (xcodegen.error) {
            console.error(xcodegen.error.message);
            process.exit(1);
        }
        if (xcodegen.status !== 0) {
            process.exit(xcodegen.status ?? 1);
        }
        const xcodeProjectPath = path.join(
            shellRoot,
            'gen',
            'apple',
            'tt-remote-chat-shell.xcodeproj',
            'project.pbxproj',
        );
        const xcodeProject = readFileSync(xcodeProjectPath, 'utf8');
        if (!xcodeProject.includes('TAURI_FRONTEND_PATH')) {
            console.error(`XcodeGen did not apply the standalone shell path settings: ${xcodeProjectPath}`);
            process.exit(1);
        }
        console.log('Xcode Rust build phase now runs from the standalone shell frontend.');
    }
}

if (webDev && result.status === 0) {
    const publicRoot = path.join(repoRoot, 'remote-chat-shell', 'public');
    const mimeTypes = new Map([
        ['.css', 'text/css; charset=utf-8'],
        ['.html', 'text/html; charset=utf-8'],
        ['.js', 'text/javascript; charset=utf-8'],
    ]);
    const server = createServer((request, response) => {
        const pathname = new URL(request.url ?? '/', 'http://localhost').pathname;
        const relative = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
        const filePath = path.resolve(publicRoot, relative);
        if (!filePath.startsWith(`${publicRoot}${path.sep}`)) {
            response.writeHead(400).end('Invalid path');
            return;
        }
        try {
            if (!statSync(filePath).isFile()) {
                response.writeHead(404).end('Not found');
                return;
            }
        } catch {
            response.writeHead(404).end('Not found');
            return;
        }
        response.setHeader('Content-Type', mimeTypes.get(path.extname(filePath)) ?? 'application/octet-stream');
        createReadStream(filePath).pipe(response);
    });
    server.listen(1431, '127.0.0.1');
    process.on('SIGINT', () => server.close(() => process.exit(0)));
    process.on('SIGTERM', () => server.close(() => process.exit(0)));
    server.on('error', error => {
        console.error(`Remote Chat shell dev server failed: ${error.message}`);
        process.exit(1);
    });
    console.log('Remote Chat shell dev server listening on http://localhost:1431');
    await new Promise(() => {});
}

process.exit(result.status ?? 1);
