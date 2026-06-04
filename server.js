require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const db = require('./db');
const { generateToken, hashPassword, comparePassword, authenticate, authenticateTenant } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "https:"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            connectSrc: ["'self'"]
        }
    }
}));

app.use(cors({
    origin: true,
    credentials: true
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
    message: { error: 'Muitas requisicoes. Tente novamente mais tarde.' }
});
app.use('/api/', limiter);

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ========== AUTH ROUTES ==========

// Register new tenant (gaming house owner)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, phone, address } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Nome, email e palavra-passe sao obrigatorios' });
        }

        // Check if email exists
        const existing = db.prepare('SELECT id FROM tenants WHERE email = ?').get(email);
        if (existing) {
            return res.status(409).json({ error: 'Email ja registado' });
        }

        // Create slug from name
        const slug = name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

        // Check if slug exists
        const existingSlug = db.prepare('SELECT id FROM tenants WHERE slug = ?').get(slug);
        if (existingSlug) {
            return res.status(409).json({ error: 'Nome da casa ja existe. Escolha outro.' });
        }

        const passwordHash = hashPassword(password);

        const result = db.prepare(`
            INSERT INTO tenants (name, slug, email, password_hash, phone, address)
            VALUES (?, ?, ?, ?, ?, ?)
        `).run(name, slug, email, passwordHash, phone || null, address || null);

        const tenantId = result.lastInsertRowid;

        // Create default admin user for this tenant
        const userResult = db.prepare(`
            INSERT INTO users (tenant_id, name, email, password_hash, role)
            VALUES (?, ?, ?, ?, ?)
        `).run(tenantId, name, email, passwordHash, 'admin');

        const token = generateToken({
            id: userResult.lastInsertRowid,
            email,
            tenant_id: tenantId,
            role: 'admin'
        });

        res.status(201).json({
            message: 'Casa de jogos registada com sucesso!',
            token,
            tenant: { id: tenantId, name, slug, email }
        });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: 'Erro ao registar. Tente novamente.' });
    }
});

// Login
app.post('/api/auth/login', (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email e palavra-passe sao obrigatorios' });
        }

        // Try tenant login first
        let user = db.prepare('SELECT * FROM tenants WHERE email = ? AND is_active = 1').get(email);
        let isTenant = true;

        if (!user) {
            // Try user login
            user = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1').get(email);
            isTenant = false;
        }

        if (!user) {
            return res.status(401).json({ error: 'Email ou palavra-passe incorretos' });
        }

        const valid = comparePassword(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Email ou palavra-passe incorretos' });
        }

        const token = generateToken({
            id: user.id,
            email: user.email,
            tenant_id: isTenant ? user.id : user.tenant_id,
            role: isTenant ? 'admin' : user.role
        });

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: isTenant ? 'admin' : user.role,
                tenant_id: isTenant ? user.id : user.tenant_id
            }
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Erro no login. Tente novamente.' });
    }
});

// Get current user
app.get('/api/auth/me', authenticate, (req, res) => {
    try {
        const tenant = db.prepare('SELECT id, name, slug, email, currency, pc_price_hour, console_price_hour, open_time, close_time FROM tenants WHERE id = ?').get(req.tenant_id);

        if (!tenant) {
            return res.status(404).json({ error: 'Tenant nao encontrado' });
        }

        res.json({
            user: req.user,
            tenant
        });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao obter dados' });
    }
});

// ========== DASHBOARD ==========
app.get('/api/dashboard', authenticate, (req, res) => {
    try {
        const tenantId = req.tenant_id;

        const totalStations = db.prepare('SELECT COUNT(*) as count FROM stations WHERE tenant_id = ? AND is_active = 1').get(tenantId);
        const activeStations = db.prepare('SELECT COUNT(*) as count FROM stations WHERE tenant_id = ? AND status = "ocupado"').get(tenantId);

        const todayRevenue = db.prepare(`
            SELECT COALESCE(SUM(cost), 0) as total FROM sessions 
            WHERE tenant_id = ? AND date(start_time) = date('now')
        `).get(tenantId);

        const avgTime = db.prepare(`
            SELECT COALESCE(AVG(duration), 0) as avg FROM sessions 
            WHERE tenant_id = ? AND status = 'finalizada'
        `).get(tenantId);

        const recentActivity = db.prepare(`
            SELECT s.id, c.name as client_name, st.code as station_code, s.game_name, s.start_time, s.duration, s.cost, s.status
            FROM sessions s
            JOIN clients c ON s.client_id = c.id
            JOIN stations st ON s.station_id = st.id
            WHERE s.tenant_id = ?
            ORDER BY s.start_time DESC
            LIMIT 10
        `).all(tenantId);

        res.json({
            totalStations: totalStations.count,
            activeStations: activeStations.count,
            todayRevenue: todayRevenue.total,
            avgTime: Math.round(avgTime.avg / 60),
            recentActivity
        });
    } catch (err) {
        console.error('Dashboard error:', err);
        res.status(500).json({ error: 'Erro ao carregar dashboard' });
    }
});

// ========== STATIONS ==========
app.get('/api/stations', authenticate, (req, res) => {
    try {
        const stations = db.prepare(`
            SELECT s.*, c.name as client_name
            FROM stations s
            LEFT JOIN clients c ON s.current_client_id = c.id
            WHERE s.tenant_id = ? AND s.is_active = 1
            ORDER BY s.code
        `).all(req.tenant_id);
        res.json(stations);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar estacoes' });
    }
});

app.post('/api/stations', authenticate, (req, res) => {
    try {
        const { code, type, specs, price_hour } = req.body;
        const result = db.prepare(`
            INSERT INTO stations (tenant_id, code, type, specs, price_hour)
            VALUES (?, ?, ?, ?, ?)
        `).run(req.tenant_id, code, type, specs, price_hour || 150);

        res.status(201).json({ id: result.lastInsertRowid, message: 'Estacao criada com sucesso' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao criar estacao' });
    }
});

app.put('/api/stations/:id', authenticate, (req, res) => {
    try {
        const { status, current_client_id, current_game } = req.body;
        const sessionStart = status === 'ocupado' ? new Date().toISOString() : null;

        db.prepare(`
            UPDATE stations SET status = ?, current_client_id = ?, current_game = ?, session_start = ?
            WHERE id = ? AND tenant_id = ?
        `).run(status, current_client_id || null, current_game || null, sessionStart, req.params.id, req.tenant_id);

        res.json({ message: 'Estacao atualizada' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar estacao' });
    }
});

// ========== CLIENTS ==========
app.get('/api/clients', authenticate, (req, res) => {
    try {
        const clients = db.prepare(`
            SELECT * FROM clients WHERE tenant_id = ? AND is_active = 1 ORDER BY name
        `).all(req.tenant_id);
        res.json(clients);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar clientes' });
    }
});

app.post('/api/clients', authenticate, (req, res) => {
    try {
        const { name, phone, email } = req.body;
        const result = db.prepare(`
            INSERT INTO clients (tenant_id, name, phone, email)
            VALUES (?, ?, ?, ?)
        `).run(req.tenant_id, name, phone || null, email || null);

        res.status(201).json({ id: result.lastInsertRowid, message: 'Cliente adicionado' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao adicionar cliente' });
    }
});

app.put('/api/clients/:id', authenticate, (req, res) => {
    try {
        const { name, phone, email } = req.body;
        db.prepare(`
            UPDATE clients SET name = ?, phone = ?, email = ? WHERE id = ? AND tenant_id = ?
        `).run(name, phone, email, req.params.id, req.tenant_id);
        res.json({ message: 'Cliente atualizado' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar cliente' });
    }
});

app.delete('/api/clients/:id', authenticate, (req, res) => {
    try {
        db.prepare('UPDATE clients SET is_active = 0 WHERE id = ? AND tenant_id = ?').run(req.params.id, req.tenant_id);
        res.json({ message: 'Cliente removido' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao remover cliente' });
    }
});

// ========== GAMES ==========
app.get('/api/games', authenticate, (req, res) => {
    try {
        const games = db.prepare(`
            SELECT * FROM games WHERE tenant_id = ? AND is_active = 1 ORDER BY name
        `).all(req.tenant_id);
        res.json(games);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar jogos' });
    }
});

app.post('/api/games', authenticate, (req, res) => {
    try {
        const { name, category, developer, platforms } = req.body;
        const result = db.prepare(`
            INSERT INTO games (tenant_id, name, category, developer, platforms)
            VALUES (?, ?, ?, ?, ?)
        `).run(req.tenant_id, name, category, developer, platforms);

        res.status(201).json({ id: result.lastInsertRowid, message: 'Jogo adicionado' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao adicionar jogo' });
    }
});

// ========== SESSIONS ==========
app.get('/api/sessions', authenticate, (req, res) => {
    try {
        const sessions = db.prepare(`
            SELECT s.*, c.name as client_name, st.code as station_code
            FROM sessions s
            JOIN clients c ON s.client_id = c.id
            JOIN stations st ON s.station_id = st.id
            WHERE s.tenant_id = ?
            ORDER BY s.start_time DESC
            LIMIT 50
        `).all(req.tenant_id);
        res.json(sessions);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar sessoes' });
    }
});

app.post('/api/sessions', authenticate, (req, res) => {
    try {
        const { client_id, station_id, game_name } = req.body;
        const station = db.prepare('SELECT * FROM stations WHERE id = ? AND tenant_id = ?').get(station_id, req.tenant_id);

        if (!station || station.status !== 'livre') {
            return res.status(400).json({ error: 'Estacao nao disponivel' });
        }

        const result = db.prepare(`
            INSERT INTO sessions (tenant_id, client_id, station_id, game_name, status)
            VALUES (?, ?, ?, ?, 'ativa')
        `).run(req.tenant_id, client_id, station_id, game_name);

        db.prepare(`
            UPDATE stations SET status = 'ocupado', current_client_id = ?, current_game = ?, session_start = datetime('now')
            WHERE id = ?
        `).run(client_id, game_name, station_id);

        res.status(201).json({ id: result.lastInsertRowid, message: 'Sessao iniciada' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao iniciar sessao' });
    }
});

app.put('/api/sessions/:id/end', authenticate, (req, res) => {
    try {
        const session = db.prepare('SELECT * FROM sessions WHERE id = ? AND tenant_id = ? AND status = "ativa"').get(req.params.id, req.tenant_id);

        if (!session) {
            return res.status(404).json({ error: 'Sessao nao encontrada' });
        }

        const station = db.prepare('SELECT * FROM stations WHERE id = ?').get(session.station_id);
        const startTime = new Date(session.start_time);
        const endTime = new Date();
        const duration = Math.floor((endTime - startTime) / 1000);
        const hours = duration / 3600;
        const cost = Math.ceil(hours * station.price_hour);

        db.prepare(`
            UPDATE sessions SET end_time = datetime('now'), duration = ?, cost = ?, status = 'finalizada'
            WHERE id = ?
        `).run(duration, cost, req.params.id);

        db.prepare(`
            UPDATE stations SET status = 'livre', current_client_id = NULL, current_game = NULL, session_start = NULL
            WHERE id = ?
        `).run(session.station_id);

        db.prepare(`
            UPDATE clients SET total_sessions = total_sessions + 1, total_time = total_time + ?, total_spent = total_spent + ?, last_visit = datetime('now')
            WHERE id = ?
        `).run(duration, cost, session.client_id);

        res.json({ message: 'Sessao finalizada', duration, cost });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao finalizar sessao' });
    }
});

// ========== MESSAGES ==========
app.get('/api/messages', authenticate, (req, res) => {
    try {
        const messages = db.prepare(`
            SELECT m.*, c.name as sender_name
            FROM messages m
            LEFT JOIN clients c ON m.sender_id = c.id AND m.sender_type = 'client'
            WHERE m.tenant_id = ?
            ORDER BY m.created_at DESC
            LIMIT 50
        `).all(req.tenant_id);
        res.json(messages);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar mensagens' });
    }
});

app.post('/api/messages', authenticate, (req, res) => {
    try {
        const { receiver_id, content } = req.body;
        const result = db.prepare(`
            INSERT INTO messages (tenant_id, sender_id, sender_type, receiver_id, content)
            VALUES (?, ?, 'staff', ?, ?)
        `).run(req.tenant_id, req.user.id, receiver_id, content);

        res.status(201).json({ id: result.lastInsertRowid, message: 'Mensagem enviada' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao enviar mensagem' });
    }
});

// ========== TOURNAMENTS ==========
app.get('/api/tournaments', authenticate, (req, res) => {
    try {
        const tournaments = db.prepare(`
            SELECT * FROM tournaments WHERE tenant_id = ? ORDER BY created_at DESC
        `).all(req.tenant_id);
        res.json(tournaments);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar torneios' });
    }
});

app.post('/api/tournaments', authenticate, (req, res) => {
    try {
        const { name, game_id, game_name, max_participants, prize, start_date } = req.body;
        const result = db.prepare(`
            INSERT INTO tournaments (tenant_id, name, game_id, game_name, max_participants, prize, start_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).run(req.tenant_id, name, game_id, game_name, max_participants, prize, start_date);

        res.status(201).json({ id: result.lastInsertRowid, message: 'Torneio criado' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao criar torneio' });
    }
});

// ========== SETTINGS ==========
app.get('/api/settings', authenticate, (req, res) => {
    try {
        const settings = db.prepare(`
            SELECT id, name, slug, email, phone, address, currency, pc_price_hour, console_price_hour, open_time, close_time
            FROM tenants WHERE id = ?
        `).get(req.tenant_id);
        res.json(settings);
    } catch (err) {
        res.status(500).json({ error: 'Erro ao carregar configuracoes' });
    }
});

app.put('/api/settings', authenticate, (req, res) => {
    try {
        const { name, phone, address, currency, pc_price_hour, console_price_hour, open_time, close_time } = req.body;
        db.prepare(`
            UPDATE tenants SET name = ?, phone = ?, address = ?, currency = ?, pc_price_hour = ?, console_price_hour = ?, open_time = ?, close_time = ?, updated_at = datetime('now')
            WHERE id = ?
        `).run(name, phone, address, currency, pc_price_hour, console_price_hour, open_time, close_time, req.tenant_id);

        res.json({ message: 'Configuracoes atualizadas' });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao atualizar configuracoes' });
    }
});

// ========== REPORTS ==========
app.get('/api/reports/usage', authenticate, (req, res) => {
    try {
        const dailyStats = db.prepare(`
            SELECT date(start_time) as date, COUNT(*) as sessions, SUM(cost) as revenue, SUM(duration) as total_time
            FROM sessions WHERE tenant_id = ? AND status = 'finalizada'
            GROUP BY date(start_time) ORDER BY date DESC LIMIT 30
        `).all(req.tenant_id);

        const gameStats = db.prepare(`
            SELECT game_name, COUNT(*) as sessions, SUM(cost) as revenue, SUM(duration) as total_time
            FROM sessions WHERE tenant_id = ? AND status = 'finalizada' AND game_name IS NOT NULL
            GROUP BY game_name ORDER BY sessions DESC LIMIT 10
        `).all(req.tenant_id);

        res.json({ dailyStats, gameStats });
    } catch (err) {
        res.status(500).json({ error: 'Erro ao gerar relatorio' });
    }
});

// ========== SERVE FRONTEND ==========
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Erro interno do servidor' });
});

app.listen(PORT, () => {
    console.log(`Tukwata Ukongo server running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`Database: ${process.env.DB_PATH || './database/tukwata.db'}`);
});
