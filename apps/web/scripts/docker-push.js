#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import https from 'https';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');
const repoRootDir = join(rootDir, '..', '..');

// Read .env file (supports export, quotes, and inline comments)
function readEnvFile() {
  const envPath = join(rootDir, '.env');
  if (!existsSync(envPath)) {
    console.warn('[WARN] .env file not found, falling back to process.env');
    return {};
  }

  const envContent = readFileSync(envPath, 'utf8');
  const envVars = {};

  envContent.split(/\r?\n/).forEach((line) => {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    if (trimmed.startsWith('export ')) {
      trimmed = trimmed.slice(7).trim();
    }

    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) return;

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    if (!key) return;

    const isSingleQuoted = value.startsWith("'") && value.endsWith("'");
    const isDoubleQuoted = value.startsWith('"') && value.endsWith('"');

    if (isSingleQuoted || isDoubleQuoted) {
      value = value.slice(1, -1);
    } else {
      // Strip inline comments for unquoted values
      value = value.replace(/\s+#.*$/, '');
    }

    envVars[key] = value;
  });

  return envVars;
}

function requestJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { 'User-Agent': 'docker-push' } }, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          }
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

function parseImageName(imageName) {
  // remove tag if present
  const lastColon = imageName.lastIndexOf(':');
  const lastSlash = imageName.lastIndexOf('/');
  const nameWithoutTag = lastColon > lastSlash ? imageName.slice(0, lastColon) : imageName;

  const parts = nameWithoutTag.split('/');
  let registry = 'docker.io';
  let pathParts = parts;

  const first = parts[0];
  if (first.includes('.') || first.includes(':') || first === 'localhost') {
    registry = first;
    pathParts = parts.slice(1);
  }

  if (pathParts.length === 1) {
    return { registry, namespace: 'library', repo: pathParts[0] };
  }

  const [namespace, ...rest] = pathParts;
  return { registry, namespace, repo: rest.join('/') };
}

function parseSemver(version) {
  if (typeof version !== 'string' || version.trim() === '') return null;
  const clean = version.startsWith('v') ? version.slice(1) : version;
  const match = clean.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  return {
    raw: clean,
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  return a.patch - b.patch;
}

async function getLatestDockerHubVersion(imageName) {
  const { registry, namespace, repo } = parseImageName(imageName);

  if (!['docker.io', 'index.docker.io', 'registry-1.docker.io'].includes(registry)) {
    console.warn(`[WARN] Registry '${registry}' is not Docker Hub. Skipping Hub version lookup.`);
    return null;
  }

  let url = `https://hub.docker.com/v2/repositories/${namespace}/${repo}/tags?page_size=100`;
  const tags = [];
  let pages = 0;

  while (url && pages < 10) {
    const json = await requestJson(url);
    if (Array.isArray(json.results)) {
      tags.push(...json.results.map((r) => r.name));
    }
    url = json.next;
    pages += 1;
  }

  const semvers = tags
    .map(parseSemver)
    .filter((v) => v !== null)
    .sort(compareSemver);

  if (semvers.length === 0) return null;
  return semvers[semvers.length - 1].raw;
}

function bumpVersion(baseVersion, bumpType) {
  const parsed = parseSemver(baseVersion);
  if (!parsed) return null;

  switch (bumpType) {
    case 'major':
      return `${parsed.major + 1}.0.0`;
    case 'minor':
      return `${parsed.major}.${parsed.minor + 1}.0`;
    case 'patch':
    default:
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function isValidBuildArgKey(key) {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(key);
}

async function main() {
  const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    cyan: '\x1b[36m',
    red: '\x1b[31m',
    gray: '\x1b[90m',
  };

  console.log(`\n${colors.bright}═══════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}           Docker Build & Push${colors.reset}`);
  console.log(`${colors.bright}═══════════════════════════════════════════════════${colors.reset}`);

  const fileEnvVars = readEnvFile();
  const envVars = { ...fileEnvVars, ...process.env };
  const imageName = envVars.DOCKER_IMAGE_NAME;

  if (!imageName) {
    console.error(`${colors.red}[ERROR] DOCKER_IMAGE_NAME not found in .env or process.env${colors.reset}`);
    process.exit(1);
  }

  const packageJsonPath = join(rootDir, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  const packageVersion = packageJson.version;

  if (typeof packageVersion !== 'string' || packageVersion.trim() === '') {
    console.error(`${colors.red}[ERROR] package.json is missing a valid version field${colors.reset}`);
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const bumpTypeArg = args.find((arg) => ['major', 'minor', 'patch'].includes(arg));
  const bumpType = bumpTypeArg || 'patch';
  const noCache = args.includes('--no-cache') || args.includes('--no-cached');

  let baseVersion = null;
  try {
    baseVersion = await getLatestDockerHubVersion(imageName);
  } catch (err) {
    console.warn(`${colors.yellow}[WARN] Failed to fetch Docker Hub tags, falling back to package.json${colors.reset}`);
  }

  if (!baseVersion) baseVersion = packageVersion;

  const newVersion = bumpVersion(baseVersion, bumpType);
  if (!newVersion) {
    console.error(`${colors.red}[ERROR] Failed to parse base version '${baseVersion}'${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.cyan}[DOCKER] Docker Image:${colors.reset} ${imageName}`);
  console.log(`${colors.cyan}[PACKAGE] Base Version:${colors.reset}  ${baseVersion}`);
  console.log(`${colors.green}[PACKAGE] New Version:${colors.reset}   ${newVersion}`);
  console.log(`${colors.yellow}[PACKAGE] Bump Type:${colors.reset}     ${bumpType.toUpperCase()}`);
  console.log();

  packageJson.version = newVersion;
  writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
  console.log(`${colors.green}[OK] Updated package.json to version ${newVersion}${colors.reset}`);
  console.log();

  const tags = [`${imageName}:latest`, `${imageName}:${newVersion}`];
  const buildArgKeys = Object.keys(fileEnvVars);
  const invalidBuildArgKeys = buildArgKeys.filter((key) => !isValidBuildArgKey(key));
  const validBuildArgKeys = buildArgKeys.filter((key) => isValidBuildArgKey(key));
  const buildArgs = validBuildArgKeys.map((key) => `--build-arg ${key}=${shellEscape(envVars[key] ?? '')}`);

  console.log(`${colors.cyan}[DOCKER] Building and pushing Docker images...${colors.reset}`);
  console.log(`${colors.yellow}   Tags:${colors.reset}`);
  tags.forEach((tag) => console.log(`     • ${tag}`));
  if (buildArgs.length > 0) {
    console.log(`${colors.yellow}   Build Args:${colors.reset}`);
    console.log(`     • ${buildArgs.length} keys from .env`);
    console.log(`     • ${validBuildArgKeys.join(', ')}`);
  } else {
    console.log(`${colors.yellow}   Build Args:${colors.reset}`);
    console.log('     • none (.env is empty or missing)');
  }
  if (invalidBuildArgKeys.length > 0) {
    console.warn(`${colors.yellow}[WARN] Skipped invalid build-arg keys: ${invalidBuildArgKeys.join(', ')}${colors.reset}`);
  }
  console.log();

  try {
    const command = `docker buildx build --platform linux/amd64 -f apps/web/Dockerfile ${noCache ? '--no-cache ' : ''}${buildArgs.join(' ')} ${tags
      .map((t) => `-t ${t}`)
      .join(' ')} --push .`;

    console.log(`${colors.bright}Running command:${colors.reset}`);
    console.log(command);
    console.log();

    execSync(command, {
      stdio: 'inherit',
      cwd: repoRootDir,
    });

    console.log();
    console.log(`${colors.bright}═══════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.green}[OK] Successfully pushed Docker images!${colors.reset}`);
    console.log(`${colors.cyan}[PACKAGE] Version:${colors.reset} ${newVersion}`);
    console.log(`${colors.cyan}[DOCKER] Image:${colors.reset} ${imageName}`);
    console.log(`${colors.bright}═══════════════════════════════════════════════════${colors.reset}`);
    console.log();

    console.log(`${colors.yellow}[TIP] To use this version:${colors.reset}`);
    console.log(`   docker pull ${imageName}:${newVersion}`);
    console.log(`   docker pull ${imageName}:latest`);
    console.log();
  } catch (error) {
    console.error();
    console.error(`${colors.red}[ERROR] Docker build/push failed${colors.reset}`);

    // Revert version on failure
    packageJson.version = packageVersion;
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
    console.error(`${colors.yellow}[WARN] Reverted package.json to version ${packageVersion}${colors.reset}`);

    process.exit(1);
  }
}

main().catch((err) => {
  console.error(`[ERROR] Unexpected error: ${err?.message || err}`);
  process.exit(1);
});
