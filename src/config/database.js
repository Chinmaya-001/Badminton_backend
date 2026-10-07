
const { Pool } = require("pg");

const isLocalhost = !process.env.DB_HOST || process.env.DB_HOST === "localhost" || process.env.DB_HOST === "127.0.0.1";
const isProduction = process.env.NODE_ENV === "production";
const useSSL = process.env.DB_SSL === "true" || (!isLocalhost && process.env.DB_SSL !== "false") || isProduction;

const poolConfig = process.env.DATABASE_URL
    ? {
          connectionString: process.env.DATABASE_URL,
          ssl: useSSL ? { rejectUnauthorized: false } : false,
      }
    : {
          host: process.env.DB_HOST,
          port: process.env.DB_PORT ? parseInt(process.env.DB_PORT, 10) : 5432,
          database: process.env.DB_NAME,
          user: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          ssl: useSSL ? { rejectUnauthorized: false } : false,
      };

const pool = new Pool(poolConfig);

pool.on("connect", () => {
    console.log("Connected to PostgreSQL");
});

pool.on("error", (error) => {
    console.error("PostgreSQL error:", error);
});

module.exports = pool;