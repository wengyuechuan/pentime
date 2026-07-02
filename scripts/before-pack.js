const { Arch } = require('electron-builder')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { parse, stringify } = require('yaml')

const workspaceConfigPath = path.join(__dirname, '..', 'pnpm-workspace.yaml')

// if you want to add new prebuild binaries packages with different architectures, you can add them here
// please add to allX64 and allArm64 from pnpm-lock.yaml
const packages = [
  '@img/sharp-darwin-arm64',
  '@img/sharp-darwin-x64',
  '@img/sharp-libvips-darwin-arm64',
  '@img/sharp-libvips-darwin-x64',
  '@img/sharp-libvips-linux-arm64',
  '@img/sharp-libvips-linuxmusl-arm64',
  '@img/sharp-libvips-linux-x64',
  '@img/sharp-libvips-linuxmusl-x64',
  '@img/sharp-linux-arm64',
  '@img/sharp-linux-x64',
  '@img/sharp-linuxmusl-arm64',
  '@img/sharp-linuxmusl-x64',
  '@img/sharp-win32-arm64',
  '@img/sharp-win32-x64',
  '@libsql/darwin-arm64',
  '@libsql/darwin-x64',
  '@libsql/linux-arm64-gnu',
  '@libsql/linux-x64-gnu',
  '@libsql/linux-arm64-musl',
  '@libsql/linux-x64-musl',
  '@libsql/win32-x64-msvc',
  '@napi-rs/system-ocr-darwin-arm64',
  '@napi-rs/system-ocr-darwin-x64',
  '@napi-rs/system-ocr-win32-arm64-msvc',
  '@napi-rs/system-ocr-win32-x64-msvc',
  '@napi-rs/canvas-linux-x64-gnu',
  '@napi-rs/canvas-linux-x64-musl',
  '@napi-rs/canvas-linux-arm64-gnu',
  '@napi-rs/canvas-linux-arm64-musl',
  '@napi-rs/canvas-darwin-x64',
  '@napi-rs/canvas-darwin-arm64',
  '@napi-rs/canvas-win32-x64-msvc',
  '@napi-rs/canvas-win32-arm64-msvc',
  '@strongtz/win32-arm64-msvc'
]

const platformToArch = {
  mac: 'darwin',
  windows: 'win32',
  linux: 'linux',
  linuxmusl: 'linuxmusl'
}

const expressRuntimeDependencies = [
  '@tokenizer/token',
  'bytes',
  'core-util-is',
  'dunder-proto',
  'ee-first',
  'es-object-atoms',
  'forwarded',
  'ipaddr.js',
  'is-promise',
  'math-intrinsics',
  'media-typer',
  'negotiator',
  'object-inspect',
  'path-to-regexp',
  'process-nextick-args',
  'setprototypeof',
  'side-channel-list',
  'side-channel-map',
  'side-channel-weakmap',
  'toidentifier',
  'unpipe',
  'util-deprecate',
  'wrappy'
]

function copyNestedRuntimeDependency(rootDir, consumerPackageName, dependencyPackageName) {
  const virtualStoreDir = path.join(rootDir, 'node_modules', '.pnpm')
  if (!fs.existsSync(virtualStoreDir)) {
    return
  }

  for (const entry of fs.readdirSync(virtualStoreDir)) {
    if (!entry.startsWith(`${consumerPackageName}@`)) {
      continue
    }

    const consumerStoreDir = path.join(virtualStoreDir, entry, 'node_modules')
    const dependencyLink = path.join(consumerStoreDir, dependencyPackageName)
    const consumerPackageDir = path.join(consumerStoreDir, consumerPackageName)
    if (!fs.existsSync(dependencyLink) || !fs.existsSync(consumerPackageDir)) {
      continue
    }

    const dependencySource = fs.realpathSync(dependencyLink)
    const nestedDependencyTarget = path.join(consumerPackageDir, 'node_modules', dependencyPackageName)
    fs.rmSync(nestedDependencyTarget, { recursive: true, force: true })
    fs.mkdirSync(path.dirname(nestedDependencyTarget), { recursive: true })
    fs.cpSync(dependencySource, nestedDependencyTarget, { recursive: true })
    if (dependencyPackageName === 'iconv-lite') {
      nestRuntimeDependencyIntoPackage(rootDir, nestedDependencyTarget, 'safer-buffer')
    }
    console.log(`[before-pack] Nested ${dependencyPackageName} into ${consumerPackageName}`)
  }
}

function findPnpmPackageDir(rootDir, dependencyPackageName) {
  const virtualStoreDir = path.join(rootDir, 'node_modules', '.pnpm')
  if (!fs.existsSync(virtualStoreDir)) {
    return null
  }

  for (const entry of fs.readdirSync(virtualStoreDir)) {
    if (!entry.startsWith(`${dependencyPackageName}@`)) {
      continue
    }

    const packageDir = path.join(virtualStoreDir, entry, 'node_modules', dependencyPackageName)
    if (fs.existsSync(packageDir)) {
      return packageDir
    }
  }

  return null
}

function resolveRuntimeDependencySource(rootDir, dependencyPackageName, packageDir, excludedPath) {
  const candidates = [
    path.join(packageDir, 'node_modules', dependencyPackageName),
    path.join(rootDir, 'node_modules', dependencyPackageName),
    findPnpmPackageDir(rootDir, dependencyPackageName)
  ].filter(Boolean)

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      if (excludedPath && path.resolve(candidate) === path.resolve(excludedPath)) {
        continue
      }
      return fs.realpathSync(candidate)
    }
  }

  return null
}

function nestRuntimeDependencyIntoPackage(rootDir, packageDir, dependencyPackageName) {
  if (!fs.existsSync(packageDir)) {
    return
  }

  const nestedDependencyTarget = path.join(packageDir, 'node_modules', dependencyPackageName)
  const dependencySource = resolveRuntimeDependencySource(
    rootDir,
    dependencyPackageName,
    packageDir,
    nestedDependencyTarget
  )
  if (!dependencySource) {
    return
  }

  fs.rmSync(nestedDependencyTarget, { recursive: true, force: true })
  fs.mkdirSync(path.dirname(nestedDependencyTarget), { recursive: true })
  fs.cpSync(dependencySource, nestedDependencyTarget, { recursive: true })
  console.log(`[before-pack] Nested ${dependencyPackageName} into ${path.relative(rootDir, packageDir)}`)
}

function materializeTopLevelRuntimeDependency(rootDir, dependencyPackageName) {
  const topLevelDependencyDir = path.join(rootDir, 'node_modules', dependencyPackageName)
  if (!fs.existsSync(topLevelDependencyDir)) {
    return
  }

  const dependencySource = fs.realpathSync(topLevelDependencyDir)
  if (path.resolve(dependencySource) === path.resolve(topLevelDependencyDir)) {
    return
  }

  const tempDir = `${topLevelDependencyDir}.materialized-tmp`
  fs.rmSync(tempDir, { recursive: true, force: true })
  fs.cpSync(dependencySource, tempDir, { recursive: true })
  fs.rmSync(topLevelDependencyDir, { recursive: true, force: true })
  fs.renameSync(tempDir, topLevelDependencyDir)
  console.log(`[before-pack] Materialized ${dependencyPackageName} for packaging`)
}

function ensureTopLevelRuntimeDependency(rootDir, dependencyPackageName) {
  const topLevelDependencyDir = path.join(rootDir, 'node_modules', dependencyPackageName)
  if (fs.existsSync(topLevelDependencyDir)) {
    materializeTopLevelRuntimeDependency(rootDir, dependencyPackageName)
    return
  }

  const dependencySource = findPnpmPackageDir(rootDir, dependencyPackageName)
  if (!dependencySource) {
    return
  }

  fs.cpSync(dependencySource, topLevelDependencyDir, { recursive: true })
  console.log(`[before-pack] Copied ${dependencyPackageName} to top-level node_modules for packaging`)
}

function embedRuntimeDependency(rootDir, consumerPackageName, consumerRelativeFile, dependencyPackageName) {
  const virtualStoreDir = path.join(rootDir, 'node_modules', '.pnpm')
  if (!fs.existsSync(virtualStoreDir)) {
    return
  }

  for (const entry of fs.readdirSync(virtualStoreDir)) {
    if (!entry.startsWith(`${consumerPackageName}@`)) {
      continue
    }

    const consumerStoreDir = path.join(virtualStoreDir, entry, 'node_modules')
    const dependencyLink = path.join(consumerStoreDir, dependencyPackageName)
    const consumerPackageDir = path.join(consumerStoreDir, consumerPackageName)
    const consumerFile = path.join(consumerPackageDir, consumerRelativeFile)
    if (!fs.existsSync(dependencyLink) || !fs.existsSync(consumerFile)) {
      continue
    }

    const dependencySource = fs.realpathSync(dependencyLink)
    const embeddedDir = path.join(path.dirname(consumerFile), dependencyPackageName)
    fs.rmSync(embeddedDir, { recursive: true, force: true })
    fs.cpSync(dependencySource, embeddedDir, { recursive: true })
    if (dependencyPackageName === 'iconv-lite') {
      nestRuntimeDependencyIntoPackage(rootDir, embeddedDir, 'safer-buffer')
    }

    const original = fs.readFileSync(consumerFile, 'utf-8')
    const patched = original.replace(/require\((['"])iconv-lite\1\)/g, 'require("./iconv-lite")')
    if (patched !== original) {
      fs.writeFileSync(consumerFile, patched)
    }
    console.log(`[before-pack] Embedded ${dependencyPackageName} into ${consumerPackageName}/${consumerRelativeFile}`)
  }
}

function ensureIconvLiteRuntimeDependencies(rootDir) {
  // electron-builder can miss pnpm's iconv-lite junction while packaging jsdom/Express transitive deps.
  materializeTopLevelRuntimeDependency(rootDir, 'safer-buffer')
  materializeTopLevelRuntimeDependency(rootDir, 'iconv-lite')
  nestRuntimeDependencyIntoPackage(rootDir, path.join(rootDir, 'node_modules', 'iconv-lite'), 'safer-buffer')
  for (const consumerPackageName of ['whatwg-encoding', 'encoding', 'body-parser', 'raw-body']) {
    copyNestedRuntimeDependency(rootDir, consumerPackageName, 'iconv-lite')
  }
  embedRuntimeDependency(rootDir, 'whatwg-encoding', path.join('lib', 'whatwg-encoding.js'), 'iconv-lite')
  embedRuntimeDependency(rootDir, 'encoding', path.join('lib', 'encoding.js'), 'iconv-lite')
  embedRuntimeDependency(rootDir, 'body-parser', path.join('lib', 'read.js'), 'iconv-lite')
  embedRuntimeDependency(rootDir, 'raw-body', 'index.js', 'iconv-lite')
}

function ensureWhatwgUrlRuntimeDependencies(rootDir) {
  // whatwg-url requires these packages by name at runtime; make pnpm's nested junctions real before asar packing.
  materializeTopLevelRuntimeDependency(rootDir, 'punycode')
  materializeTopLevelRuntimeDependency(rootDir, 'tr46')
  materializeTopLevelRuntimeDependency(rootDir, 'webidl-conversions')
  nestRuntimeDependencyIntoPackage(rootDir, path.join(rootDir, 'node_modules', 'tr46'), 'punycode')
  copyNestedRuntimeDependency(rootDir, 'tr46', 'punycode')
  copyNestedRuntimeDependency(rootDir, 'whatwg-url', 'tr46')
  copyNestedRuntimeDependency(rootDir, 'whatwg-url', 'webidl-conversions')
}

function ensureExpressRuntimeDependencies(rootDir) {
  // electron-builder can miss pnpm-only transitive links in the Express runtime chain.
  for (const dependencyName of expressRuntimeDependencies) {
    ensureTopLevelRuntimeDependency(rootDir, dependencyName)
  }
  copyNestedRuntimeDependency(rootDir, 'on-finished', 'ee-first')
}

exports.default = async function (context) {
  const arch = context.arch === Arch.arm64 ? 'arm64' : 'x64'
  const platformName = context.packager.platform.name
  const platform = platformToArch[platformName]

  ensureIconvLiteRuntimeDependencies(path.join(__dirname, '..'))
  ensureWhatwgUrlRuntimeDependencies(path.join(__dirname, '..'))
  ensureExpressRuntimeDependencies(path.join(__dirname, '..'))

  // Download rtk binary for the target platform
  try {
    console.log(`Downloading rtk binary for ${platform}-${arch}...`)
    execSync(`node "${path.join(__dirname, 'download-rtk-binaries.js')}" ${platform} ${arch}`, { stdio: 'inherit' })
  } catch (error) {
    console.warn(`Warning: rtk binary download failed (non-fatal): ${error.message}`)
  }

  const downloadPackages = async () => {
    // Skip if target platform and architecture match current system
    if (platform === process.platform && arch === process.arch) {
      console.log(`Skipping install: target (${platform}/${arch}) matches current system`)
      return
    }

    console.log(`Installing packages for target platform=${platform} arch=${arch}...`)

    // Backup and modify pnpm-workspace.yaml to add target platform support
    const originalWorkspaceConfig = fs.readFileSync(workspaceConfigPath, 'utf-8')
    const workspaceConfig = parse(originalWorkspaceConfig)

    // Add target platform to supportedArchitectures.os
    if (!workspaceConfig.supportedArchitectures.os.includes(platform)) {
      workspaceConfig.supportedArchitectures.os.push(platform)
    }

    // Add target architecture to supportedArchitectures.cpu
    if (!workspaceConfig.supportedArchitectures.cpu.includes(arch)) {
      workspaceConfig.supportedArchitectures.cpu.push(arch)
    }

    const modifiedWorkspaceConfig = stringify(workspaceConfig)
    console.log('Modified workspace config:', modifiedWorkspaceConfig)
    fs.writeFileSync(workspaceConfigPath, modifiedWorkspaceConfig)

    try {
      execSync(`pnpm install`, { stdio: 'inherit' })
    } finally {
      // Restore original pnpm-workspace.yaml
      fs.writeFileSync(workspaceConfigPath, originalWorkspaceConfig)
    }
  }

  await downloadPackages()

  const excludePackages = async (packagesToExclude) => {
    // 从项目根目录的 electron-builder.yml 读取 files 配置，避免多次覆盖配置导致出错
    const electronBuilderConfigPath = path.join(__dirname, '..', 'electron-builder.yml')
    const electronBuilderConfig = parse(fs.readFileSync(electronBuilderConfigPath, 'utf-8'))
    let filters = electronBuilderConfig.files

    // add filters for other architectures (exclude them)
    filters.push(...packagesToExclude)

    context.packager.config.files[0].filter = filters
  }

  const arm64KeepPackages = packages.filter((p) => p.includes('arm64') && p.includes(platform))
  const arm64ExcludePackages = packages
    .filter((p) => !arm64KeepPackages.includes(p))
    .map((p) => '!node_modules/' + p + '/**')

  const x64KeepPackages = packages.filter((p) => p.includes('x64') && p.includes(platform))
  const x64ExcludePackages = packages
    .filter((p) => !x64KeepPackages.includes(p))
    .map((p) => '!node_modules/' + p + '/**')

  const excludeRipgrepFilters = ['arm64-darwin', 'arm64-linux', 'x64-darwin', 'x64-linux', 'x64-win32']
    .filter((f) => {
      // On Windows ARM64, also keep x64-win32 for emulation compatibility
      if (platform === 'win32' && context.arch === Arch.arm64 && f === 'x64-win32') {
        return false
      }
      return f !== `${arch}-${platform}`
    })
    .map((f) => '!node_modules/@anthropic-ai/claude-agent-sdk/vendor/ripgrep/' + f + '/**')

  // Exclude rtk binaries for other platform-arch combinations
  const currentPlatformKey = `${platform}-${arch}`
  const allRtkPlatforms = ['darwin-arm64', 'darwin-x64', 'linux-x64', 'linux-arm64', 'win32-x64']
  const excludeRtkFilters = allRtkPlatforms
    .filter((p) => p !== currentPlatformKey)
    .map((p) => '!resources/binaries/' + p + '/**')

  if (context.arch === Arch.arm64) {
    await excludePackages([...arm64ExcludePackages, ...excludeRipgrepFilters, ...excludeRtkFilters])
  } else {
    await excludePackages([...x64ExcludePackages, ...excludeRipgrepFilters, ...excludeRtkFilters])
  }
}
