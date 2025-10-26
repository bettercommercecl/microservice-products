const fs = require('fs')
const path = require('path')

function loadEnvFile() {
  // ✅ Detectar si estamos en build/ o en el directorio raíz
  const isInBuild = __dirname.includes('build')
  const basePath = isInBuild ? path.join(__dirname, '..') : __dirname

  let envPath = path.join(basePath, '.env') // Por defecto .env (Ploi)

  // ✅ Si existe .env, usarlo (Ploi)
  if (fs.existsSync(path.join(basePath, '.env'))) {
    console.log('☁️  Modo Ploi: usando .env')
  }

  // ✅ Cargar variables de entorno usando dotenv
  require('dotenv').config({ path: envPath })

  return process.env
}

// ✅ Función para crear directorio de logs si no existe
function ensureLogsDirectory() {
  const logsDir = path.join(__dirname, 'logs')
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
    console.log(`📁 Directorio de logs creado: ${logsDir}`)
  }
}

// ✅ Función para generar configuración dinámicamente
function generateConfig() {
  const env = loadEnvFile()
  const countryCode = env.COUNTRY_CODE || 'CL'
  const name = `microservicio.productos.${countryCode.toLocaleLowerCase()}`
  const isProduction = env.NODE_ENV === 'production'
  const prefix = isProduction ? 'prod.' : 'dev.'
  const appName = `${prefix}${name}`

  // 🔧 PM2 crea automáticamente el directorio ~/.pm2/logs/

  console.log(`🚀 Configurando PM2 para: ${appName}`)
  console.log(`🔍 Debug - NODE_ENV: "${env.NODE_ENV}", isProduction: ${isProduction}`)
  console.log(`📁 Directorio de logs: ~/.pm2/logs/`)
  console.log(`📄 Archivo de log: ~/.pm2/logs/${appName}.api.log`)

  return {
    apps: [
      // 🚀 API Principal
      {
        name: appName,
        script: 'server.js',
        cwd: './build/bin',
        instances: countryCode === 'CL' && isProduction ? 3 : 1,
        exec_mode: 'cluster',
        env: {
          ...env, // ✅ Pasar todas las variables del .env
          LOG_LEVEL: 'info', // ✅ Forzar nivel de log a info
        },
        // 🔧 Logs en directorio por defecto de PM2 (~/.pm2/logs/)
        log_file: `~/.pm2/logs/${appName}.api.log`,
        error_file: `~/.pm2/logs/${appName}.api-error.log`,
        out_file: `~/.pm2/logs/${appName}.api-out.log`,
        log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
        merge_logs: true,
        // 🔍 Configuración adicional de logs
        log_type: 'json',
        disable_logs: false,
        log_rotate: true,
        log_max_size: '10M',
        log_retain: 7,
        max_memory_restart: '1G',
        restart_delay: 4000,
        autorestart: true,
        max_restarts: 10,
        min_uptime: '10s',
        // Configuración de AdonisJS específica
        kill_timeout: 5000,
        wait_ready: true,
        listen_timeout: 10000,
      },
    ],
  }
}

// ✅ Exportar configuración generada dinámicamente (CommonJS)
module.exports = generateConfig()
