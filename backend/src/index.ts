import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

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
const DATA_DIR = path.join(__dirname, '..', 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

const defaultStore: AppStore = {
  users: [
    {
      id: 'developer_1',
      username: '985782980',
      password: '5316255719',
      name: 'Developer',
      country: 'TR',
      createdAt: new Date().toISOString(),
      role: 'developer',
      permissions: {
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
      }
    }
  ],
  customers: []
};

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify(defaultStore, null, 2), 'utf-8');
  }
}

function readStore(): AppStore {
  ensureStore();

  try {
    const raw = fs.readFileSync(STORE_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppStore>;
    return {
      users: Array.isArray(parsed.users) ? parsed.users as AppUser[] : defaultStore.users,
      customers: Array.isArray(parsed.customers) ? parsed.customers as AppCustomer[] : []
    };
  } catch (error) {
    return { ...defaultStore };
  }
}

function writeStore(store: AppStore) {
  ensureStore();
  fs.writeFileSync(STORE_FILE, JSON.stringify(store, null, 2), 'utf-8');
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

app.get('/api/users', (_req, res) => {
  const store = readStore();
  res.json(store.users);
});

app.post('/api/users/login', (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }

  const store = readStore();
  const user = store.users.find((item: AppUser) => item.username === username && item.password === password);

  if (!user) {
    return res.status(401).json({ message: 'Invalid username or password.' });
  }

  const safeUser = { ...user, password: undefined };
  return res.json({ user: safeUser });
});

app.post('/api/users', (req, res) => {
  const { username, password, name, country, role = 'owner', ownerId, permissions } = req.body || {};

  if (!username || !password || !name || !country) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }

  const store = readStore();
  const exists = store.users.some((user: AppUser) => user.username === username);

  if (exists) {
    return res.status(409).json({ message: 'Username already exists.' });
  }

  const user = {
    id: createId('user'),
    username,
    password,
    name,
    country,
    createdAt: new Date().toISOString(),
    role,
    ownerId,
    permissions: permissions || {
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
    }
  };

  store.users.push(user);
  writeStore(store);

  const safeUser = { ...user, password: undefined };
  return res.status(201).json({ user: safeUser });
});

app.delete('/api/users/:id', (req, res) => {
  const store = readStore();
  const remaining = store.users.filter((user: AppUser) => user.id !== req.params.id);

  if (remaining.length === store.users.length) {
    return res.status(404).json({ message: 'User not found.' });
  }

  store.users = remaining;
  writeStore(store);
  return res.status(204).send();
});

app.get('/api/customers', (req, res) => {
  const store = readStore();
  const ownerId = typeof req.query.ownerId === 'string' ? req.query.ownerId : undefined;

  const customers = ownerId
    ? store.customers.filter((item: AppCustomer) => item.ownerId === ownerId)
    : store.customers;

  res.json(customers);
});

app.post('/api/customers', (req, res) => {
  const { name, phone, email, locatedCountry, originCountry, ownerId, transactions = [] } = req.body || {};

  if (!name || !ownerId) {
    return res.status(400).json({ message: 'Customer name and ownerId are required.' });
  }

  const store = readStore();
  const customer = {
    id: createId('customer'),
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

  store.customers.push(customer);
  writeStore(store);
  return res.status(201).json(customer);
});

app.put('/api/customers/:id', (req, res) => {
  const store = readStore();
  const customerIndex = store.customers.findIndex((customer: AppCustomer) => customer.id === req.params.id);

  if (customerIndex === -1) {
    return res.status(404).json({ message: 'Customer not found.' });
  }

  store.customers[customerIndex] = {
    ...store.customers[customerIndex],
    ...req.body
  };

  writeStore(store);
  return res.json(store.customers[customerIndex]);
});

app.delete('/api/customers/:id', (req, res) => {
  const store = readStore();
  const beforeCount = store.customers.length;
  store.customers = store.customers.filter((customer: AppCustomer) => customer.id !== req.params.id);

  if (store.customers.length === beforeCount) {
    return res.status(404).json({ message: 'Customer not found.' });
  }

  writeStore(store);
  return res.status(204).send();
});

app.get('/api/customers/:customerId/transactions', (req, res) => {
  const store = readStore();
  const customer = store.customers.find((item: AppCustomer) => item.id === req.params.customerId);

  if (!customer) {
    return res.status(404).json({ message: 'Customer not found.' });
  }

  return res.json(customer.transactions || []);
});

app.post('/api/customers/:customerId/transactions', (req, res) => {
  const store = readStore();
  const customer = store.customers.find((item: AppCustomer) => item.id === req.params.customerId);

  if (!customer) {
    return res.status(404).json({ message: 'Customer not found.' });
  }

  const transaction = {
    id: createId('tx'),
    ...req.body,
    customerId: req.params.customerId,
    status: req.body.status || 'pending'
  };

  customer.transactions.push(transaction);
  customer.totalTransactions = customer.transactions.length;
  writeStore(store);
  return res.status(201).json(transaction);
});

app.listen(PORT, () => {
  console.log(`Cloud-ready API running on http://localhost:${PORT}`);
});
