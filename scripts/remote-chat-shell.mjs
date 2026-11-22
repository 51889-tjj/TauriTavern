#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import {
    existsSync,
    readFileSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellRoot = path.join(repoRoot, 'src-tauri', 'crates', 'remote-chat-shell');
const tauriCli = path.join(repoRoot, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');
const shellQuote = value => `'${String(value).replaceAll("'", "'\\''")}'`;

if (!existsSync(tauriCli)) {
    console.error(`Missing Tauri CLI at ${tauriCli}. Run pnpm install first.`);
    process.exit(1);
}

const args = process.argv.slice(2).filter((arg, index, list) => !(index === 0 && arg === '--'));
if (args.length === 0 || args[0] !== 'ios') {
    console.error('Usage: node scripts/remote-chat-shell.mjs ios <init|build|dev> [options]');
    process.exit(2);
}

const result = spawnSync(process.execPath, [tauriCli, ...args], {
    cwd: shellRoot,
    stdio: 'inherit',
    env: {
        ...process.env,
        TAURI_APP_PATH: shellRoot,
        TAURI_FRONTEND_PATH: repoRoot,
    },
});

if (result.error) {
    console.error(result.error.message);
    process.exit(1);
}

if (args[1] === 'init' && result.status === 0) {
    const projectFile = path.join(shellRoot, 'gen', 'apple', 'project.yml');
    let project = readFileSync(projectFile, 'utf8');
    const buildPhaseName = '        name: Build Rust Code';
    const buildPhaseIndex = project.indexOf(buildPhaseName);
    const scriptMarker = '      - script: |\n';
    const scriptStart = project.lastIndexOf(scriptMarker, buildPhaseIndex);
    if (buildPhaseIndex < 0 || scriptStart < 0) {
        console.error(`Cannot locate Tauri's Xcode Rust build phase in ${projectFile}.`);
        process.exit(1);
    }

    const buildScript = project.slice(scriptStart + scriptMarker.length, buildPhaseIndex);
    const originalCommand = buildScript
        .split('\n')
        .find(line => line.includes('--platform "${PLATFORM_DISPLAY_NAME:?}"'));
    const commandMarker = 'ios xcode-script';
    const commandIndex = originalCommand?.indexOf(commandMarker) ?? -1;
    if (!originalCommand || commandIndex < 0) {
        console.error(`Cannot locate the generated Tauri Xcode command in ${projectFile}.`);
        process.exit(1);
    }

    const xcodeArguments = originalCommand.slice(commandIndex + commandMarker.length).trim();
    const wrapperPath = path.join(repoRoot, 'scripts', 'remote-chat-shell.mjs');
    const indentation = originalCommand.match(/^\s*/u)?.[0] ?? '';
    const wrapperCommand = `${indentation}${shellQuote(process.execPath)} ${shellQuote(wrapperPath)} ${commandMarker} ${xcodeArguments}`;
    const commandLineIndex = project.indexOf(originalCommand, scriptStart + scriptMarker.length);
    if (commandLineIndex < 0) {
        console.error(`Cannot replace the Tauri Xcode command in ${projectFile}.`);
        process.exit(1);
    }
    project = `${project.slice(0, commandLineIndex)}${wrapperCommand}${project.slice(commandLineIndex + originalCommand.length)}`;
    writeFileSync(projectFile, project);

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
    if (!xcodeProject.includes(wrapperPath)) {
        console.error(`XcodeGen did not apply the shell build wrapper: ${xcodeProjectPath}`);
        process.exit(1);
    }
    console.log(`Configured Xcode Rust build to invoke ${wrapperPath}.`);
}

process.exit(result.status ?? 1);
