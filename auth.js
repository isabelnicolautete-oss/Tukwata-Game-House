const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const db = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'tukwata-default-secret';
const JWT_EXPIRES = process.env.JWT_EXPIRES_IN || '7d';

function generateToken(user) {
    return jwt.sign(
        { 
            id: user.id, 
            email: user.email, 
            tenant_id: user.tenant_id,
            role: user.role 
        }, 
        JWT_SECRET, 
        { expiresIn: JWT_EXPIRES }
    );
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (err) {
        return null;
    }
}

function hashPassword(password) {
    return bcrypt.hashSync(password, 12);
}

function comparePassword(password, hash) {
    return bcrypt.compareSync(password, hash);
}

// Authentication middleware
function authenticate(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token nao fornecido' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Token invalido ou expirado' });
    }

    // Verify user still exists and is active
    const user = db.prepare('SELECT * FROM users WHERE id = ? AND is_active = 1').get(decoded.id);
    if (!user) {
        return res.status(401).json({ error: 'Utilizador nao encontrado ou inativo' });
    }

    req.user = decoded;
    req.tenant_id = decoded.tenant_id;
    next();
}

// Tenant authentication (for login/registration)
function authenticateTenant(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: 'Token nao fornecido' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
        return res.status(401).json({ error: 'Token invalido ou expirado' });
    }

    req.tenant_id = decoded.tenant_id || decoded.id;
    next();
}

// Optional auth (for public endpoints that may have auth)
function optionalAuth(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) {
        const decoded = verifyToken(token);
        if (decoded) {
            req.user = decoded;
            req.tenant_id = decoded.tenant_id;
        }
    }
    next();
}

module.exports = {
    generateToken,
    verifyToken,
    hashPassword,
    comparePassword,
    authenticate,
    authenticateTenant,
    optionalAuth
};
