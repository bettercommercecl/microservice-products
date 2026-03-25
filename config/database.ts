import env from '#start/env'
import { defineConfig } from '@adonisjs/lucid'

const readerHost = env.get('DB_READER_HOST') ?? env.get('DB_HOST')
const readerPort = env.get('DB_READER_PORT') ?? env.get('DB_PORT')
const readerUser = env.get('DB_READER_USER') ?? env.get('DB_USER')
const readerPassword = env.get('DB_READER_PASSWORD') ?? env.get('DB_PASSWORD')
const readerDatabase = env.get('DB_READER_DATABASE') ?? env.get('DB_DATABASE')

const dbConfig = defineConfig({
  connection: 'postgres',
  connections: {
    postgres: {
      client: 'pg',
      connection: {
        host: env.get('DB_HOST'),
        port: env.get('DB_PORT'),
        user: env.get('DB_USER'),
        password: env.get('DB_PASSWORD'),
        database: env.get('DB_DATABASE'),
      },
      migrations: {
        naturalSort: true,
        paths: ['database/migrations'],
      },
    },
    postgres_replica: {
      client: 'pg',
      connection: {
        host: readerHost,
        port: readerPort,
        user: readerUser,
        password: readerPassword,
        database: readerDatabase,
      },
      pool: {
        min: 0,
        max: 20,
      },
    },
  },
})

export default dbConfig
