/**
 * Database Abstraction Layer
 * 
 * This module provides a unified interface for database operations,
 * supporting both SQLite (legacy) and Supabase (new).
 * 
 * The module automatically detects which database to use based on
 * environment variables and falls back to SQLite if Supabase is not configured.
 * 
 * Usage:
 *   const db = require('./db');
 *   const users = await db.get('users', { email: 'test@example.com' });
 */

const { supabase, isAvailable, keysToSnakeCase, keysToCamelCase, toSnakeCase } = require('./supabase');
const sqliteDb = require('../database');

// Determine which database to use
const USE_SUPABASE = isAvailable();
const USE_SQLITE = !USE_SUPABASE || process.env.FORCE_SQLITE === 'true';

if (USE_SUPABASE) {
  console.log('📊 Using Supabase database');
} else if (USE_SQLITE) {
  console.log('📊 Using SQLite database (Supabase not configured)');
}

/**
 * Database interface that works with both SQLite and Supabase
 */
class DatabaseAdapter {
  constructor() {
    this.useSupabase = USE_SUPABASE && !USE_SQLITE;
  }

  /**
   * Get a single record
   * @param {string} table - Table name
   * @param {object} conditions - WHERE conditions
   * @returns {Promise<object|null>}
   */
  async get(table, conditions = {}) {
    if (this.useSupabase) {
      let query = supabase.from(table).select('*');
      
      for (const [key, value] of Object.entries(conditions)) {
        query = query.eq(toSnakeCase(key), value);
      }
      
      const { data, error } = await query.single();
      
      if (error) {
        if (error.code === 'PGRST116') {
          // No rows returned
          return null;
        }
        throw new Error(`Database error: ${error.message}`);
      }
      
      return data ? keysToCamelCase(data) : null;
    } else {
      // SQLite fallback
      return new Promise((resolve, reject) => {
        const conditionsStr = Object.keys(conditions).map(k => `${k} = ?`).join(' AND ');
        const values = Object.values(conditions);
        const sql = conditionsStr 
          ? `SELECT * FROM ${table} WHERE ${conditionsStr} LIMIT 1`
          : `SELECT * FROM ${table} LIMIT 1`;
        
        sqliteDb.get(sql, values, (err, row) => {
          if (err) return reject(err);
          resolve(row || null);
        });
      });
    }
  }

  /**
   * Get multiple records
   * @param {string} table - Table name
   * @param {object} conditions - WHERE conditions
   * @param {object} options - Query options (orderBy, limit, etc.)
   * @returns {Promise<array>}
   */
  async all(table, conditions = {}, options = {}) {
    if (this.useSupabase) {
      let query = supabase.from(table).select('*');
      
      for (const [key, value] of Object.entries(conditions)) {
        query = query.eq(toSnakeCase(key), value);
      }
      
      if (options.orderBy) {
        const [column, direction = 'asc'] = options.orderBy.split(' ');
        query = query.order(toSnakeCase(column), { ascending: direction.toLowerCase() !== 'desc' });
      }
      
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      const { data, error } = await query;
      
      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }
      
      return (data || []).map(keysToCamelCase);
    } else {
      // SQLite fallback
      return new Promise((resolve, reject) => {
        const conditionsStr = Object.keys(conditions).map(k => `${k} = ?`).join(' AND ');
        const values = Object.values(conditions);
        let sql = conditionsStr 
          ? `SELECT * FROM ${table} WHERE ${conditionsStr}`
          : `SELECT * FROM ${table}`;
        
        if (options.orderBy) {
          sql += ` ORDER BY ${options.orderBy}`;
        }
        
        if (options.limit) {
          sql += ` LIMIT ${options.limit}`;
        }
        
        sqliteDb.all(sql, values, (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
    }
  }

  /**
   * Insert a record
   * @param {string} table - Table name
   * @param {object} data - Data to insert
   * @returns {Promise<object>} - Inserted record with ID
   */
  async insert(table, data) {
    if (this.useSupabase) {
      const convertedData = keysToSnakeCase(data);
      const { data: inserted, error } = await supabase
        .from(table)
        .insert(convertedData)
        .select()
        .single();
      
      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }
      
      return keysToCamelCase(inserted);
    } else {
      // SQLite fallback
      return new Promise((resolve, reject) => {
        const columns = Object.keys(data);
        const values = Object.values(data);
        const placeholders = columns.map(() => '?').join(', ');
        const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
        
        sqliteDb.run(sql, values, function(err) {
          if (err) return reject(err);
          
          // Fetch the inserted record
          sqliteDb.get(`SELECT * FROM ${table} WHERE id = ?`, [this.lastID], (fetchErr, row) => {
            if (fetchErr) return reject(fetchErr);
            resolve(row);
          });
        });
      });
    }
  }

  /**
   * Update records
   * @param {string} table - Table name
   * @param {object} data - Data to update
   * @param {object} conditions - WHERE conditions
   * @returns {Promise<number>} - Number of rows affected
   */
  async update(table, data, conditions = {}) {
    if (this.useSupabase) {
      const convertedData = keysToSnakeCase(data);
      let query = supabase.from(table).update(convertedData);
      
      for (const [key, value] of Object.entries(conditions)) {
        query = query.eq(toSnakeCase(key), value);
      }
      
      const { data: updated, error } = await query.select();
      
      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }
      
      return updated?.length || 0;
    } else {
      // SQLite fallback
      return new Promise((resolve, reject) => {
        const setClause = Object.keys(data).map(k => `${k} = ?`).join(', ');
        const conditionsStr = Object.keys(conditions).map(k => `${k} = ?`).join(' AND ');
        const values = [...Object.values(data), ...Object.values(conditions)];
        const sql = `UPDATE ${table} SET ${setClause} WHERE ${conditionsStr}`;
        
        sqliteDb.run(sql, values, function(err) {
          if (err) return reject(err);
          resolve(this.changes);
        });
      });
    }
  }

  /**
   * Delete records
   * @param {string} table - Table name
   * @param {object} conditions - WHERE conditions
   * @returns {Promise<number>} - Number of rows deleted
   */
  async delete(table, conditions = {}) {
    if (this.useSupabase) {
      let query = supabase.from(table).delete();
      
      for (const [key, value] of Object.entries(conditions)) {
        query = query.eq(toSnakeCase(key), value);
      }
      
      const { data: deleted, error } = await query.select();
      
      if (error) {
        throw new Error(`Database error: ${error.message}`);
      }
      
      return deleted?.length || 0;
    } else {
      // SQLite fallback
      return new Promise((resolve, reject) => {
        const conditionsStr = Object.keys(conditions).map(k => `${k} = ?`).join(' AND ');
        const values = Object.values(conditions);
        const sql = `DELETE FROM ${table} WHERE ${conditionsStr}`;
        
        sqliteDb.run(sql, values, function(err) {
          if (err) return reject(err);
          resolve(this.changes);
        });
      });
    }
  }

  /**
   * Execute a raw SQL query
   * @param {string} sql - SQL query
   * @param {array} params - Query parameters
   * @returns {Promise<any>}
   */
  async run(sql, params = []) {
    if (this.useSupabase) {
      // For Supabase, we need to use the client directly for complex queries
      const { supabase } = require('./supabase');
      if (!supabase) {
        throw new Error('Supabase client not available');
      }
      
      // Convert SQLite-style placeholders (?) to PostgreSQL ($1, $2, etc.)
      let pgSql = sql;
      const pgParams = [];
      let paramIndex = 1;
      
      pgSql = pgSql.replace(/\?/g, () => {
        pgParams.push(params[paramIndex - 1]);
        return `$${paramIndex++}`;
      });
      
      // Use Supabase's RPC or direct query if available
      // Note: Supabase JS client doesn't support raw SQL directly
      // We'll need to use pg client for complex queries
      throw new Error('Complex raw SQL queries require pg client. Use query builder methods or install pg package.');
    } else {
      return new Promise((resolve, reject) => {
        sqliteDb.run(sql, params, function(err) {
          if (err) return reject(err);
          resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    }
  }

  /**
   * Execute a raw SQL query and return results (for complex queries)
   * @param {string} sql - SQL query
   * @param {array} params - Query parameters
   * @returns {Promise<array>}
   */
  async query(sql, params = []) {
    if (this.useSupabase) {
      // For complex queries with Supabase, we need pg client
      // For now, throw error and suggest using query builder
      throw new Error('Complex queries require pg client. Use query builder methods (get, all) instead.');
    } else {
      return new Promise((resolve, reject) => {
        sqliteDb.all(sql, params, (err, rows) => {
          if (err) return reject(err);
          resolve(rows || []);
        });
      });
    }
  }

  /**
   * Check if using Supabase
   */
  isSupabase() {
    return this.useSupabase;
  }

  /**
   * Check if using SQLite
   */
  isSQLite() {
    return !this.useSupabase;
  }
}

// Export singleton instance
const db = new DatabaseAdapter();

module.exports = db;
