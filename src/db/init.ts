import fs from 'fs';
import path from 'path';
import pool from './index';
import logger from '../utils/logger';

/**
 * Initialize the database with the schema
 */
export const initializeDatabase = async (): Promise<void> => {
  try {
    // Read the schema file
    const schemaSQL = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');

    // Begin transaction
    const client = await pool.connect();

    try {
      await client.query('BEGIN');

      // Execute the schema SQL
      await client.query(schemaSQL);

      // Create initial admin API key if none exists
      const apiKeyResult = await client.query('SELECT COUNT(*) FROM api_keys');

      if (parseInt(apiKeyResult.rows[0].count, 10) === 0) {
        // In a real app, we would generate a secure random key here
        const initialApiKey = 'admin-' + Math.random().toString(36).substring(2, 15);
        // This is just a placeholder - in a real app we would use bcrypt to hash
        const initialKeyHash = 'placeholder-hash-' + initialApiKey;

        await client.query(
          'INSERT INTO api_keys (name, key_hash, permissions) VALUES ($1, $2, $3)',
          ['Initial Admin Key', initialKeyHash, '{"admin":"admin"}']
        );

        logger.info(`Created initial admin API key: ${initialApiKey}`);
        logger.warn('Please change this key immediately in production!');
      }

      await client.query('COMMIT');
      logger.info('Database initialization completed successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('Database initialization failed:', error);
    throw error;
  }
};

export default initializeDatabase;
