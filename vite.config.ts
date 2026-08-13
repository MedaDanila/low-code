import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { createSeedDatabase } from './src/shared/api/seed.js'
import { handleGeneratedApiHttpRequest } from './src/shared/lib/generatedApiHttp.js'
import type { AppDatabase } from './src/shared/types/domain.js'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), generatedApiDevServer()],
})

function generatedApiDevServer(): Plugin {
  let apiDatabase = createSeedDatabase()

  return {
    name: 'low-code-generated-api-dev-server',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        if (!url.pathname.startsWith('/api/v1/')) {
          next()
          return
        }

        try {
          if (url.pathname === '/api/v1/__runtime/snapshot') {
            if (req.method !== 'POST') {
              sendJson(res, 405, { error: 'Метод не поддерживается', allowed: ['POST'] })
              return
            }

            const snapshot = await readJsonBody(req)
            if (!isAppDatabase(snapshot)) {
              sendJson(res, 400, { error: 'Некорректный снимок данных' })
              return
            }

            apiDatabase = snapshot
            sendJson(res, 200, {
              ok: true,
              entities: apiDatabase.entitySchemas.length,
              dictionaries: apiDatabase.dictionaries.length,
              objects: apiDatabase.entityObjects.length,
            })
            return
          }

          const body = req.method === 'POST' ? await readJsonBody(req) : undefined
          const result = handleGeneratedApiHttpRequest({
            method: req.method ?? 'GET',
            pathname: url.pathname,
            searchParams: url.searchParams,
            body,
            db: {
              schemas: apiDatabase.entitySchemas,
              objects: apiDatabase.entityObjects,
              dictionaries: apiDatabase.dictionaries,
            },
          })
          sendJson(res, result.status, result.body)
        } catch (cause) {
          sendJson(res, 500, {
            error: 'Не удалось выполнить API-запрос',
            message: cause instanceof Error ? cause.message : 'Неизвестная ошибка',
          })
        }
      })
    },
  }
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body, null, 2))
}

function readJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      raw += chunk
      if (raw.length > 4_000_000) {
        reject(new Error('Тело запроса слишком большое'))
        req.destroy()
      }
    })
    req.on('end', () => {
      if (!raw.trim()) {
        resolve(undefined)
        return
      }

      try {
        resolve(JSON.parse(raw))
      } catch {
        reject(new Error('Тело запроса должно быть валидным JSON'))
      }
    })
    req.on('error', reject)
  })
}

function isAppDatabase(value: unknown): value is AppDatabase {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<Record<keyof AppDatabase, unknown>>
  return Array.isArray(candidate.entitySchemas)
    && Array.isArray(candidate.entityObjects)
    && Array.isArray(candidate.dictionaries)
}
