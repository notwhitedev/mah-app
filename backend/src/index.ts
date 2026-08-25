import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/muhasebe',
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
});

type AppPermission = {
  canAddCustomers: boolean;
  canEditCustomers: boolean;
  canDeleteCustomers: boolean;
  canAddTransactions: boolean;
  canEditTransactions: boolean;
  canDeleteTransactions: boolean;
  canViewCustomers: boolean;
  canViewTransactions: boolean;
  canManageEmployees: boolean;
  canExportPdf: boolean;
};

type AppUser = {
  id: string;
  username: string;
  password: string;
  name: string;
  country: string;
  createdAt: string;
  role?: 'owner' | 'employee' | 'developer';
  ownerId?: string;
  permissions?: AppPermission;
};

type AppTransaction = {
  id: string;
  customerId?: string;
  [key: string]: any;
};

type AppCustomer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  locatedCountry: string;
  originCountry: string;
  ownerId: string;
  totalTransactions: number;
  profit: number;
  loss: number;
  transactions: AppTransaction[];
};

type AppStore = {
  users: AppUser[];
  customers: AppCustomer[];
};

const app = express();
const PORT = Number(process.env.PORT || 3000);

// Veritabanı tablolarını oluştur
async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      name TEXT NOT NULL,
      country TEXT NOT NULL,
      created_at TEXT NOT NULL,
      role TEXT,
      owner_id TEXT,
      permissions JSONB
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      located_country TEXT,
      origin_country TEXT,
      owner_id TEXT NOT NULL,
      total_transactions INTEGER DEFAULT 0,
      profit NUMERIC DEFAULT 0,
      loss NUMERIC DEFAULT 0,
      transactions JSONB DEFAULT '[]'::jsonb
    )
  `);

  // Default developer user'ı ekle
  const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', ['985782980']);
  if (rows.length === 0) {
    await pool.query(`
      INSERT INTO users (id, username, password, name, country, created_at, role, permissions)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      'developer_1',
      '985782980',
      '5316255719',
      'Developer',
      'TR',
      new Date().toISOString(),
      'developer',
      JSON.stringify({
        canAddCustomers: true,
        canEditCustomers: true,
        canDeleteCustomers: true,
        canAddTransactions: true,
        canEditTransactions: true,
        canDeleteTransactions: true,
        canViewCustomers: true,
        canViewTransactions: true,
        canManageEmployees: true,
        canExportPdf: true
      })
    ]);
  }
}



function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
}

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    message: 'Muhasebe API v1.0',
    mode: 'cloud-ready',
    timestamp: new Date().toISOString()
  });
});

app.get('/api', (_req, res) => {
  res.json({ message: 'Muhasebe API v1.0' });
});

app.get('/api/users', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users');
    const users = rows.map(row => ({
      id: row.id,
      username: row.username,
      password: row.password,
      name: row.name,
      country: row.country,
      createdAt: row.created_at,
      role: row.role,
      ownerId: row.owner_id,
      permissions: row.permissions
    }));
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Database error' });
  }
});

app.post('/api/users/login', async (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1 AND password = $2', [username, password]);
    
    if (rows.length === 0) {
      return res.status(401).json({ message: 'Invalid username or password.' });
    }

    const user = rows[0];
    const safeUser = {
      id: user.id,
      username: user.username,
      name: user.name,
      country: user.country,
      createdAt: user.created_at,
      role: user.role,
      ownerId: user.owner_id,
      permissions: user.permissions
    };
    return res.json({ user: safeUser });
  } catch (error) {
    res.status(500).json({ message: 'Database error' });
  }
});

app.post('/api/users', async (req, res) => {
  const { username, password, name, country, role = 'owner', ownerId, permissions } = req.body || {};

  if (!username || !password || !name || !country) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (rows.length > 0) {
      return res.status(409).json({ message: 'Username already exists.' });
    }

    const id = createId('user');
    const defaultPermissions = {
      canAddCustomers: true,
      canEditCustomers: true,
      canDeleteCustomers: true,
      canAddTransactions: true,
      canEditTransactions: true,
      canDeleteTransactions: true,
      canViewCustomers: true,
      canViewTransactions: true,
      canManageEmployees: true,
      canExportPdf: true
    };

    await pool.query(`
      INSERT INTO users (id, username, password, name, country, created_at, role, owner_id, permissions)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `, [id, username, password, name, country, new Date().toISOString(), role, ownerId, JSON.stringify(permissions || defaultPermissions)]);

    const safeUser = {
      id,
      username,
      name,
      country,
      createdAt: new Date().toISOString(),
      role,
      ownerId,
      permissions: permissions || defaultPermissions
    };
    return res.status(201).json({ user: safeUser });
  } catch (error) {
    res.status(500).json({ message: 'Database error' });
  }
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }
    return res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Database error' });
  }
});

app.get('/api/customers', async (req, res) => {
  try {
    const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId : undefined;
    let query = 'SELECT * FROM customers';
    const params: any[] = [];

    if (ownerId) {
      query += ' WHERE owner_id = $1';
      params.push(ownerId);
    }

    const { rows } = await pool.query(query, params);
    const customers = rows.map(row => ({
      id: row.id,
      name: row.name,
      phone: row.phone,
      email: row.email,
      locatedCountry: row.located_country,
      originCountry: row.origin_country,
      ownerId: row.owner_id,
      totalTransactions: row.total_transactions,
      profit: row.profit,
      loss: row.loss,
      transactions: row.transactions
    }));
    res.json(customers);
  } catch (error) {
    res.status(500).json({ message: 'Database error' });
  }
});

app.post('/api/customers', async (req, res) => {
  const { name, phone, email, locatedCountry, originCountry, ownerId, transactions = [] } = req.body || {};

  if (!name || !ownerId) {
    return res.status(400).json({ message: 'Customer name and ownerId are required.' });
  }

  try {
    const id = createId('customer');
    const customer = {
      id,
      name,
      phone: phone || '-',
      email: email || '-',
      locatedCountry: locatedCountry || '-',
      originCountry: originCountry || '-',
      ownerId,
      totalTransactions: Array.isArray(transactions) ? transactions.length : 0,
      profit: 0,
      loss: 0,
      transactions: Array.isArray(transactions) ? transactions : []
    };

    await pool.query(`
      INSERT INTO customers (id, name, phone, email, located_country, origin_country, owner_id, total_transactions, profit, loss, transactions)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `, [id, customer.name, customer.phone, customer.email, customer.locatedCountry, customer.originCountry, customer.ownerId, customer.totalTransactions, customer.profit, customer.loss, JSON.stringify(customer.transactions)]);

    return res.status(201).json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Database error' });
  }
});

app.put('/api/customers/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    const existing = rows[0];
    const updated = {
      ...existing,
      ...req.body,
      located_country: req.body.locatedCountry || existing.located_country,
      origin_country: req.body.originCountry || existing.origin_country,
      owner_id: req.body.ownerId || existing.owner_id,
      total_transactions: req.body.totalTransactions || existing.total_transactions,
      transactions: req.body.transactions || existing.transactions
    };

    await pool.query(`
      UPDATE customers 
      SET name = $1, phone = $2, email = $3, located_country = $4, origin_country = $5, 
          owner_id = $6, total_transactions = $7, profit = $8, loss = $9, transactions = $10
      WHERE id = $11
    `, [updated.name, updated.phone, updated.email, updated.located_country, updated.origin_country, updated.owner_id, updated.total_transactions, updated.profit, updated.loss, JSON.stringify(updated.transactions), req.params.id]);

    const customer = {
      id: updated.id,
      name: updated.name,
      phone: updated.phone,
      email: updated.email,
      locatedCountry: updated.located_country,
      originCountry: updated.origin_country,
      ownerId: updated.owner_id,
      totalTransactions: updated.total_transactions,
      profit: updated.profit,
      loss: updated.loss,
      transactions: updated.transactions
    };
    return res.json(customer);
  } catch (error) {
    res.status(500).json({ message: 'Database error' });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM customers WHERE id = $1', [req.params.id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Customer not found.' });
    }
    return res.status(204).send();
  } catch (error) {
    res.status(500).json({ message: 'Database error' });
  }
});

app.get('/api/customers/:customerId/transactions', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.customerId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found.' });
    }
    return res.json(rows[0].transactions || []);
  } catch (error) {
    res.status(500).json({ message: 'Database error' });
  }
});

app.post('/api/customers/:customerId/transactions', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.customerId]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found.' });
    }

    const customer = rows[0];
    const transaction = {
      id: createId('tx'),
      ...req.body,
      customerId: req.params.customerId,
      status: req.body.status || 'pending'
    };

    const updatedTransactions = [...(customer.transactions || []), transaction];
    await pool.query('UPDATE customers SET transactions = $1, total_transactions = $2 WHERE id = $3', 
      [JSON.stringify(updatedTransactions), updatedTransactions.length, req.params.customerId]);

    return res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ message: 'Database error' });
  }
});

app.listen(PORT, async () => {
  console.log(`Cloud-ready API running on http://localhost:${PORT}`);
  await initializeDatabase();
});
