// server.js
const express = require("express");
const bcrypt = require("bcrypt");
const con = require("./db"); 
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// Helper function to convert callback to promise
const query = (sql, params) => {
  return new Promise((resolve, reject) => {
    con.query(sql, params, (err, results) => {
      if (err) return reject(err);
      resolve(results);
    });
  });
};

// --- Initialize Database ---
app.get("/init", async (req, res) => {
  try {
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
    
    if (users.length === 0) {
      const saltRounds = 10;
      const lisaHash = await bcrypt.hash("1111", saltRounds);
      const tomHash = await bcrypt.hash("2222", saltRounds);
      
      await query(
        "INSERT INTO users (name, password_hash) VALUES (?, ?), (?, ?)",
        ["Lisa", lisaHash, "Tom", tomHash]
      );
      
      // Add some sample expenses
      const userRows = await query("SELECT id, name FROM users WHERE name IN ('Lisa', 'Tom')");
      const lisaId = userRows.find(u => u.name === 'Lisa').id;
      const tomId = userRows.find(u => u.name === 'Tom').id;
      
      await query(
        "INSERT INTO expenses (user_id, item, amount, created_at) VALUES (?, ?, ?, ?), (?, ?, ?, ?)",
        [tomId, "lunch", 50.00, "2025-08-20 13:27:39", tomId, "bun", 20.00, "2025-08-20 21:02:36"]
      );
    }

    res.json({ message: "Database initialized successfully" });
  } catch (error) {
    console.error("Database initialization error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- Login ---
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "Username and password are required" });
    }

    const users = await query("SELECT * FROM users WHERE name = ?", [username]);
    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const user = users[0];
    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({ 
      user_id: user.id, 
      name: user.name,
      message: "Login successful" 
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- Get all expenses for a user ---
app.get("/expenses", async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const expenses = await query(
      "SELECT id, item, amount, created_at FROM expenses WHERE user_id = ? ORDER BY created_at DESC",
      [user_id]
    );
    
    const total = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
    
    res.json({ 
      expenses, 
      total: total.toFixed(2) 
    });
  } catch (error) {
    console.error("Get expenses error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- Get today's expenses ---
app.get("/expenses/today", async (req, res) => {
  try {
    const { user_id } = req.query;
    
    if (!user_id) {
      return res.status(400).json({ error: "User ID is required" });
    }

    const expenses = await query(
      "SELECT id, item, amount, created_at FROM expenses WHERE user_id = ? AND DATE(created_at) = CURDATE() ORDER BY created_at DESC",
      [user_id]
    );
    
    const total = expenses.reduce((sum, expense) => sum + parseFloat(expense.amount), 0);
    
    res.json({ 
      expenses, 
      total: total.toFixed(2) 
    });
  } catch (error) {
    console.error("Get today's expenses error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- Search expenses ---
app.get("/expenses/search", async (req, res) => {
  try {
    const { user_id, q } = req.query;
    
    if (!user_id || !q) {
      return res.status(400).json({ error: "User ID and search query are required" });
    }

    const expenses = await query(
      "SELECT id, item, amount, created_at FROM expenses WHERE user_id = ? AND item LIKE ? ORDER BY created_at DESC",
      [user_id, `%${q}%`]
    );
    
    res.json({ expenses });
  } catch (error) {
    console.error("Search expenses error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- Add new expense ---
app.post("/expenses", async (req, res) => {
  try {
    const { user_id, item, amount } = req.body;
    
    if (!user_id || !item || !amount) {
      return res.status(400).json({ error: "User ID, item, and amount are required" });
    }

    const result = await query(
      "INSERT INTO expenses (user_id, item, amount) VALUES (?, ?, ?)",
      [user_id, item, parseFloat(amount)]
    );
    
    // Get the newly inserted expense
    const newExpense = await query(
      "SELECT id, item, amount, created_at FROM expenses WHERE id = ?",
      [result.insertId]
    );
    
    res.status(201).json({ 
      expense: newExpense[0],
      message: "Expense added successfully" 
    });
  } catch (error) {
    console.error("Add expense error:", error);
    res.status(500).json({ error: error.message });
  }
});

// --- Delete expense ---
app.delete("/expenses/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { user_id } = req.query;
    
    if (!user_id || !id) {
      return res.status(400).json({ error: "User ID and expense ID are required" });
    }

    const result = await query(
      "DELETE FROM expenses WHERE id = ? AND user_id = ?",
      [id, user_id]
    );
    
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Expense not found" });
    }
    
    res.json({ 
      message: "Expense deleted successfully",
      deleted_id: id 
    });
  } catch (error) {
    console.error("Delete expense error:", error);
    res.status(500).json({ error: error.message });
  }
});

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
  console.log(`Server running at http://localhost:${PORT}`);
  console.log(`Visit http://localhost:${PORT}/init to initialize the database`);
});