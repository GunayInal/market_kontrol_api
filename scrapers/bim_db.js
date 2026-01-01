import pkg from 'pg';
const { Pool } = pkg;
import { runBimScraper } from './bim.js'; 

const pool = new Pool({
    user: 'marketuser',
    host: '127.0.0.1',
    database: 'marketdb',
    password: 'Market_1234',
    port: 5432,

});

export async function saveBimToDB() {
    const client = await pool.connect();
    const storeSlug = 'bim';
    const currentTime = new Date();

    try {
        console.log("🚀 BİM Scraper başlatılıyor...");
        const data = await runBimScraper();

        if (!data || !data.fullData || !data.fullData.bim_brochures) {
            console.log("⚠️ BİM broşür verisi bulunamadı.");
            return;
        }

        await client.query('BEGIN');

        // 1. Mağaza ID al
        const storeRes = await client.query('SELECT id FROM stores WHERE slug = $1', [storeSlug]);
        if (storeRes.rows.length === 0) {
            console.error("❌ Hata: 'bim' mağazası veritabanında kayıtlı değil!");
            await client.query('ROLLBACK');
            return;
        }
        const storeId = storeRes.rows[0].id;

        // 2. TEMİZLİK (Yeni Tablo Yapısı: brochures ve brochure_pages)
        // Önce sayfaları, sonra ana broşür kayıtlarını siliyoruz
        await client.query("DELETE FROM brochure_pages WHERE brochure_id LIKE 'bim_bro_%'");
        await client.query("DELETE FROM brochures WHERE store_id = $1 AND id LIKE 'bim_bro_%'", [storeId]);

        console.log("🧹 Eski BİM katalog verileri temizlendi.");

        // 3. BROŞÜRLERİ KAYDET
        for (const brochure of data.fullData.bim_brochures) {
            const linkPart = brochure.link.split('/').filter(Boolean).pop()?.replace('.aspx', '') || 'katalog';
    
        // 2. Başlığı URL dostu hale getir (31-aralik-carsamba gibi)
            const titleSlug = brochure.title
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '-') // Harf/rakam dışındakileri - yap
            .replace(/-+/g, '-')        // Fazla tireleri temizle
            .trim();

    // 3. İkisini birleştirerek benzersiz ID oluştur
    const brochureId = `bim_bro_${linkPart}_${titleSlug}`;

            // brochures tablosuna ana bilgiyi ekle
            await client.query(`
                INSERT INTO brochures (id, store_id, title, main_image_url, link, created_at)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (id) DO UPDATE SET 
                    title = EXCLUDED.title,
                    main_image_url = EXCLUDED.main_image_url,
                    created_at = $6
            `, [brochureId, storeId, brochure.title, brochure.main_image_url, brochure.link, currentTime]);

            console.log(`📖 Katalog işleniyor: ${brochure.title}`);

            // 4. SAYFALARI KAYDET (Düzeltilen yer: brochure_id sütunu kullanıldı)
            for (const page of brochure.pages) {
                await client.query(`
                    INSERT INTO brochure_pages (brochure_id, page_number, image_url)
                    VALUES ($1, $2, $3)
                `, [brochureId, page.page_number, page.image_url]);
            }
        }

        await client.query('COMMIT');
        console.log(`\n✅ BİM Broşürleri başarıyla DB'ye yazıldı!`);

    } catch (e) {
        await client.query('ROLLBACK');
        console.error('❌ BİM DB Hatası:', e.message);
    } finally {
        client.release();
    }
}
