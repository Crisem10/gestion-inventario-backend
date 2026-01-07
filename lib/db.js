require('dotenv').config()
const { Pool } = require('pg')

console.log('[ENV CHECK]', {
  user: process.env.POSTGRES_USER,
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  database: process.env.POSTGRES_DB,
  passwordLength: process.env.POSTGRES_PASSWORD?.length,
})

let pool = null

function getPool() {
  if (!pool) {
    const config = {
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      host: process.env.POSTGRES_HOST,
      port: Number(process.env.POSTGRES_PORT),
      database: process.env.POSTGRES_DB,

      // 🔐 REQUERIDO por Supabase
      ssl: {
        rejectUnauthorized: false,
      },

      max: 20,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 5000,
    }

    console.log('[DB] Config:', {
      user: config.user,
      host: config.host,
      port: config.port,
      database: config.database,
      ssl: true,
    })

    pool = new Pool(config)
  }

  return pool
}

async function query(text, params = []) {
  const pool = getPool()
  const start = Date.now()

  try {
    const res = await pool.query(text, params)
    console.log('[DB] Query OK', {
      duration: Date.now() - start,
      rows: res.rowCount,
    })
    return res
  } catch (error) {
    console.error('[DB ERROR]', error)
    throw error
  }
}

module.exports = {
  getPool,
  query,
}
