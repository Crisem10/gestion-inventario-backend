require('dotenv').config()
const { Pool } = require('pg')


console.log('[ENV CHECK]', {
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  passwordLength: process.env.POSTGRES_PASSWORD?.length,
})

let pool = null

function getPool() {
  if (!pool) {
    const config = {
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT, 10),
      database: process.env.POSTGRES_DB,
      max: 20,
      idleTimeoutMillis: 60000,
      connectionTimeoutMillis: 5000,
    }

    console.log('[DB] Config:', {
      user: config.user,
      host: config.host,
      port: config.port,
      database: config.database,
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
    const duration = Date.now() - start
    console.log('[DB] Query OK', { duration, rows: res.rowCount })
    return res
  } catch (error) {
    console.error('[DB ERROR]', error.message)
    throw error
  }
}

module.exports = {
  getPool,
  query,
}
