// server.js
const express = require("express");
const bcrypt = require("bcrypt");
const con = require("./db/db"); // Your existing connection
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Test database connection
console.log("Testing database connection...");
con.connect((err) => {
  if (err) {
    console.error('❌ Database connection failed:', err.message);
    console.log('Please check:');
    console.log('1. MySQL server is running');
    console.log('2. Database "expenses" exists');
    console.log('3. MySQL credentials in db.js are correct');
    process.exit(1);
  } else {
    console.log('✅ Connected to MySQL database successfully');
  }
});

// Helper function to convert callback to promise
const query = (sql, params) => {
  return new Promise((resolve, reject) => {
    console.log('Executing query:', sql, params);
    con.query(sql, params, (err, results) => {
      if (err) {
        console.error('Query error:', err);
        return reject(err);
      }
      resolve(results);
    });
  });
};

// --- Initialize Database ---
app.get("/init", async (req, res) => {
  try {
    console.log("Initializing database...");
    
    // Create users table
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL
      )
    `);

    // Create expenses table
    await query(`
      CREATE TABLE IF NOT EXISTS expenses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        item VARCHAR(100) NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default users if they don't exist
    const users = await query("SELECT * FROM users WHERE name IN ('Lisa', 'Tom')");
    console.log('Existing users:', users);
    
    if (users.length === 0) {
      console.log('Creating default users...');
      const saltRounds = 10;
      const lisaHash = await bcrypt.hash("1111", saltRounds);
      const tomHash = await bcrypt.hash("2222", saltRounds);
      
      await query(
        "INSERT INTO users (name, password_hash) VALUES (?, ?), (?, ?)",
        ["Lisa", lisaHash, "Tom", tomHash]
      );
      
      // Add some sample expenses
      const userRows = await query("SELECT id, name FROM users WHERE name IN ('Lisa', 'Tom')");
      console.log('User rows:', userRows);
      
      const lisaId = userRows.find(u => u.name === 'Lisa').id;
      const tomId = userRows.find(u => u.name === 'Tom').id;
      
      await query(
        "INSERT INTO expenses (user_id, item, amount, created_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)",
        [tomId, "lunch", 50.00, "2025-08-20 13:27:39", tomId, "bun", 20.00, "2025-08-20 21:02:36"]
      );
      
      console.log('Sample expenses added');
    }

    res.json({ message: "Database initialized successfully" });
  } catch (error) {
    console.error("Database initialization error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- All your other routes remain the same ---
// (Login, expenses, today's expenses, search, add, delete)

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("Unhandled error:", error);
  res.status(500).json({ error: "Internal server error" });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`📊 Visit http://localhost:${PORT}/init to initialize the database`);
}).on('error', (err) => {
  console.error(' Server failed to start:', err.message);
  if (err.code === 'EADDRINUSE') {
    console.log('Port 3000 is already in use. Try using a different port.');
  }
});

console.log("Server setup complete, starting...");