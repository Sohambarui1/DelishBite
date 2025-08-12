const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');

const app = express();

// ✅ Middleware Setup
app.use(cors({
  origin: ['http://localhost', 'http://127.0.0.1'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(bodyParser.json());

// ✅ MySQL Connection
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: 'Soham@123',
  database: 'delishbite',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

db.connect(err => {
  if (err) {
    console.error("❌ MySQL connection failed:", err);
    process.exit(1);
  }
  console.log('✅ Connected to MySQL');
});

// ✅ Test Endpoint
app.get('/test', (req, res) => {
  res.json({ 
    status: 'Server is working!',
    timestamp: new Date().toISOString()
  });
});

// ✅ User Signup
app.post('/signup', async (req, res) => {
  const { name, email, password } = req.body;
  if (!email || !password || !name) {
    return res.status(400).json({ error: 'Missing fields' });
  }

  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length > 0) return res.status(400).json({ error: 'Email already registered' });

    const hashedPassword = await bcrypt.hash(password, 10);
    db.query(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
      [name, email, hashedPassword],
      (err, result) => {
        if (err) return res.status(500).json({ error: 'Signup failed' });
        res.json({ success: true, user: { id: result.insertId, name, email } });
      }
    );
  });
});

// ✅ User Login
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(401).json({ error: 'User not found' });

    const user = results[0];
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  });
});

// ✅ Place Order
app.post('/orders', (req, res) => {
  const { userId, items, total, address, paymentMethod } = req.body;

  if (!userId || !Array.isArray(items) || !address || !paymentMethod) {
    return res.status(400).json({ success: false, error: 'Missing required order fields.' });
  }

  const sql = `
    INSERT INTO orders (user_id, items, total, address, payment_method)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.query(
    sql,
    [userId, JSON.stringify(items), total, address, paymentMethod],
    (err, result) => {
      if (err) {
        console.error('Error inserting order:', err);
        return res.status(500).json({ success: false, error: 'Database insert failed' });
      }

      res.json({ success: true, orderId: result.insertId });
    }
  );
});


// ✅ Debug: Show Last 5 Orders (Safe Debugging)
app.get('/debug/orders', (req, res) => {
  db.query(
    'SELECT id, user_id, delivery_address, payment_method FROM orders ORDER BY id DESC LIMIT 5',
    (err, results) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ recentOrders: results });
    }
  );
});

const safeJsonParse = (jsonStr) => {
  try {
    return JSON.parse(jsonStr);
  } catch (err) {
    console.error("Failed to parse JSON:", err);
    return [];
  }
};

const formatAddress = (address) => {
  if (!address || address === 'Address not provided') return 'Not specified';
  return address;
};

const formatPaymentMethod = (method) => {
  if (!method || method === 'Payment method not specified') return 'Not specified';
  return method.charAt(0).toUpperCase() + method.slice(1);
};

// ✅ Route to get orders for a user
app.get('/orders/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);

  if (isNaN(userId)) {
    return res.status(400).json({ success: false, error: 'Invalid user ID format' });
  }

  const query = `
    SELECT 
      id,
      order_time,
      items,
      total,
      delivery_address,
      payment_method,
      DATE_FORMAT(order_time, '%Y-%m-%d %H:%i:%s') AS formatted_date
    FROM orders
    WHERE user_id = ?
    ORDER BY order_time DESC
  `;

  db.query(query, [userId], (err, results) => {
    if (err) {
      console.error('Database error:', err);
      return res.status(500).json({ success: false, error: 'Database query failed' });
    }

    const orders = results.map(order => ({
      ...order,
      items: safeJsonParse(order.items),
      formatted_address: formatAddress(order.delivery_address),
      formatted_payment: formatPaymentMethod(order.payment_method)
    }));

    res.json({ success: true, orders });
  });
});


// ✅ Global Error Handler
app.use((err, req, res, next) => {
  console.error('Unhandled server error:', err.stack);
  res.status(500).json({ success: false, error: 'Internal server error' });
});

// ✅ Server Start
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 Test: http://localhost:${PORT}/test`);
  console.log(`🔗 Orders: http://localhost:${PORT}/orders/1`);
});
