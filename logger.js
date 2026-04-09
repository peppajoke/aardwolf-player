const { Pool } = require('pg');

class Logger {
  constructor() {
    this.pool = null;
    this.initDb();
  }

  async initDb() {
    try {
      this.pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('railway')
          ? { rejectUnauthorized: false } : false,
        max: 3,
      });
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS game_log (
          id SERIAL PRIMARY KEY,
          type VARCHAR(16) NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW()
        )
      `);
      console.log('Logger database initialized');
    } catch (err) {
      console.error('Logger DB init failed (will log to console only):', err.message);
      this.pool = null;
    }
  }

  async log(type, content) {
    const truncated = (content || '').substring(0, 5000);
    if (this.pool) {
      try {
        await this.pool.query('INSERT INTO game_log (type, content) VALUES ($1, $2)', [type, truncated]);
      } catch {
        // Silently fail DB logging
      }
    }
  }
}

module.exports = { Logger };
