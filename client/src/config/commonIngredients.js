// Common German ingredients for autocomplete
// Sorted alphabetically within categories

export const COMMON_INGREDIENTS = [
  // Mehl & Backzutaten
  'Mehl (Type 405)',
  'Mehl (Type 550)',
  'Mehl (Type 1050)',
  'Dinkelmehl',
  'Roggenmehl',
  'Maisstärke',
  'Kartoffelstärke',
  'Backpulver',
  'Natron',
  'Vanillinzucker',
  'Vanilleextrakt',
  'Zitronenschale',
  'Orangenschale',
  'Kakao',
  'Kuvertüre',
  'Schokolade (Zartbitter)',
  'Schokolade (Vollmilch)',
  'Nüsse (gemahlen)',
  'Mandeln (gemahlen)',
  'Haselnüsse',
  'Walnüsse',
  'Kokosraspel',
  'Rosinen',
  'Korinthen',

  // Zucker & Süßungsmittel
  'Zucker',
  'Puderzucker',
  'Brauner Zucker',
  'Vanille Zucker',
  'Honig',
  'Ahornsirup',
  'Agavendicksaft',
  'Melasse',

  // Milchprodukte & Eier
  'Eier',
  'Eigelb',
  'Eiweiß',
  'Milch',
  'Sahne',
  'Schmand',
  'Creme Fraiche',
  'Butter',
  'Margarine',
  'Frischkäse',
  'Mascarpone',
  'Quark (Mager)',
  'Quark (20%)',
  'Joghurt (natur)',
  'Käse (gerieben)',
  'Parmesan',
  'Mozzarella',

  // Fette & Öle
  'Pflanzenöl',
  'Olivenöl (nativ)',
  'Olivenöl (extra nativ)',
  'Kokosöl',
  'Rapsöl',
  'Sesamöl',

  // Fleisch & Fisch
  'Hackfleisch (gemischt)',
  'Hackfleisch (Rind)',
  'Hackfleisch (Schwein)',
  'Geflügelhack',
  'Hähnchenbrust',
  'Hähnchenschenkel',
  'Rinderfilet',
  'Schweinefilet',
  'Bacon/Frühstücksfleisch',
  'Schnitzel (dünn)',
  'Fischfilet (Kabeljau)',
  'Fischfilet (Lachs)',
  'Garnelen',
  'Thunfisch (im Glas)',
  'Sardellen',

  // Gemüse
  'Zwiebel',
  'Knoblauch',
  'Schalotten',
  'Lauch/Porree',
  'Karotten',
  'Kartoffeln',
  'Süßkartoffel',
  'Paprika (rot)',
  'Paprika (gelb)',
  'Paprika (grün)',
  'Tomaten (gehackt)',
  'Tomaten (getrocknet)',
  'Cherrytomaten',
  'Zucchini',
  'Aubergine',
  'Brokkoli',
  'Blumenkohl',
  'Spinat (tiefgekühlt)',
  'Mangold',
  'Grüne Bohnen',
  'Erbsen (tiefgekühlt)',
  'Mais (Dose)',
  'Pilze (Champignons)',
  'Steinchampignons',
  'Frühlingszwiebeln',
  'Sellerie',
  'Fenchel',
  'Radieschen',
  'Rotkohl',
  'Weißkohl',
  'Spitzkohl',
  'Wirsing',

  // Obst
  'Äpfel',
  'Birnen',
  'Bananen',
  'Zitronen',
  'Limonen',
  'Orangen',
  'Trauben',
  'Erdbeeren',
  'Himbeeren',
  'Blaubeeren',
  'Pfirsiche',
  'Aprikosen',
  'Kirschen',
  'Pflaumen',
  'Ananas (Dose)',
  'Mango',
  'Granatapfel',

  // Nudeln, Reis & Hülsenfrüchte
  'Spaghetti',
  'Penne',
  'Farfalle',
  'Lasagneplatten',
  'Maultaschen',
  'Reis (Langkorn)',
  'Reis (Basmatireis)',
  'Risottoreis',
  'Couscous',
  'Bulgur',
  'Linsen (grün)',
  'Linsen (rot)',
  'Kichererbsen (Dose)',
  'Kidneybohnen (Dose)',
  'Schwarze Bohnen',

  // Gewürze & Kräuter
  'Salz',
  'Pfeffer (schwarz)',
  'Paprika (edelsüß)',
  'Cayennepfeffer',
  'Kreuzkümmel (Cumin)',
  'Koriander (gemahlen)',
  'Kardamom',
  'Kurkuma',
  'Ingwer (frisch)',
  'Muskatnuss',
  'Nelken',
  'Zimt',
  'Lorbeerblätter',
  'Thymian',
  'Rosmarin',
  'Salbei',
  'Oregano',
  'Basilikum (frisch)',
  'Petersilie (frisch)',
  'Schnittlauch',
  'Dill',
  'Minze',
  'Estragon',

  // Flüssigkeiten & Fonds
  'Wasser',
  'Gemüsebrühe',
  'Hühnerbrühe',
  'Rinderbrühe',
  'Weißwein',
  'Rotwein',
  'Bier',
  'Tomatensaft',
  'Sojasauce',
  'Worcestershire Sauce',
  'Fischsauce',
  'Limoncello',
  'Amaretto',

  // Käse (weitere)
  'Gouda (jung)',
  'Emmentaler',
  'Bergkäse',
  'Brie',
  'Camembert',
  'Ziegenkäse',
  'Feta',
  'Ricotta',
  'Halloumi',

  // Fertigprodukte & Sonstiges
  'Semmelbrösel',
  'Paniermehl',
  'Mandelstifte',
  'Pinienkerne',
  'Sesam',
  'Mohn',
  'Pesto (rot)',
  'Pesto (grün)',
  'Tomatenmark',
  'Brühwürfel',
  'Safran',
  'Saft (Orange)',
  'Saft (Zitrone)',
  'Grieß',
  'Haferflocken',
  'Müsli',
  'Creme Chantilly',
  'Speisestärke',
];

// Grouped by category for organized display
export const COMMON_INGREDIENTS_BY_CATEGORY = {
  'Backzutaten': [
    'Mehl (Type 405)', 'Mehl (Type 550)', 'Mehl (Type 1050)', 'Dinkelmehl', 'Roggenmehl',
    'Maisstärke', 'Kartoffelstärke', 'Backpulver', 'Natron', 'Vanillinzucker', 'Vanilleextrakt',
    'Zitronenschale', 'Orangenschale', 'Kakao', 'Kuvertüre', 'Schokolade (Zartbitter)',
    'Schokolade (Vollmilch)', 'Nüsse (gemahlen)', 'Mandeln (gemahlen)', 'Haselnüsse',
    'Walnüsse', 'Kokosraspel', 'Rosinen', 'Korinthen', 'Semmelbrösel', 'Paniermehl',
    'Mandelstifte', 'Pinienkerne', 'Sesam', 'Mohn', 'Speisestärke'
  ],
  'Süßungsmittel': [
    'Zucker', 'Puderzucker', 'Brauner Zucker', 'Vanille Zucker', 'Honig',
    'Ahornsirup', 'Agavendicksaft', 'Melasse'
  ],
  'Milchprodukte': [
    'Eier', 'Eigelb', 'Eiweiß', 'Milch', 'Sahne', 'Schmand', 'Creme Fraiche',
    'Butter', 'Margarine', 'Frischkäse', 'Mascarpone', 'Quark (Mager)', 'Quark (20%)',
    'Joghurt (natur)', 'Creme Chantilly'
  ],
  'Käse': [
    'Käse (gerieben)', 'Parmesan', 'Mozzarella', 'Gouda (jung)', 'Emmentaler',
    'Bergkäse', 'Brie', 'Camembert', 'Ziegenkäse', 'Feta', 'Ricotta', 'Halloumi'
  ],
  'Fleisch & Fisch': [
    'Hackfleisch (gemischt)', 'Hackfleisch (Rind)', 'Hackfleisch (Schwein)', 'Geflügelhack',
    'Hähnchenbrust', 'Hähnchenschenkel', 'Rinderfilet', 'Schweinefilet', 'Bacon/Frühstücksfleisch',
    'Schnitzel (dünn)', 'Fischfilet (Kabeljau)', 'Fischfilet (Lachs)', 'Garnelen',
    'Thunfisch (im Glas)', 'Sardellen'
  ],
  'Gemüse': [
    'Zwiebel', 'Knoblauch', 'Schalotten', 'Lauch/Porree', 'Karotten', 'Kartoffeln',
    'Süßkartoffel', 'Paprika (rot)', 'Paprika (gelb)', 'Paprika (grün)', 'Tomaten (gehackt)',
    'Tomaten (getrocknet)', 'Cherrytomaten', 'Zucchini', 'Aubergine', 'Brokkoli',
    'Blumenkohl', 'Spinat (tiefgekühlt)', 'Mangold', 'Grüne Bohnen', 'Erbsen (tiefgekühlt)',
    'Mais (Dose)', 'Pilze (Champignons)', 'Steinchampignons', 'Frühlingszwiebeln',
    'Sellerie', 'Fenchel', 'Radieschen', 'Rotkohl', 'Weißkohl', 'Spitzkohl', 'Wirsing'
  ],
  'Obst': [
    'Äpfel', 'Birnen', 'Bananen', 'Zitronen', 'Limonen', 'Orangen', 'Trauben',
    'Erdbeeren', 'Himbeeren', 'Blaubeeren', 'Pfirsiche', 'Aprikosen', 'Kirschen',
    'Pflaumen', 'Ananas (Dose)', 'Mango', 'Granatapfel'
  ],
  'Nudeln, Reis & Hülsenfrüchte': [
    'Spaghetti', 'Penne', 'Farfalle', 'Lasagneplatten', 'Maultaschen',
    'Reis (Langkorn)', 'Reis (Basmatireis)', 'Risottoreis', 'Couscous', 'Bulgur',
    'Linsen (grün)', 'Linsen (rot)', 'Kichererbsen (Dose)', 'Kidneybohnen (Dose)', 'Schwarze Bohnen'
  ],
  'Gewürze & Kräuter': [
    'Salz', 'Pfeffer (schwarz)', 'Paprika (edelsüß)', 'Cayennepfeffer',
    'Kreuzkümmel (Cumin)', 'Koriander (gemahlen)', 'Kardamom', 'Kurkuma', 'Ingwer (frisch)',
    'Muskatnuss', 'Nelken', 'Zimt', 'Lorbeerblätter', 'Thymian', 'Rosmarin', 'Salbei',
    'Oregano', 'Basilikum (frisch)', 'Petersilie (frisch)', 'Schnittlauch', 'Dill', 'Minze', 'Estragon'
  ],
  'Öle & Flüssigkeiten': [
    'Pflanzenöl', 'Olivenöl (nativ)', 'Olivenöl (extra nativ)', 'Kokosöl', 'Rapsöl',
    'Sesamöl', 'Wasser', 'Gemüsebrühe', 'Hühnerbrühe', 'Rinderbrühe',
    'Weißwein', 'Rotwein', 'Bier', 'Tomatensaft', 'Sojasauce', 'Worcestershire Sauce',
    'Fischsauce', 'Limoncello', 'Amaretto'
  ],
  'Fertigprodukte': [
    'Pesto (rot)', 'Pesto (grün)', 'Tomatenmark', 'Brühwürfel', 'Saft (Orange)',
    'Saft (Zitrone)', 'Grieß', 'Haferflocken', 'Müsli', 'Safran'
  ]
};

/**
 * Filter common ingredients by a search string.
 * Returns up to 8 matches, case-insensitive substring match.
 */
export function filterCommonIngredients(query, limit = 8) {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  return COMMON_INGREDIENTS.filter(name => name.toLowerCase().includes(q)).slice(0, limit);
}