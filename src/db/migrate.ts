import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';
import logger from '../utils/logger';
import config from '../config';

/**
 * Database migration utility
 * Applies SQL migrations in sequence from the migrations directory
 */
export const runMigrations = async (): Promise<void> => {
  const pool = new Pool({
    connectionString: config.database.url,
  });


  try {
    // Create migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        applied_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of applied migrations
    const appliedResult = await pool.query('SELECT name FROM migrations ORDER BY id');
    const appliedMigrations = new Set(appliedResult.rows.map(row => row.name));

    // Get all migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
      logger.info('No migrations directory found, creating one');
      fs.mkdirSync(migrationsDir, { recursive: true });
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort(); // Ensure migrations are applied in order

    if (migrationFiles.length === 0) {
      logger.info('No migrations to apply');
      return;
    }

    // Apply migrations that haven't been applied yet
    const client = await pool.connect();
    try {
      for (const file of migrationFiles) {
        if (!appliedMigrations.has(file)) {
          logger.info(`Applying migration: ${file}`);

          const migrationSQL = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

          await client.query('BEGIN');
          try {
            await client.query(migrationSQL);
            await client.query('INSERT INTO migrations (name) VALUES ($1)', [file]);
            await client.query('COMMIT');
            logger.info(`Migration ${file} applied successfully`);
          } catch (error) {
            await client.query('ROLLBACK');
            logger.error(`Error applying migration ${file}:`, error);
            throw error;
          }
        } else {
          logger.debug(`Migration ${file} already applied, skipping`);
        }
      }
    } finally {
      client.release();
    }

    logger.info('All migrations applied successfully');
  } catch (error) {
    logger.error('Error running migrations:', error);
    throw error;
  } finally {
    await pool.end();
  }
};

// Run migrations if this script is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migration process completed');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Migration process failed:', error);
      process.exit(1);
    });
}

export default runMigrations;
