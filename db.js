const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './database/tukwata.db';
const dbDir = path.dirname(DB_PATH);

if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize tables
function initDatabase() {
    // Tenants table (each gaming house owner)
    db.exec(`
        CREATE TABLE IF NOT EXISTS tenants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            slug TEXT UNIQUE NOT NULL,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            phone TEXT,
            address TEXT,
            currency TEXT DEFAULT 'Kz',
            pc_price_hour INTEGER DEFAULT 150,
            console_price_hour INTEGER DEFAULT 200,
            open_time TEXT DEFAULT '08:00',
            close_time TEXT DEFAULT '23:00',
            logo_url TEXT,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // Users table (staff members of each tenant)
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT DEFAULT 'staff',
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
            UNIQUE(tenant_id, email)
        )
    `);

    // Stations (gaming stations per tenant)
    db.exec(`
        CREATE TABLE IF NOT EXISTS stations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            code TEXT NOT NULL,
            type TEXT NOT NULL,
            specs TEXT,
            price_hour INTEGER DEFAULT 150,
            status TEXT DEFAULT 'livre',
            current_client_id INTEGER,
            current_game TEXT,
            session_start DATETIME,
            session_timer INTEGER DEFAULT 0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
            UNIQUE(tenant_id, code)
        )
    `);

    // Clients (customers)
    db.exec(`
        CREATE TABLE IF NOT EXISTS clients (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            phone TEXT,
            email TEXT,
            total_sessions INTEGER DEFAULT 0,
            total_time INTEGER DEFAULT 0,
            total_spent INTEGER DEFAULT 0,
            last_visit DATETIME,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        )
    `);

    // Games library
    db.exec(`
        CREATE TABLE IF NOT EXISTS games (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            category TEXT,
            developer TEXT,
            platforms TEXT,
            cover_icon TEXT DEFAULT 'fa-gamepad',
            sessions_count INTEGER DEFAULT 0,
            total_time INTEGER DEFAULT 0,
            revenue INTEGER DEFAULT 0,
            rating REAL DEFAULT 5.0,
            is_active INTEGER DEFAULT 1,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        )
    `);

    // Sessions
    db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            client_id INTEGER NOT NULL,
            station_id INTEGER NOT NULL,
            game_id INTEGER,
            game_name TEXT,
            start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            end_time DATETIME,
            duration INTEGER DEFAULT 0,
            cost INTEGER DEFAULT 0,
            status TEXT DEFAULT 'ativa',
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
            FOREIGN KEY (client_id) REFERENCES clients(id),
            FOREIGN KEY (station_id) REFERENCES stations(id),
            FOREIGN KEY (game_id) REFERENCES games(id)
        )
    `);

    // Messages
    db.exec(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            sender_id INTEGER NOT NULL,
            sender_type TEXT DEFAULT 'staff',
            receiver_id INTEGER,
            content TEXT NOT NULL,
            is_read INTEGER DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        )
    `);

    // Tournaments
    db.exec(`
        CREATE TABLE IF NOT EXISTS tournaments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tenant_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            game_id INTEGER,
            game_name TEXT,
            max_participants INTEGER DEFAULT 16,
            prize INTEGER DEFAULT 0,
            start_date DATE,
            status TEXT DEFAULT 'inscricao',
            bracket_data TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
        )
    `);

    // Tournament participants
    db.exec(`
        CREATE TABLE IF NOT EXISTS tournament_participants (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tournament_id INTEGER NOT NULL,
            client_id INTEGER NOT NULL,
            seed INTEGER,
            FOREIGN KEY (tournament_id) REFERENCES tournaments(id) ON DELETE CASCADE,
            FOREIGN KEY (client_id) REFERENCES clients(id)
        )
    `);

    // Insert demo tenant if none exists
    const tenantCount = db.prepare('SELECT COUNT(*) as count FROM tenants').get();
    if (tenantCount.count === 0) {
        const bcrypt = require('bcryptjs');
        const hash = bcrypt.hashSync('admin123', 10);

        db.prepare(`
            INSERT INTO tenants (name, slug, email, password_hash, currency, pc_price_hour, console_price_hour)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run('Tukwata Ukongo Demo', 'demo', 'admin@tukwata.com', hash, 'Kz', 150, 200);

        const tenantId = db.prepare('SELECT id FROM tenants WHERE slug = ?').get('demo').id;

        // Insert demo stations
        const stations = [
            ['PC-01', 'PC Gamer', 'RTX 4080, i9, 32GB RAM', 150, 'ocupado'],
            ['PS5-02', 'PlayStation 5', 'PS5 Standard, 2 comandos', 200, 'ocupado'],
            ['XBX-03', 'Xbox Series X', 'Xbox Series X, Game Pass', 200, 'livre'],
            ['PC-04', 'PC Gamer', 'RTX 4070, i7, 16GB RAM', 150, 'livre'],
            ['PS5-05', 'PlayStation 5', 'PS5 Digital, 2 comandos', 200, 'manutencao'],
            ['PC-06', 'PC Gamer', 'RTX 4060, i5, 16GB RAM', 120, 'livre'],
            ['XBX-07', 'Xbox Series X', 'Xbox Series X, 4 comandos', 200, 'livre'],
            ['PC-08', 'PC Gamer', 'RTX 4080, i9, 64GB RAM', 180, 'ocupado']
        ];

        const stmt = db.prepare(`
            INSERT INTO stations (tenant_id, code, type, specs, price_hour, status)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stations.forEach(s => stmt.run(tenantId, ...s));

        // Insert demo clients
        const clients = [
            ['Joao Silva', '+244 923 456 789', 24, 2910, 7200],
            ['Maria Santos', '+244 912 345 678', 18, 1935, 4800],
            ['Carlos Mendes', '+244 934 567 890', 12, 1245, 3100],
            ['Ana Paula', '+244 945 678 901', 8, 920, 1800]
        ];

        const clientStmt = db.prepare(`
            INSERT INTO clients (tenant_id, name, phone, total_sessions, total_time, total_spent)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        clients.forEach(c => clientStmt.run(tenantId, ...c));

        // Insert demo games
        const games = [
            ['FIFA 2026', 'Esportes', 'EA Sports', 'PS5, Xbox, PC', 'fa-futbol', 145, 17400, 14500, 4.8],
            ['God of War', 'RPG', 'Sony', 'PS5, PC', 'fa-dragon', 67, 8040, 6700, 4.9],
            ['Call of Duty', 'FPS', 'Activision', 'PS5, Xbox, PC', 'fa-crosshairs', 98, 11760, 7350, 4.5],
            ['Forza Horizon', 'Corrida', 'Microsoft', 'Xbox, PC', 'fa-car', 28, 3360, 2800, 4.7],
            ['Tekken 8', 'Luta', 'Bandai', 'PS5, Xbox, PC', 'fa-fist-raised', 19, 2280, 1900, 4.6],
            ['Fortnite', 'Battle Royale', 'Epic Games', 'Todas', 'fa-ghost', 132, 15840, 9900, 4.4]
        ];

        const gameStmt = db.prepare(`
            INSERT INTO games (tenant_id, name, category, developer, platforms, cover_icon, sessions_count, total_time, revenue, rating)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        games.forEach(g => gameStmt.run(tenantId, ...g));

        // Insert demo sessions
        db.prepare(`
            INSERT INTO sessions (tenant_id, client_id, station_id, game_name, start_time, duration, cost, status)
            VALUES (?, 1, 1, 'FIFA 2026', datetime('now', '-1 hours'), 3600, 150, 'ativa')
        `).run(tenantId);

        db.prepare(`
            INSERT INTO sessions (tenant_id, client_id, station_id, game_name, start_time, duration, cost, status)
            VALUES (?, 2, 2, 'God of War', datetime('now', '-45 minutes'), 2700, 150, 'ativa')
        `).run(tenantId);

        db.prepare(`
            INSERT INTO sessions (tenant_id, client_id, station_id, game_name, start_time, end_time, duration, cost, status)
            VALUES (?, 3, 3, 'Forza Horizon', datetime('now', '-4 hours'), datetime('now', '-40 minutes'), 12000, 500, 'finalizada')
        `).run(tenantId);

        console.log('Demo data inserted successfully');
    }

    console.log('Database initialized successfully');
}

initDatabase();

module.exports = db;
