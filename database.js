/**
 * Database Layer - SQLite
 * Handles user, payment, and mute request data
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Database file path
const dbPath = path.join(__dirname, 'viewers.sqlite');

class Database {
    constructor() {
        this.db = null;
    }

    /**
     * Initialize database connection and create tables
     */
    async init() {
        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(dbPath, (err) => {
                if (err) {
                    reject(err);
                } else {
                    console.log('Connected to SQLite database:', dbPath);
                    this.createTables()
                        .then(resolve)
                        .catch(reject);
                }
            });
        });
    }

    /**
     * Create tables if they don't exist
     */
    async createTables() {
        const tables = [
            // Users table
            `CREATE TABLE IF NOT EXISTS users (
                telegram_id TEXT PRIMARY KEY,
                username TEXT DEFAULT '',
                first_name TEXT DEFAULT '',
                access_until INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Payments table
            `CREATE TABLE IF NOT EXISTS payments (
                charge_id TEXT PRIMARY KEY,
                telegram_id TEXT NOT NULL,
                stars INTEGER NOT NULL,
                payload TEXT NOT NULL,
                paid_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Mute requests table
            `CREATE TABLE IF NOT EXISTS mute_requests (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                telegram_id TEXT NOT NULL,
                status TEXT DEFAULT 'pending',
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,
        ];

        return Promise.all(
            tables.map(sql => new Promise((resolve, reject) => {
                this.db.run(sql, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            }))
        );
    }

    /**
     * Run a query
     */
    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.run(sql, params, function(err) {
                if (err) reject(err);
                else resolve(this);
            });
        });
    }

    /**
     * Get a single row
     */
    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.get(sql, params, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });
    }

    /**
     * Get all rows
     */
    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            this.db.all(sql, params, (err, rows) => {
                if (err) reject(err);
                else resolve(rows || []);
            });
        });
    }

    // ========== USER OPERATIONS ==========

    /**
     * Save or update user
     */
    async saveUser(telegramId, username = '', firstName = '') {
        const sql = `
            INSERT INTO users (telegram_id, username, first_name, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(telegram_id) 
            DO UPDATE SET 
                username = ?,
                first_name = ?,
                updated_at = CURRENT_TIMESTAMP
        `;
        return this.run(sql, [telegramId, username, firstName, username, firstName]);
    }

    /**
     * Get user by Telegram ID
     */
    async getUser(telegramId) {
        const sql = `SELECT * FROM users WHERE telegram_id = ?`;
        return this.get(sql, [telegramId]);
    }

    /**
     * Check if user has VIP access
     */
    async hasAccess(telegramId) {
        const sql = `
            SELECT access_until FROM users WHERE telegram_id = ?
        `;
        const user = await this.get(sql, [telegramId]);
        if (!user) return false;
        return this.isAccessValid(user.access_until);
    }

    /**
    * Grant access for the requested duration
     */
    async grantAccess(telegramId, durationSeconds = 30 * 24 * 60 * 60) {
        const user = await this.getUser(telegramId);
        
        // Calculate new access_until timestamp
        // If already has access, extend from current expiration
        // Otherwise, extend from now
        const now = Math.floor(Date.now() / 1000);
        const currentAccessUntil = user?.access_until || 0;
        const base = this.isAccessValid(currentAccessUntil) ? currentAccessUntil : now;
        const newAccessUntil = base + durationSeconds;

        const sql = `
            UPDATE users 
            SET access_until = ?, updated_at = CURRENT_TIMESTAMP
            WHERE telegram_id = ?
        `;
        return this.run(sql, [newAccessUntil, telegramId]);
    }

    /**
     * Check if access timestamp is still valid
     */
    isAccessValid(accessUntil) {
        if (!accessUntil) return false;
        const now = Math.floor(Date.now() / 1000);
        return accessUntil > now;
    }

    // ========== PAYMENT OPERATIONS ==========

    /**
     * Save payment (idempotent by charge_id)
     */
    async savePayment(chargeId, telegramId, stars, payload) {
        const sql = `
            INSERT OR IGNORE INTO payments (charge_id, telegram_id, stars, payload)
            VALUES (?, ?, ?, ?)
        `;
        return this.run(sql, [chargeId, telegramId, stars, payload]);
    }

    /**
     * Check if payment was already processed
     */
    async getPayment(chargeId) {
        const sql = `SELECT * FROM payments WHERE charge_id = ?`;
        return this.get(sql, [chargeId]);
    }

    /**
     * Get user payments
     */
    async getUserPayments(telegramId) {
        const sql = `SELECT * FROM payments WHERE telegram_id = ? ORDER BY paid_at DESC`;
        return this.all(sql, [telegramId]);
    }

    // ========== MUTE REQUEST OPERATIONS ==========

    /**
     * Create mute request
     */
    async createMuteRequest(telegramId) {
        const sql = `
            INSERT INTO mute_requests (telegram_id, status)
            VALUES (?, 'pending')
        `;
        return this.run(sql, [telegramId]);
    }

    /**
     * Get pending mute requests
     */
    async getPendingMuteRequests() {
        const sql = `
            SELECT * FROM mute_requests 
            WHERE status = 'pending'
            ORDER BY created_at DESC
            LIMIT 100
        `;
        return this.all(sql);
    }

    /**
     * Get mute requests for user
     */
    async getUserMuteRequests(telegramId) {
        const sql = `
            SELECT * FROM mute_requests 
            WHERE telegram_id = ?
            ORDER BY created_at DESC
            LIMIT 50
        `;
        return this.all(sql, [telegramId]);
    }

    /**
     * Update mute request status
     */
    async updateMuteRequestStatus(id, status) {
        const sql = `UPDATE mute_requests SET status = ? WHERE id = ?`;
        return this.run(sql, [status, id]);
    }

    // ========== CLEANUP ==========

    /**
     * Close database connection
     */
    close() {
        return new Promise((resolve, reject) => {
            if (this.db) {
                this.db.close((err) => {
                    if (err) reject(err);
                    else resolve();
                });
            } else {
                resolve();
            }
        });
    }
}

module.exports = new Database();
