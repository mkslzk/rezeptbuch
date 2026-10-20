/**
 * Kategorien + Ernährungs-Tags für Angebote — reine Heuristik, offline, ohne API.
 *
 * Ziel: im Angebote-Tab nach Warengruppen filtern (Obst & Gemüse, Fleisch & Fisch,
 * Milchprodukte, Brot, Vorrat, Tiefkühl, Getränke, Süßwaren, Drogerie, Non-Food) und
 * pflanzliche Angebote schneller finden. Bewusst konservativ: lieber `sonstiges`/`null`
 * als eine falsche Einstufung.
 *
 * Reihenfolge der Prüfungen ist wichtig (deutsche Komposita): spezifische Warengruppen
 * vor allgemeinen, z. B. "Käsekuchen" → Backwaren, "Milchschokolade" → Süßwaren.
 *
 * Später kann das durch Open-Food-Facts (`ingredients_analysis_tags`) ersetzt/ergänzt
 * werden — die API liefert `en:vegan` / `en:non-vegan` je Produkt.
 */

const CATEGORIES = {
  'obst-gemuese': 'Obst & Gemüse',
  'fleisch-fisch': 'Fleisch & Fisch',
  'milch-eier': 'Milchprodukte & Eier',
  'brot-backwaren': 'Brot & Backwaren',
  'vorrat': 'Vorrat & Konserven',
  'tiefkuehl': 'Tiefkühl',
  'getraenke': 'Getränke',
  'suesses-snacks': 'Süßwaren & Snacks',
  'pflanzlich': 'Pflanzliche Alternativen',
  'drogerie-haushalt': 'Drogerie & Haushalt',
  'nonfood': 'Non-Food',
  'sonstiges': 'Sonstiges',
  'aktion': 'Rabatt-Aktionen',
};

const FOOD_CATEGORIES = new Set([
  'obst-gemuese', 'fleisch-fisch', 'milch-eier', 'brot-backwaren',
  'vorrat', 'tiefkuehl', 'getraenke', 'suesses-snacks', 'pflanzlich', 'sonstiges',
]);

// Reihenfolge = Prüfreihenfolge (erste Übereinstimmung gewinnt)
const RULES = [
  ['drogerie-haushalt', [
    'shampoo', 'duschgel', 'duschbad', 'seife', 'handseife', 'zahnpasta', 'zahnpflege',
    'mundspülung', 'mundspuelung', 'deodorant', 'deo', 'rasierklingen', 'damenhygiene', 'binden',
    'tampons', 'windeln', 'feuchttücher', 'feuchttuecher', 'taschentücher', 'taschentuecher',
    'toilettenpapier', 'klopapier', 'küchenrolle', 'kuechenrolle', 'müllbeutel', 'muellbeutel',
    'waschmittel', 'weichspüler', 'weichspueler', 'spülmittel', 'spuelmittel', 'geschirrspültabs',
    'geschirrspueltabs', 'geschirrspülmittel', 'geschirrspuelmittel', 'klarspüler', 'klarspueler',
    'putzmittel', 'allzweckreiniger', 'badreiniger', 'glasreiniger', 'wc-reiniger', 'scheuermilch',
    'entkalker', 'fleckenentferner', 'wäscheparfüm', 'waescheparfuem', 'raumspray', 'duftspray',
    'lufterfrischer', 'kerzenwachs', 'alkoholfrei', 'sonnencreme', 'sonnenmilch', 'bodylotion',
    'handcreme', 'gesichtscreme', 'gesichtsmaske', 'make-up', 'mascara', 'lippenstift', 'nagellack',
    'haarspray', 'haargel', 'trockenshampoo',
    'zahncreme', 'deospray', 'deoroller', 'reinigungstücher', 'reinigungstuecher', 'feuchttücher',
    'pflegedusche', 'body creme', 'bodycreme', 'lotion', 'creme', 'duschpeeling',
    'reiniger', 'wc-schaum', 'edt', 'eau de', 'parfum', 'parfüm', 'parfuem',
    'gesichtswasser', 'abschmink', 'wattestäbchen', 'wattestaebchen', 'pflaster',
    'desinfektion', 'hygienespray', 'raumduft', 'duftöl', 'duftoel',
    'cream', 'serum', 'gel', 'maske', 'peeling', 'handwash', 'seifenspender',
    'bodyspray', 'edp', 'dusche', 'after shave', 'aftershave']],
  ['nonfood', [
    'akkustaubsauger', 'staubsauger', 'kopfhörer', 'kopfhoerer', 'handy', 'smartphone', 'tablet',
    'drucker', 'tastatur', 'maus', 'monitor', 'fernseher', 'lautsprecher', 'powerbank', 'kabel',
    'ladegerät', 'ladegeraet', 'akku', 'batterie', 'batterien', 'glühbirne', 'gluehbirne', 'lampe',
    'leuchte', 'steckdose', 'werkzeug', 'bohrmaschine', 'schraubenzieher', 'schraube', 'hammer',
    'zange', 'säge', 'saege', 'pinsel', 'farbe', 'tapete', 'silberdraht', 'kissen', 'bettdecke',
    'bettwäsche', 'bettwaesche', 'matratze', 'handtuch', 'vorhang', 'teppich', 'regal', 'schrank',
    'stuhl', 'tisch', 'sessel', 'sofa', 'kommode', 'pfanne', 'topf', 'wok', 'geschirr', 'teller',
    'tasse', 'glas', 'besteck', 'messer', 'gabel', 'löffel', 'loeffel', 'schneidebrett', 'backform',
    'auflaufform', 'behälter', 'behaelter', 'aufbewahrungsbox', 'boxen', 'korb', 'vase', 'blumentopf',
    'pflanzenerde', 'erdbeeren pflanzen', 'gartenschlauch', 'rasenmäher', 'rasenmaeher', 'grill',
    'holzkohle', 'grillkohle', 'jacke', 'hose', 'pullover', 'hemd', 'socken', 'schuhe', 'stiefel',
    'mütze', 'muetze', 'schal', 'handschuhe', 't-shirt', 'kleid', 'gürtel', 'guertel', 'tasche',
    'rucksack', 'koffer', 'spielzeug', 'puppe', 'puzzle', 'brettspiel', 'schleifen', 'stuhlschleifen',
    'geschenkverpackung', 'geschenkpapier', 'kerze', 'servietten', 'luftballons', 'schreibwaren',
    'kapselmaschine', 'kaffeemaschine', 'wasserkocher', 'toaster', 'mikrowelle', 'küchenmaschine',
    'kuechenmaschine', 'mixer', 'pürierstab', 'puerierstab', 'fritteuse', 'kühlschrank', 'kuehlschrank',
    'backofen', 'herdplatte', 'kochfeld', 'staubsaugerbeutel', 'filtertüten', 'filtertueten',
    'kalender', 'notizbuch', 'kaugummi-automat', 'zahnbürste', 'zahnbuerste', 'rasierer', 'haartrockner',
    'lockenstab', 'glätteisen', 'glaetteisen', 'waage', 'thermometer', 'ventilator', 'heizlüfter',
    'heizluefter', 'luftreiniger', 'ventilkappen', 'reifen', 'motoröl', 'motoroel', 'wischblatt',
    'katzenstreu', 'hundefutter', 'katzenfutter', 'vogelfutter', 'wildvogelfutter', 'meisenknödel',
    'meisenknoedel', 'grillanzünder', 'grillanzuender', 'adventskalender-auto', 'gartenmöbel',
    'gartenmoebel', 'sonnenschirm', 'pool', 'luftmatratze', 'zelt', 'schlafsack',
    'orchidee', 'weihnachtskarten', 'weihnachtsmann', 'figur', 'schlafanzug', 'pyjama', 'nasenspreizer', 'lichterkette', 'pyramide', 'led', 'silikon', 'buch', 'bildband',
    'lego', 'bausteine', 'bauset', 'eisenbahn', 'stofftier', 'kuscheltier', 'puzzle', 'brettspiel',
    'backpapier', 'backblech', 'steckerleiste', 'klebeband', 'alleskleber', 'putzkelle', 'abgiesshilfe',
    'abgießhilfe', 'bohrer', 'antihaft', 'backform', 'kelle', 'schuessel', 'schüssel', 'deko', 'wichtel',
    'zwerg', 'gesteck', 'kranz', 'schmuck', 'sleepshirt', 'slips', 'shirt', 'router', 'wlan',
    'blumen', 'pflanze', 'alpenveilchen', 'amaryllis', 'anthurie', 'heidekraut', 'primel', 'hyazinthe',
    'tulpen', 'narzissen', 'blumenerde', 'katzen', 'nassfutter', 'trockenfutter', 'whiskas', 'sheba',
    'boxershort', 'boxershorts', 'boxer', 'unterzieher', 'unterwäsche', 'unterwaesche', 'leggings',
    'helm', 'fahrradhelm', 'roller', 'farbroller', 'verdünner', 'verduenner', 'werkstatt',
    'bett', 'boxspringbett', 'lattenrost', 'roboter', 'saugroboter', 'wischroboter', 'staubsauger',
    'stift', 'gel pen', 'kugelschreiber', 'hot wheels', 'modellauto', 'aufbewahrung', 'gläser',
    'glaeser', 'vorratsglas', 'vorratsdose', 'decke', 'plaid', 'gardine', 'duschvorhang',
    'werkzeugkoffer', 'schraubendreher', 'bits', 'hantel', 'fitness', 'yoga', 'luftpumpe',
    'einkaufswagen', 'chip', 'trolley', 'regal', 'regalboden', 'kommode', 'nachttisch',
    'hoodie', 'sweatshirt', 'mantel', 'weste', 'topper', 'kaltschaum', 'babywippe',
    'schutzgitter', 'windeleimer', 'mopp', 'geschenktüte', 'geschenktuete', 'geschenkkarte',
    'isolierbecher', 'trinkflasche', 'brille', 'wäschewanne', 'waeschewanne', 'herbstheide',
    'handtuchset', 'badematte', 'duschmatte', 'fußmatte', 'fussmatte',]],
  ['tiefkuehl', [
    'tiefkühl', 'tiefkuehl', 'tk-', 'gefroren', 'pizza', 'pommes', 'kroketten', 'eispizza',
    'eiscreme', 'eis am stiel', 'speiseeis', 'vanilleeis', 'schokoeis', 'fischstäbchen',
    'fischstaebchen', 'rahmspinat', 'tk-gemüse', 'tk-gemuese', 'frost',
    'potato wedges', 'wedges', 'kroketten',]],
  ['getraenke', [
    'wasser', 'mineralwasser', 'sprudel', 'saft', 'fruchtsaft', 'orangensaft', 'apfelsaft',
    'multivitaminsaft', 'limonade', 'limo', 'cola', 'fanta', 'sprite', 'schorle', 'bier', 'pils',
    'weizenbier', 'weissbier', 'wein', 'rotwein', 'weißwein', 'weisswein', 'rosé', 'rosewein', 'roséwein',
    'sekt', 'prosecco', 'champagner', 'schnaps', 'likör', 'likoer', 'whisky', 'vodka', 'rum',
    'gin', 'aperitif', 'energy-drink', 'energydrink', 'smoothie', 'tee', 'kaffee', 'espresso',
    'cappuccino', 'getränk', 'getraenk', 'erfrischungsgetränk', 'erfrischungsgetraenk',
    'milchshake', 'latte', 'kombucha', 'tonic', 'drink', 'smoothies',
    'spezi', 'helles', 'pilsener', 'radler', 'kraft-aktiv',
    'coffee', 'pads', 'coffee pads', 'kaffeepads', 'kaffeekapseln',
    'caffè', 'caffe', 'vitaminwater', 'near water', 'bubble tea', 'eistee',
    'kräutertee', 'kraeutertee', 'früchtetee', 'fruechtetee', 'schwarztee',
    'kamillentee', 'pfefferminztee', 'grüntee', 'gruentee', 'rooibos',]],
  ['pflanzlich', [
    'tofu', 'tempeh', 'seitan', 'räuchertofu', 'raeuchertofu', 'sojajoghurt', 'sojajogurt',
    'plant based', 'plant-based', 'like meat', 'likemeat', 'vemondo', 'alpro', 'oatly',
    'vegane wurst', 'vegane schnitzel', 'veganer aufschnitt',
    'kokosjoghurt', 'nussdrink', 'hafercreme', 'veganer käse', 'veganer kaese', 'vegane butter',
    'haferdrink', 'hafermilch', 'mandelmilch', 'reismilch', 'sojadrink', 'kokosdrink', 'dinkeldrink',
  ]],
  ['fleisch-fisch', [
    'fleisch', 'wurst', 'würstchen', 'wuerstchen', 'schinken', 'salami', 'salamis', 'hähnchen',
    'haehnchen', 'huhn', 'hühner', 'huehner', 'pute', 'puten', 'truthahn', 'rind', 'rinder',
    'schwein', 'schweine', 'hackfleisch', 'hackbällchen', 'hackbaellchen', 'steak', 'braten',
    'schnitzel', 'kotelett', 'gulasch', 'ragout', 'speck', 'bacon', 'leberwurst', 'bratwurst',
    'wiener', 'frankfurter', 'aufschnitt', 'mortadella', 'gyros', 'kebab', 'döner', 'doener',
    'chicken', 'nuggets', 'wings', 'flügel', 'fluegel', 'lachs', 'räucherlachs', 'raeucherlachs',
    'thunfisch', 'fisch', 'fischstäbchen', 'fischstaebchen', 'garnelen', 'shrimps', 'forelle',
    'hering', 'matjes', 'makrele', ' sardinen', 'sardinen', 'muscheln', 'tintenfisch', 'krabben',
    'surimi', 'mehlwürmer', 'mehlwuermer', 'insekt', 'wildschwein', 'hirsch', 'lamm', 'kalb',
    'ente', 'gans', 'leberkäse', 'leberkaese', 'fleischsalat', 'metzgerei', 'wurstaufschnitt',
    'rotbarsch', 'seelachs', 'kabeljau', 'zander', 'fischfilet', 'fischfilets', 'scholle',
    'heilbutt', 'dorade', 'wolfsbarsch', 'scampi', 'jakobsmuschel', 'aal', 'rollmops',
  ]],
  ['brot-backwaren', [
    'brot', 'brote', 'brötchen', 'broetchen', 'baguette', 'toast', 'croissant', 'brezel', 'laugen',
    'bäckerei', 'baeckerei', 'kuchen', 'torte', 'waffel', 'waffeln', 'muffin', 'stollen', 'plunder',
    'hefezopf', 'zimtschnecke', 'donut', 'gebäck', 'gebaeck', 'knäckebrot', 'knaeckebrot',
    'zwieback', 'biskuit', 'nussschnecke', 'käsekuchen', 'kaesekuchen', 'streuselkuchen',
    'rolls', 'hot dog', 'burger bun', 'buns', 'sandwich', 'wrap', 'fladenbrot', 'pita',
    'berliner', 'krapfen', 'danish',
  ]],
  ['suesses-snacks', [
    'schokolade', 'schoko', 'praline', 'pralinen', 'bonbon', 'bonbons', 'gummibärchen',
    'gummibaerchen', 'lakritz', 'chips', 'salzstangen', 'popcorn', 'erdnüsse', 'erdnuesse',
    'cashew', 'mandeln', 'walnüsse', 'walnuesse', 'pistazien', 'haselnüsse', 'haselnuesse',
    'nussmischung', 'studentenfutter', 'keks', 'kekse', 'butterkeks', 'dominosteine',
    'lebkuchen', 'marzipan', 'nougat', 'toffee', 'karamell', 'marshmallow', 'fruchtgummi',
    'weingummi', 'eis am stiel', 'schokokuss', 'schokoküsse', 'schokokuesse', 'riegel',
    'müsliriegel', 'muesliriegel', 'proteinriegel', 'flips', 'cracker', 'salzgebäck',
    'salzgebaeck', 'käsegebäck', 'kaesegebaeck', 'obstgummi', 'lakritzschnecke', 'zuckerwatte',
    'knoppers', 'raffaello', 'toffifee', 'duplo', 'kinder country', 'kinder pingui', 'kinder bueno', 'milka', 'ritter sport', 'lindt', 'haribo', 'katjes', 'oreo', 'pringles', 'funny-frisch', 'cantuccini', 'zimtsterne', 'dominosteine', 'maronen',
    'crossies', 'choco crossies', 'schokoriegel', 'pralinenbox',
    'haselnusskerne', 'nusskerne', 'kürbiskerne', 'kuerbiskerne', 'sonnenblumenkerne',
    'halloween snacks', 'snacks',]],
  ['milch-eier', [
    'milch', 'butter', 'buttercreme', 'käse', 'kaese', 'joghurt', 'jogurt', 'quark', 'sahne',
    'creme fraiche', 'crème fraîche', 'schmand', 'kefir', 'buttermilch', 'mozzarella', 'gouda',
    'camembert', 'feta', 'brie', 'edamer', 'emmentaler', 'hirtenkäse', 'hirtenkaese', 'hüttenkäse',
    'huettenkaese', 'frischkäse', 'frischkaese', 'parmesan', 'ricotta', 'mascarpone', 'skyr',
    'ei', 'eier', 'eigelb', 'eiklar', 'freilandeier', 'bodeneier', 'weideneier', 'rahm',
    'schlagsahne', 'sauerrahm', 'crème', 'pudding', 'milchreis', 'griechischer joghurt',
    'actimel', 'fruchtzwerge', 'joghurt-drink',
    'sanella', 'margarine', 'streichfett', 'kaesescheiben', 'käsescheiben',]],
  ['vorrat', [
    'nudeln', 'nudel', 'pasta', 'spaghetti', 'spagetti', 'penne', 'fusilli', 'reis', 'basmati',
    'jasminreis', 'couscous', 'bulgur', 'quinoa', 'mehl', 'zucker', 'salz', 'pfeffer', 'öl', 'oel',
    'olivenöl', 'olivenoel', 'rapsöl', 'raps-oel', 'sonnenblumenöl', 'sonnenblumenoel', 'essig',
    'balsamico', 'konserve', 'dose', 'dosen', 'passierte tomaten', 'tomatenmark', 'sauce', 'soße',
    'sosse', 'ketchup', 'mayonnaise', 'mayo', 'senf', 'gewürz', 'gewuerz', 'brühe', 'bruehe',
    'backpulver', 'hefe', 'haferflocken', 'müsli', 'muesli', 'cornflakes', 'honig', 'marmelade',
    'konfitüre', 'konfituere', 'nutella', 'nussnougatcreme', 'erdnussbutter', 'suppe', 'eintopf',
    'fertiggericht', 'ravioli', 'linsen', 'bohnen', 'kichererbsen', 'mais', 'kokosmilch',
    'sojasauce', 'sojasoße', 'sriracha', 'curry', 'pesto', 'tahin', 'sesam', 'leinsamen',
    'chiasamen', 'proteinpulver', 'haferdrink', 'hafermilch', 'mandelmilch', 'sojadrink',
    'reismilch', 'kokosdrink', 'agavendicksaft', 'ahornsirup', 'vanillezucker', 'speisestärke',
    'speisestaerke', 'grieß', 'griess', 'polenta', 'knödel', 'knoedel', 'spätzle', 'spaetzle',
    'noodles', 'longhetti', 'fix', 'würzmischung', 'wuerzmischung', 'tütensuppe', 'tuetensuppe', 'kuvertüre', 'kuverture', 'zitronat', 'backzutat', 'fertigteig', 'kapern', 'backoblaten', 'oblaten', 'vanilleschoten',
    'bouillon', 'cannelloni', 'fondant', 'tortenguss', 'speisefarbe', 'marzipanrohmasse',
    'würzöl', 'wuerzoel', 'pelmeni', 'nesquik',]],
  ['obst-gemuese', [
    'apfel', 'äpfel', 'aepfel', 'banane', 'bananen', 'birne', 'birnen', 'traube', 'trauben',
    'weintrauben', 'kiwi', 'orange', 'orangen', 'mandarine', 'clementine', 'zitrone', 'zitronen',
    'limette', 'tomate', 'tomaten', 'gurke', 'gurken', 'salat', 'kopfsalat', 'rucola', 'feldsalat',
    'eisbergsalat', 'kartoffel', 'kartoffeln', 'zwiebel', 'zwiebeln', 'karotte', 'karotten',
    'möhre', 'moehre', 'möhren', 'moehren', 'paprika', 'brokkoli', 'blumenkohl', 'rosenkohl',
    'spinat', 'porree', 'lauch', 'champignon', 'champignons', 'pilze', 'avocado', 'mango',
    'ananas', 'melone', 'wassermelone', 'honigmelone', 'beere', 'beeren', 'erdbeere', 'erdbeeren',
    'himbeere', 'himbeeren', 'blaubeere', 'blaubeeren', 'heidelbeeren', 'brombeeren', 'pfirsich',
    'nektarine', 'pflaume', 'pflaumen', 'aprikose', 'aprikosen', 'kohl', 'weißkohl', 'weisskohl',
    'rotkohl', 'grünkohl', 'gruenkohl', 'rettich', 'radieschen', 'sellerie', 'zucchini',
    'aubergine', 'kürbis', 'kuerbis', 'ingwer', 'knoblauch', 'kräuter', 'kraeuter', 'basilikum',
    'petersilie', 'schnittlauch', 'dill', 'minze', 'obst', 'gemüse', 'gemuese', 'frischobst',
    'salatgurke', 'spitzkohl', 'staudensellerie', 'mangold', 'artischocke', 'spargel',
    'kaki', 'maronenpilz', 'physalis',
    'chicoree', 'chicorée', 'feldsalat',]],
];

/** Normalisiert Text für den Vergleich (klein, ohne Sonderzeichen, einfache Umlaute doppelt). */
function norm(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesAny(text, keywords) {
  for (const kw of keywords) {
    const k = kw.toLowerCase();
    // Kurze Begriffe ("ei", "öl") nur als eigenes Wort — sonst trifft "ei" auch "Wein", "Reis", "Eis".
    if (k.length <= 3) {
      const re = new RegExp(`(^|[^a-zäöüß0-9])${escapeRegex(k)}([^a-zäöüß0-9]|$)`, 'i');
      if (re.test(text)) return kw;
    } else if (text.includes(k)) {
      return kw;
    }
  }
  return null;
}

// Kaufda-Kategoriepfade ("Lebensmittel > Molkereiprodukte") → Warengruppe
const PATH_HINTS = [
  ['tiefkuehl', ['tiefkühl', 'tiefkuehl', 'tk-']],
  ['getraenke', ['getränk', 'getraenk', 'bier', 'wein', 'spirituosen', 'wasser']],
  ['milch-eier', ['molkerei', 'milch', 'käse', 'kaese', 'eier']],
  ['fleisch-fisch', ['fleisch', 'wurst', 'fisch', 'metzgerei', 'geflügel', 'gefluegel']],
  ['obst-gemuese', ['obst', 'gemüse', 'gemuese']],
  ['brot-backwaren', ['brot', 'backwaren', 'bäckerei', 'baeckerei']],
  ['suesses-snacks', ['süßwaren', 'suesswaren', 'snacks', 'schokolade', 'keks']],
  ['vorrat', ['konserven', 'vorrat', 'nudeln', 'reis', 'öl', 'oel', 'gewürz', 'gewuerz']],
  ['pflanzlich', ['vegan', 'vegetarisch', 'pflanzlich', 'fleischersatz']],
  ['drogerie-haushalt', ['drogerie', 'haushalt', 'körperpflege', 'koerperpflege', 'reinigung', 'waschmittel']],
  ['nonfood', ['möbel', 'moebel', 'elektronik', 'haushaltsgeräte', 'haushaltsgeraete', 'kleidung',
    'schuhe', 'garten', 'baumarkt', 'spielwaren', 'büro', 'buero', 'auto', 'tierbedarf']],
];

// Starke Vegan-Signale (explizit deklariert) und Tierprodukte
const VEGAN_STRONG = [
  'vegan', 'pflanzlich', 'plant based', 'plant-based', 'veggie', 'tofu', 'tempeh', 'seitan',
  'vemondo', 'alpro', 'oatly', 'likemeat', 'like meat', 'vegane', 'veganer', 'veganes',
];
const VEGAN_BRANDS = ['vemondo', 'alpro', 'oatly', 'taifun', 'vivera', 'likemeat', 'veganz', 'denns'];
const DAIRY_EGG = [
  'milch', 'butter', 'käse', 'kaese', 'joghurt', 'jogurt', 'quark', 'sahne', 'schmand', 'kefir',
  'mozzarella', 'gouda', 'feta', 'camembert', 'parmesan', 'frischkäse', 'frischkaese', 'skyr',
  'ei', 'eier', 'eigelb', 'eiklar', 'honig', 'mascarpone', 'ricotta', 'crème', 'creme fraiche',
  'gelatine', 'buttermilch', 'rahm', 'milchpulver', 'molkenpulver',
];
const MEAT_FISH = [
  'fleisch', 'wurst', 'schinken', 'salami', 'hähnchen', 'haehnchen', 'huhn', 'pute', 'rind',
  'schwein', 'hack', 'steak', 'braten', 'schnitzel', 'speck', 'bacon', 'leberwurst', 'bratwurst',
  'wiener', 'aufschnitt', 'mortadella', 'gyros', 'kebab', 'döner', 'doener', 'chicken', 'lachs',
  'thunfisch', 'fisch', 'garnelen', 'shrimps', 'forelle', 'hering', 'matjes', 'makrele', 'sardinen',
  'muscheln', 'tintenfisch', 'krabben', 'surimi', 'mehlwürmer', 'mehlwuermer', 'lamm', 'kalb',
  'wild', 'leberkäse', 'leberkaese', 'fleischsalat', 'metzgerei', 'gelatine',
];

// Werbezeilen wie "20 % Rabatt", "2 Euro Artikel", "30 % Exklusive Rabatte" sind keine Produkte.
// Bewusst streng: "Milch 3,5 %" darf nicht als Aktion gelten.
const PROMO_RE = /^\s*\d+([.,]\d+)?\s*%|rabatt|exklusive|\d+\s*(€|euro)\s*artikel/i;

function pickCategory(text, pathText) {
  if (PROMO_RE.test(text)) return 'aktion';
  // 1) Kaufda-Kategoriepfad ist die verlässlichste Quelle
  if (pathText) {
    for (const [cat, hints] of PATH_HINTS) {
      if (matchesAny(pathText, hints)) return cat;
    }
  }
  // 2) Schlüsselwörter im Produktnamen/Marke/Beschreibung
  for (const [cat, keywords] of RULES) {
    if (matchesAny(text, keywords)) return cat;
  }
  return null;
}

function pickDiet(text, brand, category) {
  const brandText = norm(brand);
  if (VEGAN_BRANDS.some((b) => brandText.includes(b))) return 'vegan';
  if (matchesAny(text, VEGAN_STRONG)) return 'vegan';
  // Die Warengruppe "pflanzlich" enthält per Definition pflanzliche Produkte
  if (category === 'pflanzlich') return 'vegan';
  if (matchesAny(text, MEAT_FISH)) return 'fleisch';
  if (matchesAny(text, DAIRY_EGG)) return 'vegetarisch';
  return null;
}

/**
 * Klassifiziert ein Angebot.
 * @param {{name:string, brand?:string, description?:string, category?:string, categoryPaths?:string[]}} offer
 * @returns {{category:string, categoryLabel:string, diet:string|null, isFood:boolean}}
 */
function classifyOffer(offer = {}) {
  const nameText = norm([offer.name, offer.brand, offer.description].filter(Boolean).join(' '));
  const pathText = norm([offer.category, ...(Array.isArray(offer.categoryPaths) ? offer.categoryPaths : [])]
    .filter(Boolean).join(' '));

  // Zusammengesetzte Wörter, bei denen ein generisches Keyword daneben liegt:
  // "Weizenmehl" ist kein Weizenbier, "Eiscreme" keine Drogerie-Creme.
  const OVERRIDES = [
    [/weizenmehl|dinkelmehl|roggenmehl|hafermehl/, 'vorrat'],
    [/eiscreme|speiseeis|eis am stiel|eisbecher|vanilleeis|schokoeis/, 'tiefkuehl'],
    [/teewurst/, 'fleisch-fisch'],
  ];
  const override = OVERRIDES.find(([re]) => re.test(nameText));

  // Explizite Kaufda-Kategorie übernehmen, wenn sie sich zuordnen lässt
  let category = override ? override[1] : pickCategory(nameText, pathText);
  if (!category) category = 'sonstiges';

  const diet = pickDiet(nameText, offer.brand, category);
  // Vegan deklarierte Ersatzprodukte (Wurst, Käse, Nuggets …) gehören zu den pflanzlichen Alternativen.
  // Vegan deklarierte Grundnahrungsmittel (Kapern, Reis, Backoblaten) behalten ihre Warengruppe.
  if (diet === 'vegan' && (category === 'milch-eier' || category === 'fleisch-fisch')) {
    category = 'pflanzlich';
  }

  return {
    category,
    categoryLabel: CATEGORIES[category] || CATEGORIES.sonstiges,
    diet,
    isFood: FOOD_CATEGORIES.has(category),
  };
}

module.exports = { classifyOffer, CATEGORIES, FOOD_CATEGORIES, _internals: { norm, pickCategory, pickDiet } };
