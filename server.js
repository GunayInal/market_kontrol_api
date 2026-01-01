import express from 'express';
import pkg from 'pg';
const { Pool } = pkg;
import cors from 'cors';
import dotenv from 'dotenv';
import { runAllScrapers } from './scraper_manager.js';
import path from 'path'; // 1. EKSİK: Path modülünü ekledik
import { fileURLToPath } from 'url'; // 2. EKSİK: URL modülünü ekledik


// Oracle VM'de .env dosyasını okuyabilmesi için
dotenv.config();

// --- 3. EKSİK: ESM için __dirname tanımlaması ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// -----------------------------------------------

const app = express();
const PORT = process.env.PORT || 3000;



// CORS ayarı: Frontend/Mobil App erişimi için kritik
app.use(cors());
app.use(express.json());

// Veritabanı Havuzu (Bağlantı Sınırlarını Yönetmek İçin)
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Oracle VM'den uzak DB'ye bağlanıyorsan gerekebilir
    max: 20,
    idleTimeoutMillis: 30000
});
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// Health Check (Oracle Load Balancer veya Uptime takibi için)
app.get('/', (req, res) => {
    res.json({ status: 'online', message: 'Market Kontrol API is running on Oracle Cloud' });
});

// ======================================================================
// 📌 1. MERKEZİ GÜNCELLEME ROTASI
// ======================================================================
app.get('/admin/update-all-db', async (req, res) => {
    console.log("--- 🔄 TÜM MARKET VERİTABANI GÜNCELLENİYOR ---");
    try {
        const summary = await runAllScrapers();
        res.status(200).json({
            status: 'success',
            message: 'Veritabanı güncelleme işlemi tamamlandı.',
            summary: summary
        });
    } catch (error) {
        console.error('Kritik güncelleme hatası:', error);
        res.status(500).json({ status: 'error', message: 'Güncelleme sırasında hata oluştu.' });
    }
});

// ======================================================================
// 📌 2. BROŞÜR API ROTASI (İstediğin Özel Mantıkla)
// ======================================================================

/**
 * Markete göre broşürleri getirir.
 * Şartlar: 
 * 1. Kapak fotoğrafı (cover_image) 1. sayfadan alınır.
 * 2. Her broşür objesi içinde 'pages' dizisiyle tüm sayfaları döner.
 */
app.get('/api/v1/brochures/:storeSlug', async (req, res) => {
    const { storeSlug } = req.params;

    try {
        const query = `
            SELECT 
                b.id, 
                b.title, 
                b.link,
                b.created_at,
                s.name as store_name,
                -- Şart 1: Kapak fotoğrafı olarak 1. sayfayı seçiyoruz
                (SELECT image_url FROM brochure_pages WHERE brochure_id = b.id ORDER BY page_number ASC LIMIT 1) as cover_image,
                -- Şart 2: Tüm sayfaları bir dizi (array) içinde döndürüyoruz
                COALESCE(
                    (SELECT json_agg(p ORDER BY p.page_number ASC)
                     FROM (
                        SELECT page_number, image_url 
                        FROM brochure_pages 
                        WHERE brochure_id = b.id
                     ) p
                    ), '[]'
                ) as pages
            FROM brochures b
            JOIN stores s ON b.store_id = s.id
            WHERE s.slug = $1
            ORDER BY b.created_at DESC;
        `;

        const result = await pool.query(query, [storeSlug]);

        res.json({ 
            status: 'success', 
            count: result.rows.length,
            market: storeSlug.toUpperCase(),
            data: result.rows 
        });
    } catch (error) {
        console.error('Broşür getirme hatası:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});


// Belirli bir marketin kampanya listesini getirir
app.get('/api/v1/campaigns/:storeSlug', async (req, res) => {
    const { storeSlug } = req.params;

    try {
        const query = `
            SELECT 
                c.id, 
                c.title, 
                c.image_url,
                c.created_at,
                s.name as store_name,
                -- Kampanyaya ait toplam ürün sayısını merak eden kullanıcılar için
                (SELECT COUNT(*) FROM products WHERE campaign_id = c.id) as product_count
            FROM campaigns c
            JOIN stores s ON c.store_id = s.id
            WHERE s.slug = $1
            ORDER BY c.created_at DESC;
        `;

        const { rows } = await pool.query(query, [storeSlug]);

        if (rows.length === 0) {
            return res.status(404).json({ 
                success: false, 
                message: `${storeSlug} için kampanya bulunamadı.` 
            });
        }

        res.json({
            status: 'success',
            market: storeSlug.toUpperCase(),
            count: rows.length,
            data: rows
        });

    } catch (error) {
        console.error('Kampanya listesi hatası:', error);
        res.status(500).json({ status: 'error', message: error.message });
    }
});

// Kampanyaya ait TÜM detaylı ürün verilerini döndüren API ucu
app.get('/api/v1/campaign-products/:campaignId', async (req, res) => {
    const { campaignId } = req.params;

    try {
        const query = `
            SELECT 
                p.*, -- Ürün tablosundaki tüm sütunlar (p1, p2 promosyonları dahil)
                s.name as store_name,
                s.slug as store_slug,
                c.title as campaign_title,
                -- Otomatik indirim yüzdesi hesaplama (regular_price varsa)
                CASE 
                    WHEN p.regular_price > 0 AND p.regular_price > p.price 
                    THEN ROUND(((p.regular_price - p.price) / p.regular_price) * 100)
                    ELSE 0 
                END as discount_percentage
            FROM products p
            JOIN campaigns c ON p.campaign_id = c.id
            JOIN stores s ON c.store_id = s.id
            WHERE p.campaign_id = $1
            ORDER BY p.price ASC;
        `;

        const { rows } = await pool.query(query, [campaignId]);

        // Mobil tarafa daha temiz veri gitmesi için null kontrolü (isteğe bağlı)
        res.json({
            status: 'success',
            campaign_id: campaignId,
            count: rows.length,
            data: rows
        });

    } catch (error) {
        console.error('Kritik ürün API hatası:', error);
        res.status(500).json({ 
            status: 'error', 
            message: 'Ürün detayları getirilirken bir hata oluştu.' 
        });
    }
});

// ======================================================================
// 📌 4. ÜRÜN API ROTASI
// ======================================================================

app.get('/api/v1/products', async (req, res) => {
    try {
        const limit = req.query.limit || 50;
        const result = await pool.query(`
            SELECT p.*, s.name as store_name 
            FROM products p
            JOIN campaigns c ON p.campaign_id = c.id
            JOIN stores s ON c.store_id = s.id
            ORDER BY p.id DESC 
            LIMIT $1
        `, [limit]);

        res.json({ status: 'success', count: result.rows.length, data: result.rows });
    } catch (error) {
        res.status(500).json({ status: 'error', message: error.message });
    }
});

app.use((req, res) => {
    res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server is running on port ${PORT}`);
    console.log(`📡 Public Access: http://<ORACLE_VM_IP>:${PORT}`);
});
