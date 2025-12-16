// server.js
import express from 'express';
import fs from 'fs/promises';
import path from 'path';

// Scraper Modüllerini içe aktar
// Not: A101 ve Bim'in de ESM yapısında (export) olduğunu varsayıyoruz.
import { runGratisScraper } from './scrapers/gratis.js';
import { runA101Scraper } from './scrapers/a101.js';
import { runBimScraper } from './scrapers/bim.js'; 
import { runMigrosScraper } from './scrapers/migros.js';
import { runMetroScraper } from './scrapers/metro.js';

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(process.cwd(), 'data');

app.use(express.json());

// ======================================================================
// 📌 1. VERİ GÜNCELLEME (Scraping) ROTASI (Admin/Manuel Tetikleme)
// ======================================================================
// Bu rota, tüm market verilerini çekip 'data/' klasörüne kaydeder.
app.get('/admin/update-all-data', async (req, res) => {
    console.log("-----------------------------------------");
    console.log("--- 🔄 TÜM MARKET VERİLERİ GÜNCELLENİYOR ---");
    console.log("-----------------------------------------");

    try {
        // --- 1. MIGROS ---
        const migrosResult = await runMigrosScraper();
        const migrosFilePath = path.join(DATA_DIR, 'migros_veri.json');
        await fs.writeFile(migrosFilePath, JSON.stringify(migrosResult.fullData, null, 2));
        console.log(`\n✅ Migros verisi kaydedildi. Toplam Ürün: ${migrosResult.totalProducts}, Toplam Kampanya: ${migrosResult.totalCampaigns}`);
        
        // --- 4. METRO MARKET --- 🚨 YENİ EKLENDİ
        const metroResult = await runMetroScraper();
        const metroFilePath = path.join(DATA_DIR, 'metro_veri.json');
        await fs.writeFile(metroFilePath, JSON.stringify(metroResult.fullData, null, 2));
        summary.Metro = `${metroResult.totalBrochures} broşür çekildi.`;
        console.log(`\n✅ Metro verisi kaydedildi. Toplam Broşür: ${metroResult.totalBrochures}`);
        
        // --- 3. GRATIS ---
        const gratisResult = await runGratisScraper();
        const gratisFilePath = path.join(DATA_DIR, 'gratis_veri.json');
        await fs.writeFile(gratisFilePath, JSON.stringify(gratisResult.fullData, null, 2));
        console.log(`\n✅ Gratis verisi kaydedildi. Toplam Ürün: ${gratisResult.totalProducts}`);


        // --- 4. A101 --- 🚨 YENİ EKLENDİ
        const a101Result = await runA101Scraper();
        const a101FilePath = path.join(DATA_DIR, 'a101_veri.json');
        await fs.writeFile(a101FilePath, JSON.stringify(a101Result.fullData, null, 2));
        console.log(`\n✅ A101 verisi kaydedildi. Toplam Ürün: ${a101Result.totalProducts}`);


        // --- 5. BIM --- 🚨 YENİ EKLENDİ
        const bimResult = await runBimScraper();
        const bimFilePath = path.join(DATA_DIR, 'bim_veri.json');
        await fs.writeFile(bimFilePath, JSON.stringify(bimResult.fullData, null, 2));
        console.log(`\n✅ BİM verisi kaydedildi. Toplam Ürün: ${bimResult.totalProducts}, Toplam Broşür: ${bimResult.totalBrochures}`);


res.status(200).json({
            status: 'success',
            message: 'Tüm market verileri başarıyla çekildi ve depolandı.',
            summary: {
                Gratis: `${gratisResult.totalProducts} ürün çekildi.`,
                A101: `${a101Result.totalProducts} ürün çekildi. (API ürünleri atlandı)`,
                BIM: `${bimResult.totalProducts} ürün ve ${bimResult.totalBrochures} broşür çekildi.`
            }
        });
    } catch (error) {
        console.error('Kritik veri güncelleme hatası:', error);
        res.status(500).json({ status: 'error', message: 'Veri çekiminde sunucu hatası.' });
    }
});


// ======================================================================
// 📌 2. VERİ OKUMA (READ) ROTASI: TÜM MARKETLER
// ======================================================================

// Yardımcı fonksiyon: JSON dosyasını okur ve içeriğini döndürür
const readDataFile = async (fileName) => {
    const filePath = path.join(DATA_DIR, fileName);
    try {
        const data = await fs.readFile(filePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // Dosya bulunamazsa (ilk çalıştırmada normaldir) veya okuma hatası olursa
        if (error.code === 'ENOENT') {
            console.warn(`⚠️ Veri dosyası bulunamadı: ${fileName}`);
            return { error: `Veri bulunamadı. Lütfen önce /admin/update-all-data rotasını çalıştırın.` };
        }
        throw error; // Diğer hataları yukarı fırlat
    }
};


// 1. TÜM MARKET VERİLERİNİ TEK BİR ROTADA TOPLAMA
app.get('/api/v1/all-markets', async (req, res) => {
    try {
        // 📌 EKLEME: migros_veri.json
        const [migrosData, gratisData, a101Data, bimData,metroData] = await Promise.all([
            readDataFile('metro_veri.json'),
            readDataFile('migros_veri.json'),
            readDataFile('gratis_veri.json'),
            readDataFile('a101_veri.json'),
            readDataFile('bim_veri.json')
        ]);

        res.status(200).json({
            status: 'success',
            last_updated: new Date().toISOString(),
            data: {
                metro: metroData,
                migros: migrosData, 
                gratis: gratisData,
                a101: a101Data,
                bim: bimData
            }
        });
    } catch (error) {
        console.error('API /all-markets hatası:', error);
        res.status(500).json({ status: 'error', message: 'Sunucuda veri okuma hatası.' });
    }
});


// 2. MARKETE ÖZEL VERİ OKUMA ROTASI (Migros Eklendi)

app.get('/api/v1/:marketName', async (req, res) => {
    const marketName = req.params.marketName.toLowerCase();
    let fileName = '';

    switch (marketName) {
        case 'migros': 
            fileName = 'migros_veri.json';
            break;
        case 'metro': 
            fileName = 'metro_veri.json';
            break;
        case 'gratis':
            fileName = 'gratis_veri.json';
            break;
        case 'a101':
            fileName = 'a101_veri.json';
            break;
        case 'bim':
            fileName = 'bim_veri.json';
            break;
        default:
            return res.status(404).json({ status: 'error', message: 'Geçersiz market adı.' });
    }

    // ... (Veri okuma ve yanıt kısmı aynı kalır)
    try {
        const data = await readDataFile(fileName);
        res.status(200).json({
            status: 'success',
            data: data
        });
    } catch (error) {
        res.status(500).json({ status: 'error', message: `Veri okuma hatası: ${error.message}` });
    }
});


// ======================================================================
// 🚀 SUNUCUYU BAŞLATMA
// ======================================================================
// server.js dosyasının en altındaki app.listen bloğu

app.listen(PORT, () => {
    console.log(`Sunucu http://localhost:${PORT} adresinde dinleniyor.`);

    // Uygulama başlatıldığında, canlı ortamda (PORT 3000 değilse) ilk veri çekimini tetikleyebiliriz.
    if (process.env.NODE_ENV === 'production' && PORT != 3000) {
        // Canlı ortamda ilk açılışta veriyi çek ve dosyaları oluştur.
        // Bu kısmı, performans için yorum satırı yapabiliriz.
        /*
        fetch(`http://localhost:${PORT}/admin/update-all-data`)
            .then(() => console.log('Başlangıç verisi çekildi.'))
            .catch(err => console.error('Başlangıç veri çekme hatası:', err));
        */
    }
});