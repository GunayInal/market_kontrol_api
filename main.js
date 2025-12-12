// main.js

// Gerekli Scraper Modüllerini İçe Aktarma (ES Module Yapısı)
// Lütfen 'a101.js' ve 'bim.js' dosyalarınızın içinde,
// ana fonksiyonlarınızı 'export' ettiğinizden emin olun (örnek: export async function runA101Scraper()).
import { runA101Scraper } from './a101.js';
import { runBimScraper } from './bim.js';
import { runGratisScraper } from './gratis.js'; // GRATIS EKLENDİ

// ======================================================================
// SCRAPER KONTROL MERKEZİ
// ======================================================================

// Marketlerin etkinleştirme durumları
const SCRAPERS_TO_RUN = {
    A101: false, 
    BIM: false,    // Şimdilik pasif
    GRATIS: true   // Sadece Gratis aktif
};

async function initializeScrapers() {
    console.log("======================================");
    console.log("🚀 Proje Başlatılıyor: Market Kontrolü");
    console.log("======================================");

    // --- A101 Çalıştırma Kontrolü ---
    if (SCRAPERS_TO_RUN.A101) {
        console.log("\n[A101] Veri çekme başlatılıyor...");
        try {
            await runA101Scraper();
            console.log("[A101] Veri çekme tamamlandı.");
        } catch (error) {
            console.error(`\n[A101] ❌ Kritik Hata: Veri çekme başarısız oldu. Hata: ${error.message}`);
        }
    } else {
        console.log("\n[A101] Pasif: Çalıştırılmayacak.");
    }

    // --- BİM Çalıştırma Kontrolü ---
    if (SCRAPERS_TO_RUN.BIM) {
        console.log("\n[BİM] Veri çekme başlatılıyor...");
        try {
            await runBimScraper();
            console.log("[BİM] Veri çekme tamamlandı.");
        } catch (error) {
            console.error(`\n[BİM] ❌ Kritik Hata: Veri çekme başarısız oldu. Hata: ${error.message}`);
        }
    } else {
        console.log("\n[BİM] Pasif: Çalıştırılmayacak.");
    }

    if (SCRAPERS_TO_RUN.GRATIS) {
        console.log("\n[GRATIS] Veri çekme başlatılıyor...");
        try {
            await runGratisScraper();
            console.log("[GRATIS] Veri çekme tamamlandı.");
        } catch (error) {
            console.error(`\n[GRATIS] ❌ Kritik Hata: Veri çekme başarısız oldu. Hata: ${error.message}`);
        }
    } else {
        console.log("\n[GRATIS] Pasif: Çalıştırılmayacak.");
    }
    
    console.log("\n======================================");
    console.log("✅ Tüm işlemler tamamlandı.");
}

// Ana başlatma fonksiyonunu çalıştır
initializeScrapers();