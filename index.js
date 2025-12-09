import { chromium } from "playwright";

async function scrapeA101() {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto("https://www.a101.com.tr/", {
    waitUntil: "domcontentloaded",
  });

  // JS yüklensin diye biraz bekle
  await page.waitForTimeout(2000);

  // sadece kampanya sliderındaki img ve linkleri çekiyoruz
  const campaigns = await page.$$eval(".swiper-slide a", (elements) =>
    elements
      .map((el) => {
        const link = el.getAttribute("href");
        const img = el.querySelector("img")?.src || null;

        if (!link || link.includes("/p-")) return null;
        if (!img) return null;

        return {
          link: link.startsWith("http")
            ? link
            : `https://www.a101.com.tr${link}`,
          image: img,
        };
      })
      .filter(Boolean)
  );

  console.log("Bulunan kampanya:", campaigns.length);
  console.log(campaigns);

  await browser.close();
}

scrapeA101();
