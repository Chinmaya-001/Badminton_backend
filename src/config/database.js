
const { Pool } = require("pg");

const isSupabaseOrRemote = 
    process.env.DATABASE_URL ||
    (process.env.DB_HOST && (process.env.DB_HOST.includes("supabase.co") || process.env.DB_HOST.includes("render.com"))) ||
    process.env.NODE_ENV === "production" ||
    process.env.DB_SSL === "true";

const poolConfig = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: isSupabaseOrRemote ? { rejectUnauthorized: false } : false,
      }
    : {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
        database: process.env.DB_NAME,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        ssl: isSupabaseOrRemote ? { rejectUnauthorized: false } : false,
      };

const pool = new Pool(poolConfig);

pool.on("connect", () => {
    console.log("Connected to PostgreSQL");
});

pool.on("error", (error) => {
    console.error("PostgreSQL error:", error);
});

module.exports = pool;