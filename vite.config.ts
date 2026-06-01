import { readFileSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig, normalizePath } from 'vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import type { Plugin, ResolvedConfig, ServerOptions, UserConfig } from 'vite'


const headers = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'same-origin',
}

const dev = process.env['NODE_ENV'] === 'development'
const audioWorkletQuery = '?worklet'
const audioWorkletIdPrefix = '\0audio-worklet:'

function toDevServerUrl(filePath: string, config: ResolvedConfig)
{
  const normalizedFilePath = normalizePath(filePath)
  const normalizedRoot = normalizePath(config.root)
  const base = config.base === './' ? '/' : config.base

  if (normalizedFilePath.startsWith(`${normalizedRoot}/`))
  {
    return `${base}${normalizedFilePath.slice(normalizedRoot.length + 1)}`
  }

  return `${base}@fs/${normalizedFilePath}`
}

function audioWorkletPlugin(): Plugin
{
  let config: ResolvedConfig

  return {
    name: 'audio-worklet-url',
    enforce: 'pre',
    configResolved(resolvedConfig)
    {
      config = resolvedConfig
    },
    resolveId: {
      filter: { id: /\?worklet$/ },
      async handler(source, importer)
      {
        const sourcePath = source.slice(0, -audioWorkletQuery.length)
        const resolved = await this.resolve(sourcePath, importer, {
          skipSelf: true,
        })

        if (!resolved || resolved.external)
        {
          return null
        }

        return `${audioWorkletIdPrefix}${resolved.id}`
      },
    },
    load: {
      filter: { id: /^\0audio-worklet:/ },
      handler(id)
      {
        const filePath = id.slice(audioWorkletIdPrefix.length)

        if (config.command === 'serve')
        {
          return `export default ${JSON.stringify(toDevServerUrl(filePath, config))}`
        }

        this.addWatchFile(filePath)

        const referenceId = this.emitFile({
          type: 'chunk',
          id: filePath,
          name: basename(filePath, extname(filePath)),
        })

        return `export default import.meta.ROLLUP_FILE_URL_${referenceId}`
      },
    },
  }
}

const https: ServerOptions['https'] = dev ? {
  key: readFileSync(new URL('./localhost-key.pem', import.meta.url)),
  cert: readFileSync(new URL('./localhost.pem', import.meta.url)),
} : undefined

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    audioWorkletPlugin(),
    react(),
    babel({ presets: [ reactCompilerPreset() ] }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    https: { ...https },
    hmr: { protocol: 'wss', clientPort: 9991, port: 9991 },
    headers: {
      ...headers,
    },
  },
  build: {
    minify: 'oxc',
    cssMinify: true,
    modulePreload: { polyfill: false },
  },
  preview: {
    headers: {
      ...headers,
    },
  },
} satisfies UserConfig)
