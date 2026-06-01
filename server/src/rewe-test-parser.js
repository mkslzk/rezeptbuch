const cheerio = require('cheerio');
const fs = require('fs');
const html = fs.readFileSync('/tmp/rewe-test.html', 'utf8');
const $ = cheerio.load(html);

const tiles = $('[class*="cor-offer-renderer-tile"]');
const seenIds = new Set();
const offers = [];

tiles.each((_, el) => {
  const $el = $(el);
  const link = $el.find('a.cor-offer-information__title-link');
  const offerId = link.attr('data-offer-id');
  const name = link.attr('data-offer-title') || '';
  const ariaLabel = link.attr('aria-label') || '';
  
  if (!name || !offerId) return;
  if (seenIds.has(offerId)) return;
  seenIds.add(offerId);
  
  const priceMatch = ariaLabel.match(/(\d+[.,]\d{2})\s*[€]?/);
  if (!priceMatch) return;
  const price = parseFloat(priceMatch[1].replace(',', '.'));
  if (price <= 0 || price > 100) return;
  
  offers.push({ name, price, store: 'rewe' });
});

console.log('Total offers:', offers.length);
offers.slice(0, 20).forEach(o => {
  console.log('  ' + o.name.substring(0, 50).padEnd(50) + ' ' + o.price.toFixed(2));
});
