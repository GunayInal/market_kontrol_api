import { processSokPdf } from './utils/converter.js';
import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Pool } = pg;
const pool = new Pool({
    user: 'marketuser', host: 'localhost', database: 'marketdb', password: 'Market_1234', port: 5432,
});

async function main() {
    const pdfDir = 'uploads/pdf';
    const processedDir = 'uploads/pdf/processed';

    if (!fs.existsSync(processedDir)) fs.mkdirSync(processedDir, { recursive: true });

    const files = fs.readdirSync(pdfDir).filter(file => file.endsWith('.pdf'));

    if (files.length === 0) {
        console.log("⚠️ İşlenecek PDF dosyası bulunamadı.");
        process.exit();
    }

    const client = await pool.connect();

    try {
        // --- KRİTİK ADIM: TOPLU TEMİZLİK ---
        // Döngüye girmeden ÖNCE tüm eski ŞOK verilerini siliyoruz ki sadece yeniler kalsın.
        console.log("🧹 Tüm eski ŞOK broşürleri veritabanından temizleniyor...");
        await client.query('BEGIN');
        await client.query("DELETE FROM brochure_pages WHERE brochure_id LIKE 'sok-%'");
        await client.query("DELETE FROM brochures WHERE id LIKE 'sok-%'");
        await client.query('COMMIT');
        // ----------------------------------

        for (const pdfName of files) {
            console.log(`\n🚀 İşleniyor: ${pdfName}`);
            
            const folderName = pdfName.replace('.pdf', '').replace(/\s+/g, '-');
            const title = `ŞOK Aktüel - ${pdfName.split('_').slice(0, 2).join(' ')}`; 
            const store_id = 3; 

            // 1. PDF'i PNG'lere dönüştür
            const imagePaths = await processSokPdf(pdfName, folderName);
            
            await client.query('BEGIN');

            // 2. Ana tabloya kayıt (Artık temizlik döngü dışında yapıldığı için direkt ekliyoruz)
            const brochureId = 'sok-' + Date.now() + Math.floor(Math.random() * 1000); // Aynı saniyede çakışmasın
            await client.query(
                `INSERT INTO brochures (id, store_id, title, main_image_url, link) VALUES ($1, $2, $3, $4, $5)`,
                [brochureId, store_id, title, imagePaths[0], '/sok-katalog-' + folderName]
            );

            // 3. Sayfaları kaydet
            for (let i = 0; i < imagePaths.length; i++) {
                await client.query(
                    `INSERT INTO brochure_pages (brochure_id, page_number, image_url) VALUES ($1, $2, $3)`,
                    [brochureId, i + 1, imagePaths[i]]
                );
            }

            await client.query('COMMIT');
            console.log(`✅ ${pdfName} başarıyla işlendi ve eklendi.`);

            // 4. PDF'i taşı
            fs.renameSync(path.join(pdfDir, pdfName), path.join(processedDir, pdfName));
        }
    } catch (err) {
        if (client) await client.query('ROLLBACK');
        console.error("❌ HATA:", err.message);
    } finally {
        client.release();
        process.exit();
    }
}

main();
