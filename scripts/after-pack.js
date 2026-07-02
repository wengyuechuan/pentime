const fs = require('fs')
const os = require('os')
const path = require('path')
const { createRequire } = require('module')
const { pathToFileURL } = require('url')
const asar = require('@electron/asar')

function assertAsarContains(appOutDir, packageName, expectedEntries) {
  const asarPath = path.join(appOutDir, 'resources', 'app.asar')
  if (!fs.existsSync(asarPath)) {
    return
  }

  const entries = asar.listPackage(asarPath).map((entry) => entry.replace(/\\/g, '/').replace(/^\/+/, ''))

  const hasExpectedEntry = expectedEntries.some((expectedEntry) => entries.includes(expectedEntry))

  if (!hasExpectedEntry) {
    throw new Error(`Packaged app.asar is missing runtime dependency: ${packageName}`)
  }
}

const runtimeDependencyAssertions = {
  '@tokenizer/token': ['node_modules/@tokenizer/token/package.json'],
  bytes: ['node_modules/bytes/index.js'],
  'core-util-is': ['node_modules/core-util-is/lib/util.js'],
  'dunder-proto': ['node_modules/dunder-proto/get.js'],
  'ee-first': ['node_modules/ee-first/index.js', 'node_modules/on-finished/node_modules/ee-first/index.js'],
  'es-object-atoms': ['node_modules/es-object-atoms/index.js'],
  forwarded: ['node_modules/forwarded/index.js'],
  'ipaddr.js': ['node_modules/ipaddr.js/lib/ipaddr.js'],
  'is-promise': ['node_modules/is-promise/index.js'],
  'math-intrinsics': ['node_modules/math-intrinsics/isFinite.js'],
  'media-typer': ['node_modules/media-typer/index.js'],
  negotiator: ['node_modules/negotiator/index.js'],
  'object-inspect': ['node_modules/object-inspect/index.js'],
  'path-to-regexp': ['node_modules/path-to-regexp/dist/index.js'],
  'process-nextick-args': ['node_modules/process-nextick-args/index.js'],
  setprototypeof: ['node_modules/setprototypeof/index.js'],
  'side-channel-list': ['node_modules/side-channel-list/index.js'],
  'side-channel-map': ['node_modules/side-channel-map/index.js'],
  'side-channel-weakmap': ['node_modules/side-channel-weakmap/index.js'],
  toidentifier: ['node_modules/toidentifier/index.js'],
  unpipe: ['node_modules/unpipe/index.js'],
  'util-deprecate': ['node_modules/util-deprecate/node.js'],
  wrappy: ['node_modules/wrappy/wrappy.js']
}

async function assertIsolatedRuntimeRequires(appOutDir) {
  const asarPath = path.join(appOutDir, 'resources', 'app.asar')
  if (!fs.existsSync(asarPath)) {
    return
  }

  const extractDir = path.join(os.tmpdir(), `pentime-runtime-audit-${Date.now()}`)
  fs.rmSync(extractDir, { recursive: true, force: true })
  fs.mkdirSync(extractDir, { recursive: true })

  try {
    asar.extractAll(asarPath, extractDir)
    const requireFromPackagedMain = createRequire(path.join(extractDir, 'out', 'main', 'index.js'))

    const proxyAddr = requireFromPackagedMain('proxy-addr')
    proxyAddr.compile('loopback')

    requireFromPackagedMain('express')()
    requireFromPackagedMain('officeparser')
    requireFromPackagedMain('os-proxy-config')
    requireFromPackagedMain('swagger-ui-express')
    requireFromPackagedMain('jsdom')
    requireFromPackagedMain('turndown')
    requireFromPackagedMain('sharp')
    requireFromPackagedMain('tesseract.js')
    requireFromPackagedMain('font-list')
    requireFromPackagedMain('node-stream-zip')

    const claudeAgentEntry = requireFromPackagedMain.resolve('@anthropic-ai/claude-agent-sdk')
    const claudeAgentSdk = await import(pathToFileURL(claudeAgentEntry).href)
    if (typeof claudeAgentSdk.query !== 'function') {
      throw new Error('@anthropic-ai/claude-agent-sdk did not expose query()')
    }
  } catch (error) {
    throw new Error(`Packaged app.asar failed isolated runtime dependency audit: ${error.message}`)
  } finally {
    try {
      fs.rmSync(extractDir, { recursive: true, force: true })
    } catch (error) {
      console.warn(`[after-pack] Could not remove runtime audit temp directory: ${extractDir} (${error.message})`)
    }
  }
}

exports.default = async function (context) {
  const platform = context.packager.platform.name
  if (platform === 'windows') {
    fs.rmSync(path.join(context.appOutDir, 'LICENSE.electron.txt'), { force: true })
    fs.rmSync(path.join(context.appOutDir, 'LICENSES.chromium.html'), { force: true })
    assertAsarContains(context.appOutDir, 'iconv-lite', [
      'node_modules/iconv-lite/lib/index.js',
      'node_modules/whatwg-encoding/lib/iconv-lite/lib/index.js',
      'node_modules/encoding/lib/iconv-lite/lib/index.js',
      'node_modules/body-parser/lib/iconv-lite/lib/index.js',
      'node_modules/raw-body/iconv-lite/lib/index.js'
    ])
    assertAsarContains(context.appOutDir, 'safer-buffer', ['node_modules/safer-buffer/safer.js'])
    for (const [packageName, expectedEntries] of Object.entries(runtimeDependencyAssertions)) {
      assertAsarContains(context.appOutDir, packageName, expectedEntries)
    }
    assertAsarContains(context.appOutDir, 'tr46', [
      'node_modules/tr46/index.js',
      'node_modules/whatwg-url/node_modules/tr46/index.js'
    ])
    assertAsarContains(context.appOutDir, 'webidl-conversions', [
      'node_modules/webidl-conversions/lib/index.js',
      'node_modules/whatwg-url/node_modules/webidl-conversions/lib/index.js'
    ])
    assertAsarContains(context.appOutDir, 'punycode', [
      'node_modules/punycode/punycode.js',
      'node_modules/whatwg-url/node_modules/tr46/node_modules/punycode/punycode.js'
    ])
    await assertIsolatedRuntimeRequires(context.appOutDir)
  }
}
