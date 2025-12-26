import pkg from 'pg';
const { Pool } = pkg;

// Secrets'tan URL'i çeker
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // Uzak DB bağlantıları (Neon, ElephantSQL vb.) için genellikle zorunludur
});

const setupDatabase = async () => {
  const query = `
    CREATE TABLE IF NOT EXISTS stores (
        id SERIAL PRIMARY KEY,
        slug VARCHAR(50) UNIQUE,
        name VARCHAR(100)
    );

    CREATE TABLE IF NOT EXISTS campaigns (
        id VARCHAR(100) PRIMARY KEY,
        store_id INTEGER REFERENCES stores(id),
        title TEXT,
        image_url TEXT,
        link TEXT
    );

    CREATE TABLE IF NOT EXISTS products (
        id BIGSERIAL PRIMARY KEY,
        external_id VARCHAR(100),
        campaign_id VARCHAR(100) REFERENCES campaigns(id),
        name TEXT,
        brand VARCHAR(100),
        price NUMERIC(10,2),
        regular_price NUMERIC(10,2),
        image_url TEXT
    );

    CREATE TABLE IF NOT EXISTS brochure_pages (
        id SERIAL PRIMARY KEY,
        campaign_id VARCHAR(100) REFERENCES campaigns(id),
        page_number INTEGER,
        image_url TEXT
    );

    INSERT INTO stores (slug, name) VALUES 
    ('migros', 'Migros'), 
    ('gratis', 'Gratis'), 
    ('bim', 'BİM'), 
    ('a101', 'A101')
    ON CONFLICT (slug) DO NOTHING;
  `;

  try {
    console.log("Bağlantı kuruluyor...");
    await pool.query(query);
    console.log("✅ Veritabanı tabloları başarıyla oluşturuldu.");
  } catch (err) {
    console.error("❌ Hata oluştu:", err);
  } finally {
    await pool.end();
  }
};

setupDatabase();