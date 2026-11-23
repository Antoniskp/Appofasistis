'use strict';

const $ = selector => document.querySelector(selector);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const date = value => value ? new Date(value).toLocaleString('el-GR', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const number = value => Number(value || 0).toLocaleString('el-GR');
const state = { page: 1, q: '', category: '', type: '', sort: 'recent', guides: {}, items: [], selected: null, tab: 'overview', loading: 0, loadingDoc: 0, importing: false, dirty: false, jobs: [], focusArticle: null, focusParagraph: null, readerQuery: '' };
const safeUrl = value => { try { const url = new URL(value); return ['http:', 'https:'].includes(url.protocol) ? url.href : ''; } catch { return ''; } };
const citation = doc => doc.citation_label || (doc.law_number ? 'Ν. ' + doc.law_number + '/' + (doc.law_year || '—') : 'Κοινοβουλευτικό έγγραφο');
const primaryNumber = unit => unit.navigation_number || unit.article_number || (!unit.parent_id ? unit.paragraph_number : null);
const sourceLink = (url, title = 'Επίσημη πηγή ↗') => safeUrl(url) ? '<a href="' + esc(safeUrl(url)) + '" target="_blank" rel="noopener noreferrer">' + esc(title) + '</a>' : '<span class="muted">Δεν υπάρχει διαθέσιμος σύνδεσμος</span>';
const foldQuery = value => String(value).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ς/g, 'σ');

// Editorial judgments about the cited original publications, never validity determinations.
const editorPicks = [
  { id: 'absurd', title: 'Τα πιο παράλογα με σημερινά μάτια', label: 'Παράλογα',
    intro: 'Η υπερβολική λεπτομέρεια, η αυλή και οι ασυνήθιστες ποινές του 1833. Το ιστορικό πλαίσιο εξηγεί πολλά· η επιλογή παραμένει υποκειμενική.',
    items: [
      { doc: 'royal_decree:national_cockade:1833', provision: '1', title: 'Το κράτος ορίζει μέχρι και την αναλογία της κοκάρδας', reference: '1833 · § 1 · ΦΕΚ 8',
        fact: 'Το κυανό καταλαμβάνει τα δύο τρίτα της διαμέτρου και το λευκό το υπόλοιπο τρίτο του εθνοσήμου.',
        why: 'Το διάλεξα για την εντυπωσιακή γεωμετρική ακρίβεια ενός βασιλικού διατάγματος για ένα στολίδι καπέλου.',
        context: 'Πρόκειται για κρατικό σύμβολο: η § 2 επιβάλλει τη χρήση σε όσους φορούν πολιτική ή στρατιωτική στολή, ενώ η § 3 την επιτρέπει στους υπόλοιπους υπηκόους.', source: 'https://api.et.gr/apiFEK/1/1833/8/pdf' },
      { doc: 'royal_decree:public_hygiene_building_offences:1833', article: '4', title: 'Ακαθαρσίες από εκδίκηση; Προβλέπεται και φυλακή', reference: '1833 · άρθρο 4 · ΦΕΚ 10',
        fact: 'Η ρίψη ακαθαρσιών σε άλλον ή στο κτίριό του επιφέρει πρόστιμο. Αν γίνεται από κακία ή εκδίκηση, προστίθενται μία έως οκτώ ημέρες φυλάκισης.',
        why: 'Η ειδική διάκριση ανάμεσα στην απλή ρίψη και την εκδικητική ρίψη είναι από τις πιο απρόσμενες διατυπώσεις της συλλογής.',
        context: 'Η προστασία της δημόσιας υγείας έχει σαφή σκοπό. Εδώ ξεχωρίζω την ασυνήθιστη εξειδίκευση της συμπεριφοράς και της ποινής.', source: 'https://api.et.gr/apiFEK/1/1833/10/pdf' },
      { doc: 'royal_decree:ministries_office_procedure:1833', article: '18', title: 'Πάνω από 24 ώρες μακριά; Άδεια από τον Βασιλιά', reference: '1833 · άρθρο 18 · ΦΕΚ 13',
        fact: 'Ο Γραμματέας της Επικρατείας δεν μπορεί να απομακρυνθεί πάνω από 24 ώρες από τη θέση του χωρίς βασιλική άδεια.',
        why: 'Μια καθημερινή υπηρεσιακή απουσία φτάνει μέχρι την κορυφή του κράτους: χαρακτηριστική εικόνα υπερσυγκέντρωσης.',
        context: 'Αφορά τους Γραμματείς της Επικρατείας, δηλαδή την ηγεσία των υπουργείων, όχι κάθε πολίτη ή κάθε υπάλληλο.', source: 'https://api.et.gr/apiFEK/1/1833/13/pdf' },
    ] },
  { id: 'power', title: 'Εξουσία χωρίς αρκετά αντίβαρα', label: 'Κατάχρηση εξουσίας',
    intro: 'Οι επιλογές μου για το ερώτημα «ποιοι νόμοι ευνοούν τη διαφθορά;»: διατάξεις που περιορίζουν τον έλεγχο της εξουσίας ή συγκεντρώνουν υπερβολική ισχύ. Αυτή είναι ερμηνεία κινδύνου, όχι απόδειξη δωροδοκίας ή τεκμηριωμένη κατάταξη διαφθοράς.',
    items: [
      { doc: 'law:press_abuse_offences:1833', article: '4', title: 'Φυλάκιση για περιφρονητικά σκώμματα κατά της πολιτείας', reference: '1833 · άρθρο 4 · ΦΕΚ 29',
        fact: 'Η προσβολή της πολιτείας ή των νόμων της με ύβρεις, λοιδορίες ή περιφρονητικά σκώμματα τιμωρείται με φυλάκιση.',
        why: 'Η δική μου κρίση: όταν η εξουσία θωρακίζεται από τη δημόσια χλεύη με ποινές φυλάκισης, ο έλεγχός της γίνεται πιο δύσκολος.',
        context: 'Η σύνδεση με κίνδυνο κατάχρησης είναι εκδοτική αξιολόγηση του κειμένου· το άρθρο δεν αποδεικνύει συγκεκριμένη πράξη διαφθοράς.', source: 'https://api.et.gr/apiFEK/1/1833/29/pdf' },
      { doc: 'law:press_police:1833', article: '2', title: 'Αναγνωστήριο μόνο με άδεια της Αρχής', reference: '1833 · άρθρο 2 · ΦΕΚ 29',
        fact: 'Για τη λειτουργία ιδιωτικού αναγνωστηρίου ή δανειστηρίου συγγραμμάτων χωρίς άδεια της Αρχής προβλέπονται φυλάκιση και πρόστιμο.',
        why: 'Το διάλεξα επειδή η διοίκηση αποκτά έλεγχο ακόμη και στους χώρους πρόσβασης στη γνώση — ένα ισχυρό εργαλείο επιλεκτικού αποκλεισμού.',
        context: 'Το κείμενο θεσπίζει αδειοδότηση και κυρώσεις. Η πιθανότητα αυθαίρετης εφαρμογής είναι δική μου αξιολόγηση, όχι καταγεγραμμένο περιστατικό.', source: 'https://api.et.gr/apiFEK/1/1833/29/pdf' },
      { doc: 'royal_decree:public_security:1833', article: '9', title: 'Συνοπτική δίκη, εκτέλεση απόφασης μέσα σε 24 ώρες', reference: '1833 · άρθρο 9 · ΦΕΚ 4',
        fact: 'Το άρθρο προβλέπει συνοπτική δίκη, δημόσια συνεδρίαση και εκτέλεση της απόφασης μέσα σε 24 ώρες. Επιτρέπει αναβολή όταν το δικαστήριο προτείνει χάρη.',
        why: 'Σε ένα διάταγμα που περιλαμβάνει θανατικές ποινές, αυτός ο ελάχιστος χρόνος μου φαίνεται ιδιαίτερα επικίνδυνος για τη διόρθωση μιας άδικης απόφασης.',
        context: 'Αφορά τα ειδικά δικαστήρια και τα εγκλήματα του συγκεκριμένου διατάγματος. Το άρθρο 10 δηλώνει τον προσωρινό χαρακτήρα του.', source: 'https://api.et.gr/apiFEK/1/1833/4/pdf' },
    ] },
  { id: 'useful', title: 'Χρήσιμα στην καθημερινότητα', label: 'Πρακτικά χρήσιμα',
    intro: 'Τρεις δικές μου αφετηρίες με ευρύ πρακτικό ενδιαφέρον. Διαβάζεις την αρχική δημοσίευση που έχει η συλλογή· μεταγενέστερες αλλαγές δεν ενσωματώνονται αυτόματα.',
    items: [
      { doc: 'law:4727:2020', article: '27', title: 'Έγγραφα μέσω gov.gr', reference: 'Ν. 4727/2020 · άρθρο 27',
        fact: 'Το άρθρο αφορά την έκδοση εγγράφων μέσω της Ενιαίας Ψηφιακής Πύλης της Δημόσιας Διοίκησης.',
        why: 'Το διάλεξα γιατί συνδέει μια συνηθισμένη συναλλαγή με το Δημόσιο με το νομικό πλαίσιο της ψηφιακής εξυπηρέτησης.',
        context: 'Αρχικό ΦΕΚ του 2020. Για συγκεκριμένη διαδικασία, έλεγξε και τις σημερινές οδηγίες της αρμόδιας υπηρεσίας.', source: 'https://adae.gov.gr/images/nomothetiko-plaisio/Nomos_4727_2020_01.pdf' },
      { doc: 'law:4967:2022', article: '18', title: 'Όταν μια ψηφιακή παροχή δεν ανταποκρίνεται στη σύμβαση', reference: 'Ν. 4967/2022 · άρθρο 18',
        fact: 'Το άρθρο 18 αφορά τα δικαιώματα του λήπτη όταν το ψηφιακό περιεχόμενο ή η ψηφιακή υπηρεσία δεν ανταποκρίνεται στη σύμβαση.',
        why: 'Συνδρομές, εφαρμογές και ψηφιακές αγορές είναι καθημερινές. Αξίζει να ξέρεις από πού ξεκινά η ανάγνωση για προβληματικές παροχές.',
        context: 'Διάβασε μαζί το πεδίο εφαρμογής του άρθρου 5 και τις προϋποθέσεις των επόμενων άρθρων. Η συλλογή περιέχει την αρχική δημοσίευση του 2022.', source: 'https://0076.syzefxis.gov.gr/wp-content/uploads/2022/11/Nomos_4967_2022.pdf' },
      { doc: 'law:4624:2019', article: '27', title: 'Προσωπικά δεδομένα στην εργασία', reference: 'Ν. 4624/2019 · άρθρο 27',
        fact: 'Το άρθρο εξετάζει την επεξεργασία δεδομένων προσωπικού χαρακτήρα στο πλαίσιο σχέσεων απασχόλησης.',
        why: 'Το διάλεξα επειδή τα δεδομένα εργαζομένων αφορούν μεγάλο μέρος της καθημερινότητας και συχνά μια άνιση σχέση ισχύος.',
        context: 'Ο νόμος συμπληρώνει τον ΓΚΠΔ. Η αρχική δημοσίευση του 2019 διαβάζεται μαζί με το ευρωπαϊκό πλαίσιο και τις μεταγενέστερες εξελίξεις.', source: 'https://www.dpa.gr/sites/default/files/2020-02/nomos%204624_2019.pdf' },
    ] },
];

function renderEditorPicks(category = '') {
  state.picksCategory = category;
  const groups = editorPicks.filter(group => !category || group.id === category);
  const filters = [['', 'Όλες οι επιλογές'], ...editorPicks.map(group => [group.id, group.label])];
  // Keep filter buttons mounted so keyboard focus survives a selection.
  if (!$('#picks-filters').children.length) $('#picks-filters').innerHTML = filters.map(([id, label]) => '<button type="button" data-picks-category="' + id + '" aria-pressed="false">' + esc(label) + '</button>').join('');
  document.querySelectorAll('[data-picks-category]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.picksCategory === category)));
  $('#picks-count').textContent = number(groups.reduce((total, group) => total + group.items.length, 0)) + ' επιλογές · ' + (category ? groups[0].label : '3 διαδρομές για διάβασμα');
  $('#picks-collections').innerHTML = groups.map(group => '<section class="picks-collection picks-' + group.id + '" aria-labelledby="picks-' + group.id + '"><div class="picks-section-heading"><p class="eyebrow">' + esc(group.label) + '</p><h2 id="picks-' + group.id + '">' + esc(group.title) + '</h2><p>' + esc(group.intro) + '</p></div><div class="picks-grid">' + group.items.map(item => {
    const params = new URLSearchParams({ law: item.doc, [item.provision ? 'provision' : 'article']: item.provision || item.article });
    return '<article class="pick-card"><p class="pick-reference">' + esc(item.reference) + '</p><h3>' + esc(item.title) + '</h3><p>' + esc(item.fact) + '</p><div class="pick-reason"><span>Γιατί το επέλεξα</span><p>' + esc(item.why) + '</p></div><p class="pick-context">' + esc(item.context) + '</p><div class="pick-actions"><a class="button secondary" href="#' + esc(params.toString()) + '" data-inline-doc="' + esc(item.doc) + '" data-inline-article="' + esc(item.provision || item.article) + '">Διάβασε τη διάταξη →</a>' + sourceLink(item.source, 'Πρωτότυπο ΦΕΚ ↗') + '</div></article>';
  }).join('') + '</div></section>').join('');
}

async function api(path, options = {}) {
  const response = await fetch('/api/laws/' + path, { ...options, headers: { 'content-type': 'application/json', 'x-local-request': '1', ...options.headers } });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || 'Δεν ήταν δυνατή η ολοκλήρωση.'), { status: response.status });
  return body;
}

function notice(message, error = false) {
  $('#notice').textContent = message;
  $('#notice').className = 'notice' + (error ? ' error' : '');
  $('#notice').hidden = !message;
}

// Rough historical estimate for ordinary laws (Ν.), including repealed laws.
// Taxheaven's 2022 census: 20,449 laws; reported modern rate: ~103/year.
// Four additional years give ~20,861, rounded to ~21,000 for 2026.
// Excludes legislative/compulsory laws, decrees, circulars and decisions.
const nationalLawEstimate = { total: 21000, year: 2026 };

function renderCollectionProgress(stats) {
  const imported = stats.laws;
  const total = nationalLawEstimate.total;
  const available = Number.isInteger(imported) && imported >= 0 && imported <= total;
  const bar = $('#collection-progress-bar');
  bar.hidden = !available;
  if (!available) {
    bar.removeAttribute('value');
    $('#collection-progress-percent').textContent = '—';
    $('#collection-progress-detail').textContent = 'Η εκτίμηση κάλυψης θα εμφανιστεί μόλις είναι διαθέσιμος ο αριθμός εισαγμένων νόμων.';
    return;
  }
  const percent = imported / total * 100;
  const label = imported > 0 && percent < 0.01 ? '<0,01%' : (Math.min(imported < total ? 99.99 : 100, percent).toLocaleString('el-GR', { maximumFractionDigits: 2 }) + '%');
  bar.value = percent;
  $('#collection-progress-percent').textContent = '≈ ' + label;
  $('#collection-progress-detail').textContent = number(imported) + ' εισαγμένοι νόμοι από περίπου ' + number(total) + ' συνολικά. Απομένουν περίπου ' + number(total - imported) + ' νόμοι για εισαγωγή.';
}

async function refreshStatus() {
  const result = await api('status');
  const gazetteSignature = JSON.stringify([result.stats.lastUpdated, result.stats.downloadedPdfs, result.stats.documents]);
  if (state.gazetteSignature !== gazetteSignature || !$('#gazettes-view').hidden) {
    await loadGazettes();
    state.gazetteSignature = gazetteSignature;
  }
  renderCollectionProgress(result.stats);
  const labels = [['documents', 'Έγγραφα', 'στη βιβλιοθήκη'], ['units', 'Ενότητες κειμένου', 'άρθρα, παράγραφοι & λοιπό κείμενο'], ['references', 'Παραπομπές', 'μεταξύ διατάξεων'], ['attachments', 'Σύνδεσμοι πηγών', 'ΦΕΚ & συνοδευτικά']];
  $('#stats').innerHTML = labels.map(([key, title, caption]) => '<div class="stat" data-stat="' + key + '"><span class="stat-label">' + title + '</span><span class="stat-value">' + number(result.stats[key]) + '</span><span class="stat-caption">' + caption + '</span></div>').join('');
  const homeLabels = [
    ['laws', 'Νόμοι', 'αριθμημένοι νόμοι (Ν.) στη βάση'],
    ['documents', 'Σύνολο τεκμηρίων', 'νόμοι, συντάγματα, διατάγματα κ.ά.'],
    ['articles', 'Άρθρα', 'στο αποθηκευμένο κείμενο'],
    ['paragraphs', 'Παράγραφοι', 'αριθμημένες στο αποθηκευμένο κείμενο'],
    ['textDocuments', 'Τεκμήρια με κείμενο', 'πλήρες κείμενο ή απόσπασμα'],
    ['references', 'Παραπομπές', 'εντοπισμένες αναφορές σε διατάξεις'],
    ['attachments', 'Σύνδεσμοι πηγών', 'πρωτότυπα & συνοδευτικά έγγραφα'],
    ['downloadedPdfs', 'Αποθηκευμένα PDF', 'διαθέσιμα στον υπολογιστή σου'],
  ];
  const homeStatsHtml = homeLabels.map(([key, title, caption]) => {
    const navigable = key === 'laws' || key === 'documents';
    const type = key === 'laws' ? 'law' : '';
    const start = navigable ? '<a class="stat stat-link" href="#' + (type ? 'laws' : 'library') + '" data-library-type="' + type + '" data-stat="' + key + '">' : '<div class="stat" data-stat="' + key + '">';
    return start + '<span class="stat-label">' + title + '</span><span class="stat-value">' + (Number.isFinite(result.stats[key]) ? number(result.stats[key]) : '—') + '</span><span class="stat-caption">' + caption + '</span>' + (navigable ? '<span class="stat-action">Προβολή λίστας →</span></a>' : '</div>');
  }).join('');
  // Preserve keyboard focus when unchanged counts refresh in the background.
  if (state.homeStatsHtml !== homeStatsHtml) {
    $('#home-stats-grid').innerHTML = homeStatsHtml;
    state.homeStatsHtml = homeStatsHtml;
  }
  $('#home-stats-coverage').textContent = 'Κάλυψη τεκμηρίων: ' + number(result.stats.textDocuments) + ' με κείμενο ή απόσπασμα · ' + number(result.stats.metadataDocuments) + ' μόνο με στοιχεία · ' + number(result.stats.archivalDocuments) + ' με σάρωση χωρίς μεταγραφή. Τα άρθρα και οι παράγραφοι μετρούν μόνο το αποθηκευμένο κείμενο.';
  $('#home-stats-updated').textContent = result.stats.lastUpdated ? 'Τελευταία αποθήκευση: ' + date(result.stats.lastUpdated) : 'Δεν έχουν προστεθεί τεκμήρια ακόμη.';
  $('#nav-count').textContent = number(result.stats.documents);
  $('#database-path').textContent = result.storageEngine + ' · ' + result.databasePath + ' · ' + result.dataDirectory;
  $('#worker-status').textContent = result.worker.enabled ? (result.worker.connected ? 'Συνδεδεμένο · η βιβλιοθήκη αποθηκεύεται τοπικά' : 'Ενεργοποιημένη, χωρίς σύνδεση · η τοπική εφαρμογή λειτουργεί') : 'Απενεργοποιημένη · ανεξάρτητη τοπική λειτουργία';
  $('#open-import').disabled = result.importing;
  $('#open-import').textContent = result.importing ? 'Εισαγωγή σε εξέλιξη…' : '＋ Εισαγωγή από τη Βουλή';
  state.importing = result.importing;
  document.querySelectorAll('[data-open-import]').forEach(button => { button.disabled = result.importing; });
}

async function loadList() {
  renderTopicMatches();
  const version = ++state.loading;
  const result = await api('documents?q=' + encodeURIComponent(state.q) + '&page=' + state.page + '&category=' + encodeURIComponent(state.category) + '&sort=' + encodeURIComponent(state.sort) + '&type=' + encodeURIComponent(state.type));
  if (version !== state.loading) return;
  state.items = result.items;
  $('#search-context').textContent = state.q || state.category ? 'Αποτελέσματα' + (state.category ? ' στην ενότητα «' + state.category + '»' : '') + (state.q ? ' για «' + state.q + '»' : '') + '. Η αναζήτηση περιλαμβάνει το κείμενο και τις σημειώσεις.' : 'Αναζήτηση στους τίτλους, στο αποθηκευμένο κείμενο και στις σημειώσεις. Δοκίμασε «κλοπή» ή «4727/2020».';
  $('#result-count').textContent = number(result.total) + (state.type === 'law' ? (result.total === 1 ? ' νόμος' : ' νόμοι') : (result.total === 1 ? ' έγγραφο' : ' έγγραφα'));
  $('#library-list-title').textContent = state.type === 'law' ? 'Οι νόμοι σου' : 'Τα έγγραφά σου';
  $('#document-list').innerHTML = result.items.length ? result.items.map(doc => {
    const guide = state.guides[doc.canonical_id];
    return '<button class="doc-card' + (state.selected?.document.canonical_id === doc.canonical_id ? ' selected' : '') + '" data-doc="' + esc(doc.canonical_id) + '"><span class="citation">' + esc(citation(doc)) + (guide ? ' · ' + esc(guide.category) : '') + '</span><h3>' + esc(guide?.short_title || doc.title) + '</h3><span class="document-kind ' + (doc.text_kind === 'parliament_metadata' ? 'metadata-kind' : '') + '">' + (doc.text_kind === 'archival_scan' ? 'Πρωτότυπο PDF · χωρίς μεταγραφή' : doc.text_coverage === 'excerpt' ? 'Απόσπασμα · πλήρες PDF διαθέσιμο' : doc.text_kind === 'parliament_metadata' ? 'Στοιχεία νόμου · χωρίς πλήρες κείμενο' : 'Κείμενο πηγής διαθέσιμο') + '</span><span class="meta">' + esc(doc.historical ? doc.publication_label : doc.source === 'national_printing_office' ? 'ΦΕΚ · δημοσίευση ' + doc.publication_label : doc.ministry || 'Νομοθετικό έγγραφο') + '</span></button>';
  }).join('') : '<div class="empty-list"><h3>' + (state.q || state.category ? 'Δεν βρέθηκαν έγγραφα.' : 'Η βιβλιοθήκη σου ξεκινά εδώ.') + '</h3><p>' + (state.q || state.category ? 'Δοκίμασε άλλη λέξη ή εμφάνισε όλα τα θέματα.' : 'Εισήγαγε τα πρώτα έγγραφα από τη Βουλή ή πρόσθεσε κείμενο από μια πηγή.') + '</p>' + (state.q || state.category ? '<button class="button secondary" data-reset-search>Όλα τα έγγραφα</button>' : '<button class="button secondary" data-open-import>Πρώτη εισαγωγή ↧</button>') + '</div>';
  $('#pagination').innerHTML = result.total > 30 ? '<button class="button secondary small" data-page="' + (state.page - 1) + '" ' + (state.page <= 1 ? 'disabled' : '') + '>←</button><span class="muted">' + state.page + ' / ' + Math.ceil(result.total / 30) + '</span><button class="button secondary small" data-page="' + (state.page + 1) + '" ' + (state.page * 30 >= result.total ? 'disabled' : '') + '>→</button>' : '';
}

function switchView(view, updateUrl = true) {
  for (const key of ['sources', 'library', 'gazettes', 'picks', 'justice', 'jobs', 'settings']) {
    $('#' + key + '-view').hidden = key !== view;
    $('[data-view="' + key + '"]').classList.toggle('active', key === view);
  }
  $('#stats').hidden = view !== 'library';
  $('#open-import').hidden = view === 'justice';
  $('#page-title').textContent = { sources: 'Η νομοθεσία, βήμα βήμα.', library: 'Βιβλιοθήκη νομοθεσίας', justice: 'Η δικαιοσύνη, με απλά λόγια.', jobs: 'Ιστορικό εισαγωγών', settings: 'Τα δεδομένα στον υπολογιστή σου' }[view];
  $('#page-description').textContent = { sources: 'Μάθε πώς διαβάζεται ένας νόμος και βρες το κείμενο που σε ενδιαφέρει.', library: 'Νόμοι ανά θέμα, σύντομες εξηγήσεις και πρόσβαση στα πρωτότυπα κείμενα.', justice: 'Πώς λειτουργεί το σύστημα, τι μπορείς να κάνεις και πού θα βρεις βοήθεια.', jobs: 'Δες ποια έγγραφα προστέθηκαν και ποιες εισαγωγές χρειάζονται έλεγχο.', settings: 'Δες πού αποθηκεύονται τα δεδομένα σου και κράτησε αντίγραφο.' }[view];
  if (view === 'gazettes') {
    $('#page-title').textContent = 'Ευρετήριο ΦΕΚ & πρόοδος';
    $('#page-description').textContent = 'Τι έχουμε, τι λείπει και πώς διαβάζεται η αρίθμηση — ανά έτος και τεύχος.';
    renderGazettes();
  }
  if (view === 'picks') {
    $('#page-title').textContent = 'Επιλογές για διάβασμα';
    $('#page-description').textContent = 'Παράλογα, κατάχρηση εξουσίας και χρήσιμοι νόμοι — με το σκεπτικό κάθε επιλογής.';
    renderEditorPicks(state.picksCategory || '');
  }
  if (view === 'library' && state.type === 'law') {
    $('#page-title').textContent = 'Νόμοι';
    $('#page-description').textContent = 'Όλοι οι εισαγμένοι νόμοι (Ν.) με αναζήτηση, θέματα και πρόσβαση στις πηγές.';
  }
  if (updateUrl) history.replaceState(null, '', '#' + (view === 'library' && state.type === 'law' ? 'laws' : view));
}

async function loadGazettes() {
  const result = await api('gazettes');
  if (JSON.stringify(state.gazettes) === JSON.stringify(result)) return;
  state.gazettes = result;
  const years = [...new Set(result.years.map(group => group.year))];
  const selected = $('#gazette-year').value;
  $('#gazette-year').innerHTML = years.map(year => '<option>' + year + '</option>').join('');
  $('#gazette-year').value = years.includes(Number(selected)) ? selected : String(years[0] || '');
  const category = $('#gazette-category').value;
  $('#gazette-category').innerHTML = '<option value="">Όλες οι κατηγορίες</option>' + result.categories.map(value => '<option>' + esc(value) + '</option>').join('');
  $('#gazette-category').value = result.categories.includes(category) ? category : '';
  renderGazetteSeries();
  $('#gazette-stats').innerHTML = [['saved', 'ΦΕΚ με τοπικό PDF'], ['catalogued', 'ΦΕΚ στους ελεγμένους καταλόγους'], ['withText', 'ΦΕΚ με κείμενο πράξεων'], ['complete', 'Πλήρη έτη / τεύχη PDF']].map(([key, label]) => '<div class="stat"><span class="stat-label">' + label + '</span><strong class="stat-value">' + number(result.summary[key]) + '</strong></div>').join('');
  $('#gazette-years').innerHTML = result.years.map(group => '<button type="button" class="gazette-year-card" data-gazette-year="' + group.year + '" data-gazette-series="' + esc(group.series) + '"><strong>' + group.year + ' <small>· ' + esc(group.series) + '</small></strong><span>' + number(group.saved) + ' / ' + (group.total === null ? 'άγνωστο σύνολο' : number(group.total)) + ' PDF</span><small>' + (group.total === null ? 'Σύνολο μη επαληθευμένο' : group.complete ? '✓ Πλήρες αρχείο PDF' : number(group.missing.length) + ' φύλλα απομένουν') + '</small></button>').join('');
  const first = result.years.find(group => group.total !== null && !group.complete) || result.years[0];
  $('#gazette-home-progress').textContent = first ? first.year + ' · τεύχος ' + first.series + ': ' + number(first.saved) + ' / ' + (first.total === null ? 'άγνωστο σύνολο' : number(first.total)) + ' PDF' + (first.total === null ? '. Δες τις καταχωρίσεις ανά έτος.' : ' · ' + number(first.missing.length) + ' φύλλα απομένουν. Δες ποιο είναι το επόμενο.') : 'Δεν υπάρχουν καταχωρισμένα ΦΕΚ ακόμη.';
  renderGazettes();
}

function renderGazetteSeries() {
  if (!state.gazettes) return;
  const selected = $('#gazette-series').value;
  const series = state.gazettes.years.filter(group => String(group.year) === $('#gazette-year').value).map(group => group.series);
  $('#gazette-series').innerHTML = series.map(value => '<option>' + esc(value) + '</option>').join('');
  $('#gazette-series').value = series.includes(selected) ? selected : series[0] || '';
}

function renderGazettes(resetPage = true) {
  if (resetPage) state.gazettePage = 1;
  if (!state.gazettes) return;
  const data = state.gazettes;
  const year = Number($('#gazette-year').value), series = $('#gazette-series').value;
  const category = $('#gazette-category').value, status = $('#gazette-status').value;
  const query = foldQuery($('#gazette-search').value.trim());
  const group = data.years.find(group => group.year === year && group.series === series);
  document.querySelectorAll('[data-gazette-year]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.gazetteYear) === year && button.dataset.gazetteSeries === series)));
  if (!group) { $('#gazette-year-progress').textContent = 'Δεν υπάρχουν διαθέσιμα στοιχεία.'; $('#gazette-issues').innerHTML = ''; return; }
  const percent = group.percent === null ? '' : group.percent.toLocaleString('el-GR', { maximumFractionDigits: 1 }) + '%';
  const next = group.missing[0];
  const nextRow = data.issues.find(row => row.year === year && row.series === series && row.issue === next);
  const progress = group.total === null ? '<h3>' + year + ' · ' + esc(series) + ': ' + number(group.saved) + ' αποθηκευμένα PDF</h3><p>Το συνολικό πλήθος φύλλων δεν έχει επαληθευτεί. Δεν γνωρίζουμε ακόμη πόσα λείπουν ή αν ολοκληρώθηκε το έτος.</p>' : '<h3>' + year + ' · ' + esc(series) + ': ' + number(group.saved) + ' από ' + number(group.total) + ' PDF <span>' + percent + '</span></h3><progress max="100" value="' + group.percent + '" aria-label="Πρόοδος αποθήκευσης PDF για ' + year + ' ' + esc(series) + '"></progress><p>' + (group.complete ? '✓ Όλα τα φύλλα του καταλόγου έχουν αποθηκευτεί.' : number(group.missing.length) + ' φύλλα απομένουν.' + (nextRow ? ' Επόμενο: <strong>ΦΕΚ ' + esc(series) + ' ' + next + '/' + year + '</strong> · ' + sourceLink(nextRow.sourceUrl, 'Άνοιγμα επίσημου PDF ↗') : '')) + '</p>' + (group.missing.length ? '<details><summary>Ποια φύλλα λείπουν;</summary><p>' + group.missing.join(', ') + '</p></details>' : '') + '<p class="gazette-sources">' + sourceLink(group.sourceUrl, 'Επαληθευμένος κατάλογος Εθνικού Τυπογραφείου ↗') + ' · Έλεγχος ' + esc(group.verifiedAt) + '</p>';
  $('#gazette-year-progress').innerHTML = progress + (group.openYear ? '<p><strong>Τρέχον έτος: ο κατάλογος αφορά τον έλεγχο της ' + esc(group.verifiedAt) + ' και μπορεί να αυξηθεί. Το έτος δεν χαρακτηρίζεται ολοκληρωμένο.</strong></p>' : '') + (group.unexpected.length ? '<p>Υπάρχουν αποθηκευμένα φύλλα εκτός καταλόγου. Χρειάζεται επανέλεγχος του συνόλου.</p>' : '') + '<p class="gazette-scope">Πρόοδος ολόκληρου του έτους / τεύχους, ανεξάρτητα από τα φίλτρα. Η αποθήκευση PDF και η μεταγραφή κειμένου είναι διαφορετικά βήματα.</p>';
  const rows = data.issues.filter(row => row.year === year && row.series === series && (!category || row.documents.some(doc => doc.category === category)) && (!status || (status === 'saved' ? row.saved : status === 'missing' ? !row.saved : row.documents.some(doc => doc.hasText))) && (!query || (/^\d+$/.test(query) ? row.issue === Number(query) : foldQuery(row.documents.map(doc => doc.title).join(' ')).includes(query))));
  $('#gazette-result-count').textContent = number(rows.length) + ' φύλλα στην προβολή' + (category ? ' · Κατηγορία: ' + category + '. Τα φύλλα χωρίς καταχωρισμένες πράξεις δεν ταξινομούνται ακόμη.' : ' · Κάθε φύλλο μετρά μία φορά.');
  const pageSize = 24;
  state.gazettePage = Math.max(1, Math.min(state.gazettePage || 1, Math.ceil(rows.length / pageSize) || 1));
  const offset = (state.gazettePage - 1) * pageSize;
  $('#gazette-pagination').innerHTML = rows.length > pageSize ? '<button class="button secondary" type="button" data-gazette-page="' + (state.gazettePage - 1) + '" ' + (state.gazettePage === 1 ? 'disabled' : '') + '>← Προηγούμενα</button><span>' + (offset + 1) + '–' + Math.min(offset + pageSize, rows.length) + ' / ' + rows.length + '</span><button class="button secondary" type="button" data-gazette-page="' + (state.gazettePage + 1) + '" ' + (offset + pageSize >= rows.length ? 'disabled' : '') + '>Επόμενα →</button>' : '';
  $('#gazette-issues').innerHTML = rows.length ? rows.slice(offset, offset + pageSize).map(row => '<article class="gazette-issue ' + (row.saved ? 'is-saved' : 'is-missing') + '"><div class="gazette-issue-heading"><h3>ΦΕΚ ' + esc(row.series) + ' ' + row.issue + '/' + row.year + '</h3><span class="gazette-badge">' + (row.saved ? '● PDF αποθηκευμένο' : '○ Χωρίς τοπικό PDF') + '</span></div><p>' + number(row.documents.length) + ' πράξεις στη βιβλιοθήκη · ' + number(row.documents.filter(doc => doc.hasText).length) + ' με κείμενο</p><div class="gazette-issue-actions">' + (row.documentId ? '<button class="text-link" type="button" data-doc="' + esc(row.documentId) + '">Άνοιγμα φύλλου →</button>' : '') + (row.sourceUrl ? sourceLink(row.sourceUrl, 'Επίσημο PDF ↗') : '') + '</div>' + (row.documents.length ? '<details><summary>Περιεχόμενα στη βιβλιοθήκη (' + row.documents.length + ')</summary><ul>' + row.documents.map(doc => '<li><button class="text-link" type="button" data-doc="' + esc(doc.id) + '">' + esc(doc.title) + '</button><small>' + esc(doc.category) + ' · ' + (doc.hasText ? doc.excerpt ? 'Απόσπασμα' : 'Κείμενο πράξης' : 'Χωρίς μεταγραφή') + '</small></li>').join('') + '</ul><p class="gazette-scope">Οι καταχωρισμένες πράξεις δεν αποτελούν πλήρη απογραφή περιεχομένων του φύλλου.</p></details>' : '<p class="gazette-scope">Δεν έχουν καταχωριστεί χωριστές πράξεις.</p>') + '</article>').join('') : '<p class="empty-list">Δεν βρέθηκαν φύλλα με αυτά τα φίλτρα. Διάλεξε «Όλα τα φύλλα» ή αφαίρεσε την κατηγορία / αναζήτηση.</p>';
}

function allowNavigation() {
  if (!state.dirty) return true;
  if (!confirm('Υπάρχουν μη αποθηκευμένες σημειώσεις. Θέλεις να φύγεις χωρίς αποθήκευση;')) return false;
  state.dirty = false;
  return true;
}

function openReaderRoute(hash, unit, push = false) {
  const params = new URLSearchParams(hash.slice(1));
  return openDocument(params.get('law'), false, {
    article: params.get('article'), paragraph: params.get('paragraph'), provision: params.get('provision'),
    quote: params.get('quote'), quoteParagraph: params.get('quoteParagraph'), unit: unit || params.get('unit'),
    hash, push,
  });
}

function renderUnavailableReference(id, target) {
  const [type, key, year, issueYear] = id.split(':');
  const types = { law: 'Ν.', presidential_decree: 'Π.Δ.', royal_decree: 'Β.Δ.', legislative_content_act: 'ΠΝΠ', joint_ministerial_decision: 'ΚΥΑ',
    eu_directive: 'Οδηγία (ΕΕ)', eu_regulation: 'Κανονισμός', eu_decision: 'Απόφαση (ΕΕ)' };
  const yearFirst = type.startsWith('eu_') && (type !== 'eu_regulation' || Number(year) >= 2015);
  const label = type === 'fek' ? 'ΦΕΚ ' + key + ' ' + year + '/' + issueYear
    : types[type] ? types[type] + ' ' + (yearFirst ? year + '/' + key : key + '/' + year)
      : id;
  const detail = [target.article && 'Άρθρο ' + target.article,
    (target.provision || target.paragraph) && 'παρ. ' + (target.provision || target.paragraph)].filter(Boolean).join(' · ');
  state.selected = null;
  switchView('library', false);
  const reader = $('#reader');
  reader.innerHTML = '<div class="doc-heading"><p class="eyebrow">Παραπομπή στη βιβλιοθήκη</p><h2 tabindex="-1">' +
    esc(label) + '</h2>' + (detail ? '<p>' + esc(detail) + '</p>' : '') +
    '</div><div class="doc-body"><p>Το κείμενο αυτής της παραπομπής δεν έχει εισαχθεί ακόμη στη βιβλιοθήκη.</p>' +
    (target.push ? '<button type="button" class="button secondary" data-reference-back>← Επιστροφή στην προηγούμενη προβολή</button>' : '') + '</div>';
  reader.querySelector('h2').focus({ preventScroll: true });
  reader.scrollIntoView({ block: 'start' });
}

async function openDocument(id, replace = false, target = {}) {
  if (!id) return;
  if (!replace && !allowNavigation()) return;
  const version = ++state.loadingDoc;
  let result;
  try { result = await api('document?id=' + encodeURIComponent(id)); }
  catch (error) {
    if (version !== state.loadingDoc) return;
    if (error.status !== 404 || !target.hash) throw error;
    if (target.push) history.pushState(null, '', target.hash);
    notice('');
    renderUnavailableReference(id, target);
    return;
  }
  if (version !== state.loadingDoc) return;
  if (!replace) notice('');
  state.selected = result;
  state.dirty = false;
  const requested = target.article || target.provision || target.unit || target.paragraph;
  if (!replace) {
    state.tab = 'overview';
    state.readerMessage = '';
    state.readerQuery = target.query || '';
    state.focusArticle = primaryNumber(result.units.find(unit => !unit.parent_id) || {});
    state.focusParagraph = null;
    state.focusQuote = null;
    let primaryTarget = target.provision || target.article;
    let childTarget = target.paragraph;
    if (target.unit) {
      const unit = result.units.find(unit => unit.id === target.unit);
      const parent = unit?.parent_id ? result.units.find(parent => parent.id === unit.parent_id) : unit;
      if (parent) {
        primaryTarget = primaryNumber(parent);
        childTarget = unit.parent_id ? unit.paragraph_number : null;
      } else if (!primaryTarget) state.readerMessage = 'Η συγκεκριμένη διάταξη δεν έχει εντοπιστεί στο αποθηκευμένο κείμενο.';
    } else if (!primaryTarget && childTarget && result.document.primary_unit_type === 'paragraph') {
      primaryTarget = childTarget;
      childTarget = null;
    }
    if (primaryTarget) {
      const provision = result.units.find(unit => !unit.parent_id && String(primaryNumber(unit)).toLowerCase() === String(primaryTarget).toLowerCase());
      if (provision) {
        state.focusArticle = primaryNumber(provision);
        state.tab = 'text';
        if (childTarget && result.units.some(unit => unit.parent_id === provision.id && unit.paragraph_number === childTarget)) state.focusParagraph = childTarget;
        else if (childTarget) state.readerMessage = 'Η παράγραφος ' + childTarget + ' δεν έχει εντοπιστεί στο αποθηκευμένο κείμενο. Εμφανίζεται το άρθρο.';
      } else {
        const label = target.provision ? 'Παράγραφος ' : 'Άρθρο ';
        const requestedLabel = primaryTarget === 'annex' ? 'Παράρτημα' : label + String(primaryTarget).replace(/^code-/, '');
        state.readerMessage = requestedLabel + ' · Η διάταξη δεν έχει εντοπιστεί στο αποθηκευμένο κείμενο.';
      }
    }
  }
  if (target.quote && target.quoteParagraph) {
    const quoteUnit = result.units.find(unit => !unit.parent_id && primaryNumber(unit) === state.focusArticle);
    const quotedId = 'quoted-' + quoteUnit?.id + '-' + target.quote + '-' + target.quoteParagraph;
    state.focusQuote = quotedId;
  }
  if (target.push) history.pushState(null, '', target.hash);
  else if (!target.hash) updateReaderUrl();
  switchView('library', false);
  renderReader();
  if (requested) { $('#reader').scrollIntoView({ block: 'start' }); scrollToParagraph(); }
  document.querySelectorAll('[data-doc]').forEach(button => button.classList.toggle('selected', button.dataset.doc === id));
}

state.loadingDoc = 0;

function sourcePublicationNote(doc) {
  if (doc.historical) return '<div class="source-note publication-note"><strong>Ιστορικό τεκμήριο · ' + esc(doc.publication_label) + '</strong><br>' + esc(doc.transcription_note) + (doc.source_edition_note ? '<br>' + esc(doc.source_edition_note) : '') + ' ' + sourceLink(doc.source_url, 'Πρωτότυπο PDF ↗') + '</div>';
  if (doc.text_provenance === 'official_gazette_transcription' || doc.text_provenance === 'eu_official_journal') {
    const origin = doc.text_provenance === 'eu_official_journal' ? 'Επίσημη Εφημερίδα της Ευρωπαϊκής Ένωσης' : 'Αρχική δημοσίευση · ' + doc.publication_label;
    return '<div class="source-note publication-note"><strong>' + esc(origin) + '</strong><br>' +
      esc(doc.coverage_note) + ' ' + sourceLink(doc.source_url, 'Πρωτότυπο PDF ↗') + '</div>';
  }
  if (doc.text_provenance === 'official_gazette_pdf_extraction') {
    const pdfPages = doc.pdf_only_pages || state.guides[doc.canonical_id]?.pdf_only_pages || [];
    const pageLabel = LawCitationText.formatPageRanges(pdfPages);
    const supplementalPages = doc.text_coverage === 'articles_with_pdf_only_supplements';
    const pageNote = supplementalPages
      ? 'Συμπληρωματικό υλικό στις σελίδες ' + esc(pageLabel) + ' του πρωτοτύπου. '
      : (doc.text_coverage === 'ratifying_articles_with_pdf_only_agreement' ? 'Τα κυρούμενα κείμενα στις σελίδες ' : doc.incorporated_code_article_count ? 'Τα υπόλοιπα κείμενα στις σελίδες ' : 'Τα παραρτήματα στις σελίδες ') + esc(pageLabel) + ' διατίθενται μόνο στο πρωτότυπο PDF. ';
    return '<div class="source-note publication-note"><strong>Αρχική δημοσίευση · ' + esc(doc.publication_label) + '</strong><br>Αυτόματη εξαγωγή από το πρωτότυπο ΦΕΚ. Οι μεταγενέστερες τροποποιήσεις δεν έχουν ενσωματωθεί πλήρως· δεν πρόκειται για ενημερωμένη κωδικοποίηση. ' + (doc.source_edition_note ? esc(doc.source_edition_note) + ' ' : '') + (doc.coverage_note ? esc(doc.coverage_note) + ' ' : '') + (pageLabel ? pageNote : '') + sourceLink(doc.source_url, 'Πρωτότυπο ΦΕΚ ↗') + '</div>';
  }
  return doc.text_kind === 'parliament_metadata' ? '<div class="source-note">Έχουν εισαχθεί στοιχεία και περιγραφή της Βουλής. Δεν έχει προστεθεί το πλήρες νομοθετικό κείμενο.</div>' : '<div class="source-note">Κείμενο πηγής που πρόσθεσες εσύ. Δεν αποτελεί αυτόματα ενημερωμένη έκδοση του νόμου. ' + sourceLink(doc.source_url, 'Άνοιγμα πηγής ↗') + '</div>';
}

function renderStarterTopics(doc) {
  const topics = state.guides[doc.canonical_id]?.topics || doc.starter_topics;
  if (!Array.isArray(topics)) return '';
  const available = new Map(state.selected.units.filter(unit => !unit.parent_id).map(unit => [primaryNumber(unit), unit]));
  const paragraphTopics = doc.primary_unit_type === 'paragraph';
  return '<section class="starter-section"><h3>' + (paragraphTopics ? 'Βρες την παράγραφο που σε αφορά' : 'Βρες το άρθρο που σε αφορά') + '</h3><p class="muted">Συντομεύσεις στο αποθηκευμένο κείμενο της αρχικής δημοσίευσης.</p><div class="starter-topics">' + topics.filter(topic => available.has(topic.article)).map(topic => '<button class="starter-topic" data-article="' + esc(topic.article) + '"><span>' + (available.get(topic.article).unit_type === 'body' ? esc(available.get(topic.article).label) : (doc.extraction_profile === 'recent_gazette_ordinal_v1' ? esc(available.get(topic.article).label) : (paragraphTopics ? 'Παράγραφος ' : 'Άρθρο ') + esc(topic.article))) + '</span><strong>' + esc(topic.title) + '</strong><small>' + esc(topic.description) + '</small></button>').join('') + '</div></section>';
}

function renderFilters() {
  const categories = ['', ...new Set(Object.values(state.guides).map(guide => guide.category))];
  $('#topic-filters').innerHTML = categories.map(category => '<button class="topic-filter' + (state.category === category ? ' active' : '') + '" data-category="' + esc(category) + '" aria-pressed="' + (state.category === category) + '">' + esc(category || 'Όλα τα θέματα') + '</button>').join('');
  $('#home-topic-filters').innerHTML = categories.filter(Boolean).map(category => '<button class="topic-filter" type="button" data-home-category="' + esc(category) + '">' + esc(category) + ' <span aria-hidden="true">↗</span></button>').join('');
  const summary = categorySummaries.get(state.category);
  $('#category-summary').hidden = !summary;
  $('#category-summary-title').textContent = state.category;
  $('#category-summary-text').textContent = summary || '';
}

function renderTopicCards() {
  $('#topic-guide-cards').innerHTML = topicGuides.map(guide => `
    <button type="button" class="topic-guide-card" data-topic-guide="${esc(guide.id)}" aria-expanded="false" aria-controls="topic-guide-detail">
      <strong>${esc(guide.title)}</strong>
      <span>${esc(guide.summary)}</span>
      <span class="topic-guide-action">Δες τον οδηγό <span aria-hidden="true">↓</span></span>
    </button>`).join('');
}

function showTopicGuide(id) {
  const guide = topicGuides.find(item => item.id === id);
  const panel = $('#topic-guide-detail');
  document.querySelectorAll('[data-topic-guide]').forEach(button => {
    const isOpen = guide?.id === button.dataset.topicGuide;
    button.setAttribute('aria-expanded', String(isOpen));
    button.querySelector('.topic-guide-action').innerHTML = isOpen ? 'Κλείσε τον οδηγό <span aria-hidden="true">↑</span>' : 'Δες τον οδηγό <span aria-hidden="true">↓</span>';
  });
  panel.hidden = !guide;
  if (!guide) return;
  const reviewDate = new Date(guide.reviewedOn).toLocaleDateString('el-GR', { timeZone: 'UTC' });
  panel.innerHTML = `
    <header class="topic-guide-heading">
      <h3 id="topic-guide-title" tabindex="-1">${esc(guide.title)}</h3>
      <button type="button" class="button secondary small" data-topic-close>Κλείσε τον οδηγό</button>
    </header>
    <div class="topic-guide-sections">${guide.sections.map(section => `
      <section>
        <h4>${esc(section.title)}</h4>
        <p>${esc(section.text)}</p>
        <ul>${section.sources.map(([label, url]) => `<li>${sourceLink(url, label + '\u00a0↗')}</li>`).join('')}</ul>
      </section>`).join('')}</div>
    <p class="topic-guide-review">Έλεγχος πηγών στις <time datetime="${esc(guide.reviewedOn)}">${esc(reviewDate)}</time>. Έλεγξε τις πιο πρόσφατες ρυθμίσεις για την περίπτωσή σου.</p>`;
  $('#topic-guide-title').focus({ preventScroll: true });
  panel.scrollIntoView({ block: 'start' });
}

function renderTopicMatches() {
  const words = foldQuery(state.q).replace(/κ\.ο\.κ\.?/g, 'κοκ').match(/[\p{L}\p{N}/]+/gu) || [];
  const hasSearch = words.some(word => word.length > 1);
  const matches = (state.category || hasSearch) ? topicGuides.filter(guide => {
    if (state.category && guide.category !== state.category) return false;
    const searchable = foldQuery(`${guide.title} ${guide.summary} ${guide.keywords}`);
    return words.every(word => searchable.includes(word));
  }) : [];
  $('#topic-guide-matches').hidden = !matches.length;
  $('#topic-guide-match-list').innerHTML = matches.map(guide => `
    <li><a href="#topic=${esc(guide.id)}" data-topic-link="${esc(guide.id)}">${esc(guide.title)} <span aria-hidden="true">→</span></a>
    <p>${esc(guide.summary)}</p></li>`).join('');
}

function renderHistory() {
  $('#history-timeline').innerHTML = Object.entries(state.guides).filter(([,guide]) => guide.timeline_featured).sort((a,b) => a[1].chronology_key.localeCompare(b[1].chronology_key)).map(([id,guide]) => '<button type="button" class="history-card" data-doc="' + esc(id) + '"><span>' + esc(guide.timeline_label) + '</span><strong>' + esc(guide.short_title) + '</strong><small>' + esc(guide.coverage_label) + ' <span aria-hidden="true">→</span></small></button>').join('');
}

async function findLaws(q = '', category = '', sort = 'recent', type = '') {
  if (!allowNavigation()) return;
  clearTimeout(searchTimer);
  state.type = type;
  $('#library-document-type').value = type;
  state.q = q.trim();
  state.category = category;
  state.sort = sort;
  $('#library-sort').value = state.sort;
  state.page = 1;
  $('#search').value = state.q;
  renderFilters();
  switchView('library');
  window.scrollTo({ top: 0, behavior: 'instant' });
  $('#search').focus();
  await loadList();
}

async function openHistory() {
  await findLaws('', 'Ιστορικές αφετηρίες', 'oldest');
  history.replaceState(null, '', '#history');
}

function renderGuide(doc) {
  const guide = state.guides[doc.canonical_id];
  if (!guide) return '<div class="reading-guide"><h3>Τι έχει αποθηκευτεί;</h3><p>' + (doc.text_kind === 'parliament_metadata' ? 'Ο τίτλος, τα στοιχεία της Βουλής και οι σύνδεσμοι πηγών. Για να μελετήσεις τις διατάξεις, άνοιξε ένα επίσημο PDF ή πρόσθεσε το κείμενο.' : 'Το κείμενο της πηγής που προστέθηκε στη βιβλιοθήκη. Άνοιξε την καρτέλα «Κείμενο» για τα άρθρα.') + '</p></div>';
  return '<section class="reading-guide"><p class="eyebrow">ΟΔΗΓΟΣ ΑΝΑΓΝΩΣΗΣ · ' + esc(guide.category) + '</p><h3>Με απλά λόγια</h3><p>' + esc(guide.summary) + '</p>' + (guide.context ? '<p class="guide-context">' + esc(guide.context) + '</p>' : '') + '<small>Βοήθημα προσανατολισμού στην αρχική δημοσίευση. Το ακριβές περιεχόμενο βρίσκεται στο κείμενο και στο πρωτότυπο τεκμήριο.</small></section>';
}

function updateReaderUrl() {
  const params = new URLSearchParams({ law: state.selected.document.canonical_id });
  if (state.tab === 'text' && state.focusArticle) {
    const primary = state.selected.units.find(unit => !unit.parent_id && primaryNumber(unit) === state.focusArticle);
    params.set(primary?.unit_type === 'paragraph' ? 'provision' : 'article', state.focusArticle);
    if (state.focusParagraph) params.set('paragraph', state.focusParagraph);
    if (state.focusQuote) { const match = state.focusQuote.match(/-([^-]+)-([^-]+)$/); if (match) { params.set('quote', match[1]); params.set('quoteParagraph', match[2]); } }
  }
  history.replaceState(null, '', '#' + params.toString());
}

function scrollToParagraph() {
  if (state.focusQuote) { const quoted = document.getElementById(state.focusQuote); if (quoted) { quoted.closest('.legal-paragraph')?.classList.add('quoted-target'); quoted.scrollIntoView({ block: 'center' }); } }
  if (!state.focusParagraph) return;
  const parent = state.selected.units.find(unit => !unit.parent_id && primaryNumber(unit) === state.focusArticle);
  const unit = state.selected.units.find(unit => unit.parent_id === parent?.id && unit.paragraph_number === state.focusParagraph);
  if (unit) document.getElementById('unit-' + unit.id)?.scrollIntoView({ block: 'center' });
}

function renderArticleText(data) {
  const provisions = data.units.filter(unit => !unit.parent_id);
  const selected = provisions.filter(unit => !state.focusArticle || primaryNumber(unit) === state.focusArticle);
  const currentIndex = provisions.findIndex(unit => primaryNumber(unit) === state.focusArticle);
  const current = provisions[currentIndex];
  const primaryParagraphs = data.document.primary_unit_type === 'paragraph';
  const articles = provisions.filter(unit => unit.unit_type === 'article');
  const mixedHistoricalArticles = data.document.historical && !primaryParagraphs && articles.length > 0 && articles.length < provisions.length;
  const numbered = primaryParagraphs ? provisions.filter(unit => unit.unit_type === 'paragraph') : data.document.incorporated_code_article_count || mixedHistoricalArticles ? articles : provisions;
  const allProvisionsLabel = primaryParagraphs ? 'Όλες οι παράγραφοι' : mixedHistoricalArticles ? 'Όλο το κείμενο' : 'Όλα τα άρθρα';
  const positionLabel = current?.scope_key ? 'Κώδικας · Άρθρο ' + current.article_number + ' · 1–' + data.document.incorporated_code_article_count + ' διαθέσιμα' : current ? (numbered.includes(current) ? (numbered.indexOf(current) + 1) + ' από ' + numbered.length : current.label) : allProvisionsLabel;
  const children = current ? data.units.filter(unit => unit.parent_id === current.id && Number.isInteger(unit.start_offset)) : [];
  const paragraphChooser = children.length ? '<label class="paragraph-jump">Παράγραφος<select id="paragraph-jump"><option value="">Ολόκληρο το άρθρο</option>' + children.map(unit => '<option value="' + esc(unit.paragraph_number) + '" ' + (state.focusParagraph === unit.paragraph_number ? 'selected' : '') + '>' + esc(unit.label) + '</option>').join('') + '</select></label>' : '';
  const chooser = provisions.length > 1 ? '<div class="article-controls"><label class="article-jump">' + (primaryParagraphs ? 'Διάλεξε παράγραφο' : mixedHistoricalArticles ? 'Διάλεξε ενότητα' : 'Διάλεξε άρθρο') + '<select id="article-jump"><option value="">' + allProvisionsLabel + ' (' + numbered.length + (mixedHistoricalArticles ? ' άρθρα' : '') + ')</option>' + provisions.map((unit, index) => (data.document.incorporated_code_article_count && (!index || provisions[index - 1].scope_key !== unit.scope_key) ? (index ? '</optgroup>' : '') + '<optgroup label="' + esc(unit.scope_title || 'Κυρωτικός νόμος') + '">' : '') + '<option value="' + esc(primaryNumber(unit) || '') + '" ' + (state.focusArticle === primaryNumber(unit) ? 'selected' : '') + '>' + esc(unit.label) + (unit.title ? ' — ' + esc(unit.title) : '') + '</option>').join('') + (data.document.incorporated_code_article_count ? '</optgroup>' : '') + '</select></label>' + paragraphChooser + '<div class="article-pagination"><button class="button secondary small" data-article="' + esc(primaryNumber(provisions[currentIndex - 1] || {}) || '') + '" ' + (currentIndex <= 0 ? 'disabled' : '') + '>' + (primaryParagraphs ? '← Προηγούμενη' : '← Προηγούμενο') + '</button><span>' + esc(positionLabel) + '</span><button class="button secondary small" data-article="' + esc(primaryNumber(provisions[currentIndex + 1] || {}) || '') + '" ' + (currentIndex < 0 || currentIndex >= provisions.length - 1 ? 'disabled' : '') + '>' + (primaryParagraphs ? 'Επόμενη →' : 'Επόμενο →') + '</button></div></div>' : paragraphChooser;
  const prose = (text, offset, ranges) => {
    let html = '', start = 0;
    const part = end => { const value = text.slice(start, end); const leading = value.length - value.trimStart().length; if (value.trim()) html += '<p class="legal-paragraph' + (value.split('\n').filter(line => line.includes('|')).length > 1 ? ' source-table-lines' : '') + '">' + LawCitationText.renderCitationText(value.trim(), ranges, offset + start + leading, value.split('\n').filter(line => line.includes('|')).length > 1) + '</p>'; };
    for (const split of text.matchAll(/\n\s*\n|\n(?=\s*(?:\d+[.)]|[α-ω][)’.)΄]\.?)\s)/gu)) { part(split.index); start = split.index + split[0].length; }
    part(text.length); return html;
  };
  return chooser + selected.map(unit => {
    const titleOffset = unit.title && unit.text.startsWith(unit.title + '\n') ? unit.title.length + 1 : 0;
    const paragraphs = data.units.filter(child => child.parent_id === unit.id && Number.isInteger(child.start_offset));
    const ranges = LawCitationText.citationRanges(unit, data);
    const body = paragraphs.length ? prose(unit.text.slice(titleOffset, paragraphs[0].start_offset), titleOffset, ranges) + paragraphs.map(paragraph => {
      const offset = unit.text.indexOf(paragraph.text, Math.max(0, paragraph.start_offset || 0));
      return '<div id="unit-' + esc(paragraph.id) + '" class="numbered-paragraph' + (state.focusArticle === primaryNumber(unit) && state.focusParagraph === paragraph.paragraph_number ? ' target-paragraph' : '') + '"><p class="legal-paragraph' + (paragraph.text.split('\n').filter(line => line.includes('|')).length > 1 ? ' source-table-lines' : '') + '"><button type="button" class="paragraph-label" data-article="' + esc(primaryNumber(unit)) + '" data-paragraph="' + esc(paragraph.paragraph_number) + '" aria-label="Σύνδεσμος στην παράγραφο ' + esc(paragraph.paragraph_number) + '">' + esc(paragraph.paragraph_number) + '.</button> ' + LawCitationText.renderCitationText(paragraph.text, ranges, offset, paragraph.text.split('\n').filter(line => line.includes('|')).length > 1) + '</p></div>';
    }).join('') : prose(unit.text.slice(titleOffset), titleOffset, ranges);
    const pages = unit.source_pages?.length > 1 ? 'Σελίδες ' + LawCitationText.formatPageRanges(unit.source_pages) : (unit.unit_type === 'article' ? 'Έναρξη άρθρου: σελίδα ' : 'Σελίδα ') + unit.source_page;
    return '<section class="legal-article" id="unit-' + esc(unit.id) + '">' + (unit.unit_type !== 'body' ? '<h3 class="article-title">' + esc(unit.label) + (unit.title ? ' — ' + (unit.text.startsWith(unit.title) ? LawCitationText.renderCitationText(unit.title, ranges) : esc(unit.title)) : '') + '</h3>' : '') + (unit.source_page ? '<p class="source-page">' + pages + (data.document.fek_raw && !data.document.historical ? ' του πρωτότυπου ΦΕΚ</p>' : ' του πρωτοτύπου</p>') : '') + body + '</section>';
  }).join('');
}

function provisionCountLabel(doc, units) {
  const count = units.filter(unit => !unit.parent_id && (doc.primary_unit_type !== 'paragraph' || unit.unit_type === 'paragraph')).length;
  if (doc.text_kind === 'archival_scan') return 'Σάρωση · χωρίς ελεγμένη μεταγραφή';
  if (doc.incorporated_code_article_count) return doc.original_provision_count + ' κυρωτικά άρθρα · ' + doc.incorporated_code_article_count + ' άρθρα Κώδικα';
  if (doc.primary_unit_type === 'paragraph') return count + ' ελεγμένες παράγραφοι' + (doc.original_provision_count ? ' από ' + doc.original_provision_count : '') + (doc.text_coverage === 'excerpt' ? ' · απόσπασμα' : '');
  return count + (doc.text_coverage === 'excerpt' ? (count === 1 ? ' ενότητα αποσπάσματος' : ' ενότητες αποσπάσματος') : ' άρθρα / ενότητες');
}

function findTextRange(text, query) {
  const folded = foldQuery(text).replace(/\s+/gu, ' ');
  const start = folded.indexOf(query);
  if (start < 0) return null;

  // Map the accent-insensitive match back to the original spelling and spacing.
  let offset = 0;
  let originalStart;
  for (const part of text.matchAll(/\s+|[^\s\p{M}]\p{M}*|\p{M}+/gu)) {
    const end = offset + (/^\s/u.test(part[0]) ? 1 : foldQuery(part[0]).length);
    if (originalStart === undefined && end > start) originalStart = part.index;
    if (end >= start + query.length) return { start: originalStart, end: part.index + part[0].length };
    offset = end;
  }
  return null;
}

function renderReaderMatches() {
  const query = foldQuery(state.readerQuery.trim()).replace(/\s+/gu, ' ');
  const list = $('#reader-search-results');
  const status = $('#reader-search-status');
  if (!query) {
    list.replaceChildren();
    list.hidden = true;
    status.textContent = '';
    return;
  }

  const matches = [];
  const { units } = state.selected;
  for (const unit of units) {
    if (unit.parent_id) continue;
    const bodyRange = findTextRange(unit.text, query);
    const text = bodyRange ? unit.text : unit.title || '';
    const range = bodyRange || findTextRange(text, query);
    if (!range) continue;
    const paragraph = bodyRange && units.find(child => child.parent_id === unit.id && child.start_offset <= range.start && child.end_offset >= range.end);
    const target = paragraph || unit;
    const label = [unit.scope_title, unit.label, paragraph && paragraph.label].filter(Boolean).join(' · ');
    const before = text.slice(Math.max(0, range.start - 48), range.start);
    const exact = text.slice(range.start, range.end);
    const after = text.slice(range.end, range.end + 80);
    const snippet = (before.length < range.start ? '…' : '') + esc(before) + '<mark>' + esc(exact) + '</mark>' + esc(after) + (range.end + after.length < text.length ? '…' : '');
    matches.push(`<li><button type="button" data-reader-hit="${esc(target.id)}">
      <strong>${esc(label || 'Κείμενο')}</strong><span>${snippet}</span>
    </button></li>`);
  }
  status.textContent = matches.length ? 'Ενότητες με αντιστοιχίες: ' + number(matches.length) : 'Η φράση δεν βρέθηκε στο αποθηκευμένο κείμενο.';
  list.innerHTML = matches.join('');
  list.hidden = !matches.length;
}

function renderReferenceRow(ref, relation) {
  const status = !ref.resolved ? 'Κείμενο σε αναμονή εισαγωγής'
    : ref.target_resolved ? (ref.paragraph ? 'Στην παράγραφο →' : ref.article ? 'Στο άρθρο →' : 'Στη βιβλιοθήκη')
      : ref.article_resolved ? 'Άρθρο διαθέσιμο · παράγραφος μη εντοπισμένη' : 'Διάταξη σε αναμονή εισαγωγής';
  return '<div class="reference-row"><div><span class="reference-label">' + esc(relation || 'Αναφορά') + '</span>' +
    LawCitationText.referenceLink(ref, ref.raw_text) +
    (ref.article ? '<span class="muted"> · άρθρο ' + esc(ref.article) + '</span>' : '') +
    (ref.paragraph ? '<span class="muted"> · παρ. ' + esc(ref.paragraph) + '</span>' : '') +
    '</div><span class="muted">' + status + '</span></div>';
}

function renderReader() {
  const data = state.selected;
  const doc = data.document;
  const guide = state.guides[doc.canonical_id];
  const tabs = [['overview', 'Με μια ματιά'], ['text', doc.text_kind === 'archival_scan' ? 'Πρωτότυπο PDF' : doc.text_coverage === 'excerpt' ? 'Απόσπασμα' : 'Κείμενο & άρθρα'], ['links', 'Παραπομπές (' + data.references.length + ')'], ['notes', 'Οι σημειώσεις μου']];
  $('#reader').innerHTML = '<div class="doc-heading"><p class="eyebrow">' + esc(citation(doc)) + (guide ? ' · ' + esc(guide.category) : '') + '</p><h2>' + esc(guide?.short_title || doc.title) + '</h2><div class="doc-subtitle">' + (doc.fek_raw ? 'ΦΕΚ ' + esc(doc.fek_raw) : esc(doc.ministry || 'Ελληνική νομοθεσία')) + ' · ' + provisionCountLabel(doc, data.units) + '</div>' + (guide ? '<details class="official-title"><summary>' + (doc.title_is_editorial ? 'Επιγραφή στο πρωτότυπο' : 'Πλήρης τίτλος') + '</summary><p>' + esc(doc.title_official || doc.title) + '</p></details>' : '') + '</div><div class="doc-tabs" role="tablist" aria-label="Ενότητες νόμου">' + tabs.map(([key, label]) => '<button role="tab" id="tab-' + key + '" aria-controls="doc-body" tabindex="' + (state.tab === key ? '0' : '-1') + '" aria-selected="' + (state.tab === key) + '" class="doc-tab' + (state.tab === key ? ' active' : '') + '" data-tab="' + key + '">' + esc(label) + '</button>').join('') + '</div><div class="doc-body" id="doc-body" role="tabpanel" aria-labelledby="tab-' + state.tab + '"></div>';
  const body = $('#doc-body');
  if (doc.text_kind !== 'parliament_metadata' && doc.text_kind !== 'archival_scan' && data.units.some(unit => !unit.parent_id && unit.text)) {
    body.insertAdjacentHTML('beforebegin', `<div class="reader-search" role="search" aria-label="Αναζήτηση στο ανοιχτό κείμενο">
      <label class="visually-hidden" for="reader-search">Λέξη ή φράση στο ανοιχτό κείμενο</label>
      <div class="search-box"><span aria-hidden="true">⌕</span><input id="reader-search" type="search" value="${esc(state.readerQuery)}" placeholder="Αναζήτηση μέσα στο κείμενο…" aria-controls="reader-search-results" autocomplete="off"></div>
      <p id="reader-search-status" role="status"></p><ul id="reader-search-results" hidden></ul>
    </div>`);
    renderReaderMatches();
  }
  if (state.tab === 'overview') {
    body.innerHTML = renderGuide(doc) + sourcePublicationNote(doc) + renderStarterTopics(doc) + '<div class="reader-actions"><button class="button primary" data-tab="text">' + (doc.text_kind === 'archival_scan' ? 'Δες το πρωτότυπο PDF' : doc.text_coverage === 'excerpt' ? 'Διάβασε το απόσπασμα' : 'Διάβασε το κείμενο') + ' →</button><button class="button secondary" data-tab="notes">Πρόσθεσε σημειώσεις</button></div>' + (guide?.related?.length ? '<h3>Διάβασε μαζί</h3><p class="muted">Σχετικές δημοσιεύσεις της συλλογής· δεν αποτελούν πλήρες ιστορικό αλλαγών.</p>' + guide.related.map(id => '<p><button class="text-link" data-doc="' + esc(id) + '">' + esc(state.guides[id]?.short_title || id) + '</button></p>').join('') : '') + '<h3>Πρωτότυπο & πηγές</h3><p>' + sourceLink(doc.source_url) + '</p>' + data.attachments.map(attachment => '<div class="attachment-row"><div>' + sourceLink(attachment.url, attachment.file_type || attachment.title || 'Έγγραφο πηγής') + (attachment.local_file ? '<br><a href="/api/laws/files/' + attachment.id + '" target="_blank" rel="noopener">Άνοιγμα αποθηκευμένου PDF ↗</a>' : '') + '</div><button class="button secondary small" data-download="' + attachment.id + '" ' + (attachment.local_file ? 'disabled' : '') + '>' + (attachment.local_file ? 'Αποθηκευμένο ✓' : 'Αποθήκευση PDF ↓') + '</button></div>').join('') + (data.annotation.summary ? '<h3>Η προσωπική σου περίληψη</h3><p class="text-unit">' + esc(data.annotation.summary) + '</p>' : '') + data.annotation.tags.map(tag => '<span class="tag">' + esc(tag) + '</span>').join('') + '<details class="import-details"><summary>Στοιχεία αποθήκευσης</summary><p class="muted">Πρώτη εισαγωγή: ' + date(doc.imported_at) + '<br>Τελευταία αποθήκευση: ' + date(doc.updated_at) + '</p></details>';
  } else if (state.tab === 'text') {
    if (doc.text_kind === 'archival_scan') {
      body.innerHTML = sourcePublicationNote(doc) + '<div class="archive-reader"><h3>Το πρωτότυπο, όπως διασώζεται</h3><p>Η σάρωση έχει αποθηκευτεί ολόκληρη. Δεν έχει προστεθεί ελεγμένη μεταγραφή. Διάβασε το κείμενο στις σελίδες του πρωτοτύπου.</p>' + data.attachments.filter(a => a.local_file).map(a => '<a class="button primary" href="/api/laws/files/' + esc(a.id) + '" target="_blank" rel="noopener">Άνοιξε το αποθηκευμένο PDF ↗</a>').join('') + '<p>' + sourceLink(doc.source_url, 'Άνοιγμα στην επίσημη πηγή ↗') + '</p></div>';
    } else body.innerHTML = sourcePublicationNote(doc) + renderArticleText(data) + (data.sourceText ? '<details><summary>' + (doc.text_coverage === 'excerpt' ? 'Αποθηκευμένο απόσπασμα' : doc.text_coverage === 'complete_greek_transcription' ? 'Μεταγραφή ελληνικού κειμένου' : doc.incorporated_code_article_count ? 'Αποθηκευμένο κείμενο κυρωτικού νόμου' : 'Πλήρες αποθηκευμένο κείμενο πηγής') + '</summary><p class="text-unit">' + esc(data.sourceText) + '</p></details><br>' : '') + (doc.historical ? '' : '<button class="button secondary" data-add-text>Προσθήκη / ενημέρωση κειμένου</button>');
  } else if (state.tab === 'links') {
    const relations = { mentions: 'Αναφορά', amends: 'Πιθανή τροποποίηση', repeals: 'Πιθανή κατάργηση', replaces: 'Πιθανή αντικατάσταση', applies: 'Πιθανή εφαρμογή' };
    body.innerHTML = '<p class="muted">Οι παραπομπές εντοπίζονται αυτόματα. Ο χαρακτηρισμός της σχέσης χρειάζεται έλεγχο στο κείμενο πηγής.</p><h3>Παραπέμπει σε</h3>' + (data.references.length ? data.references.map(ref => renderReferenceRow(ref, relations[ref.relation_type])).join('') : '<p class="muted">Δεν έχουν εντοπιστεί παραπομπές στο αποθηκευμένο κείμενο.</p>') + '<h3>Δίκτυο συνδέσεων</h3><div id="graph-connections"><p class="muted">Αναζήτηση συνδεδεμένων νόμων…</p></div><h3>Αναφέρεται από</h3>' + (data.incoming.length ? data.incoming.map(item => '<div class="reference-row"><button class="text-link" data-doc="' + esc(item.id) + '">' + esc(item.title) + '</button></div>').join('') : '<p class="muted">Δεν υπάρχουν ακόμη εισερχόμενες παραπομπές στη βιβλιοθήκη σου.</p>');
  } else {
    body.innerHTML = '<p class="muted">Η προσωπική σου τεκμηρίωση αποθηκεύεται ξεχωριστά από το κείμενο πηγής. Κάθε αποθήκευση διατηρείται στο ιστορικό.</p><form id="notes-form"><label>Περίληψη<textarea name="summary" rows="4">' + esc(data.annotation.summary) + '</textarea></label><label>Σημειώσεις<textarea name="notes" rows="7">' + esc(data.annotation.notes) + '</textarea></label><label>Ετικέτες, χωρισμένες με κόμμα<input name="tags" value="' + esc(data.annotation.tags.join(', ')) + '" placeholder="π.χ. περιβάλλον, τοπική αυτοδιοίκηση"></label><p class="form-error" id="notes-error" role="alert"></p><button class="button primary" type="submit">Αποθήκευση σημειώσεων</button></form><h3>Ιστορικό αλλαγών (' + data.revisions.length + ')</h3><div class="note-history">' + (data.revisions.length ? data.revisions.map(revision => '<details><summary>Έκδοση ' + revision.revision + ' · ' + date(revision.created_at) + '</summary><h4>Περίληψη</h4><pre>' + esc(revision.summary) + '</pre><h4>Σημειώσεις</h4><pre>' + esc(revision.notes) + '</pre><p class="muted">' + esc(revision.tags.join(', ')) + '</p></details>').join('') : '<p class="muted">Δεν έχουν αποθηκευτεί αλλαγές.</p>') + '</div>';
    $('#notes-form').addEventListener('input', () => { state.dirty = true; });
    $('#notes-form').addEventListener('submit', saveNotes);
  }
  if (state.readerMessage) body.insertAdjacentHTML('afterbegin', '<p class="source-note" role="status">' + esc(state.readerMessage) + '</p>');
}

async function saveNotes(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button');
  button.disabled = true;
  try {
    const values = Object.fromEntries(new FormData(form));
    await api('annotation', { method: 'PUT', body: JSON.stringify({ ...values, tags: values.tags.split(','), id: state.selected.document.canonical_id, revision: state.selected.annotation.revision }) });
    await openDocument(state.selected.document.canonical_id, true);
    notice('Οι σημειώσεις αποθηκεύτηκαν στον υπολογιστή σου.');
    await loadList();
  } catch (error) { $('#notes-error').textContent = error.message; button.disabled = false; }
}

function renderLatestImport(jobs) {
  const target = $('#home-stats-latest-import');
  const latest = jobs.find(job => job.status === 'completed');
  const result = latest?.result;
  if (!result?.before || !result?.after) { target.hidden = true; return; }
  const metrics = [['documents', 'τεκμήρια'], ['articles', 'άρθρα'], ['paragraphs', 'παράγραφοι'], ['references', 'παραπομπές'], ['attachments', 'σύνδεσμοι πηγών'], ['downloadedPdfs', 'PDF']];
  const changes = metrics.flatMap(([key, label]) => {
    if (!Number.isFinite(result.before[key]) || !Number.isFinite(result.after[key])) return [];
    const delta = result.after[key] - result.before[key];
    return delta ? [(delta > 0 ? '+' : '−') + number(Math.abs(delta)) + ' ' + label] : [];
  });
  if (!Number.isFinite(result.before.paragraphs) && Number.isFinite(result.before.units) && Number.isFinite(result.after.units)) {
    const delta = result.after.units - result.before.units;
    if (delta) changes.push((delta > 0 ? '+' : '−') + number(Math.abs(delta)) + ' ενότητες κειμένου');
  }
  let message = 'Τελευταία εισαγωγή · ' + date(latest.finished_at || latest.started_at) + ': ' + (changes.length ? changes.join(' · ') : 'χωρίς μεταβολή στις καταμετρήσεις') + '.';
  if (Number.isFinite(result.before.paragraphs) && Number.isFinite(result.after.paragraphs) && result.before.paragraphs !== result.after.paragraphs) message += ' Παράγραφοι: ' + number(result.before.paragraphs) + ' → ' + number(result.after.paragraphs) + '.';
  if (Number.isFinite(result.after.documents) && result.before.documents === result.after.documents) message += ' Το σύνολο τεκμηρίων παρέμεινε ' + number(result.after.documents) + '.';
  if (target.textContent !== message) target.textContent = message;
  target.hidden = false;
}

async function loadJobs() {
  const result = await api('jobs');
  renderLatestImport(result.jobs);
  const labels = { completed: 'Ολοκληρώθηκε', running: 'Σε εξέλιξη', failed: 'Απέτυχε', interrupted: 'Διακόπηκε' };
  $('#job-list').innerHTML = result.jobs.length ? result.jobs.map(job => '<div class="job-row"><div><strong>' + (job.query.source === 'official_historical_archives' ? 'Ιστορική συλλογή · επίσημες πηγές' : job.query.source === 'national_printing_office' ? 'Εθνικό Τυπογραφείο · βασική συλλογή' : 'Βουλή των Ελλήνων · σελίδα ' + job.query.pageNo) + '</strong><p>' + date(job.started_at) + (job.query.lawNum ? ' · Ν. ' + esc(job.query.lawNum) : '') + (job.query.title ? ' · ' + esc(job.query.title) : '') + '</p>' + (job.result ? '<p>' + number(job.result.created) + ' νέα · ' + number(job.result.updated) + ' ενημερωμένα' + (job.result.page ? ' · ' + number(job.result.page.total_records) + ' διαθέσιμα στην πηγή' : '') + '</p>' : '') + (job.error ? '<p class="form-error">' + esc(job.error) + '</p>' : '') + '</div><span class="status-chip ' + job.status + '">' + labels[job.status] + '</span></div>').join('') : '<div class="empty-list">Οι εισαγωγές σου θα εμφανιστούν εδώ.</div>';
  const previous = new Map(state.jobs.map(job => [job.id, job.status]));
  for (const job of result.jobs) {
    if (previous.get(job.id) === 'running' && job.status !== 'running') {
      if (job.status === 'completed') {
        notice('Η εισαγωγή αποθηκεύτηκε: ' + job.result.created + ' νέα και ' + job.result.updated + ' ενημερωμένα έγγραφα.');
        if (job.query.pageNo) $('#import-form').elements.pageNo.value = job.query.pageNo + 1;
        await loadList();
      } else notice('Η εισαγωγή δεν ολοκληρώθηκε. ' + (job.error || ''), true);
    }
  }
  state.jobs = result.jobs;
}

function textDialog(prefill = false) {
  const form = $('#text-form');
  form.reset();
  $('#text-error').textContent = '';
  if (prefill && state.selected) {
    const doc = state.selected.document;
    form.elements.title.value = doc.title;
    form.elements.number.value = doc.law_number || '';
    form.elements.year.value = doc.law_year || '';
    form.elements.sourceUrl.value = safeUrl(doc.source_url);
  }
  $('#text-dialog').showModal();
}

document.addEventListener('click', async event => {
  if (event.target.closest('a[href="#gazette-numbering"]')) {
    event.preventDefault();
    $('#gazette-numbering').scrollIntoView({ block: 'start' });
    return;
  }
  const topicLink = event.target.closest('a[data-topic-link]');
  if (topicLink) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    if (!allowNavigation()) return;
    switchView('sources', false);
    history.replaceState(null, '', topicLink.hash);
    showTopicGuide(topicLink.dataset.topicLink);
    return;
  }
  const citationLink = event.target.closest('a[data-inline-doc]');
  if (citationLink) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    try { await openReaderRoute(citationLink.hash, citationLink.dataset.inlineUnit, true); }
    catch (error) { notice(error.message, true); }
    return;
  }

  const link = event.target.closest('a[data-library-type]');
  if (link) {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    try { await findLaws('', '', 'recent', link.dataset.libraryType); }
    catch (error) { notice(error.message, true); }
    return;
  }
  const button = event.target.closest('button');
  if (!button) return;
  if (button.hasAttribute('data-reference-back')) { history.back(); return; }
  try {
    if (button.dataset.topicGuide) {
      const id = button.getAttribute('aria-expanded') === 'true' ? '' : button.dataset.topicGuide;
      history.replaceState(null, '', id ? '#topic=' + id : '#sources');
      showTopicGuide(id);
      return;
    }
    if (button.hasAttribute('data-topic-close')) {
      const card = $('[data-topic-guide][aria-expanded="true"]');
      history.replaceState(null, '', '#sources');
      showTopicGuide('');
      card.focus();
      return;
    }
    if (button.hasAttribute('data-picks-category')) { renderEditorPicks(button.dataset.picksCategory); return; }
    if (button.hasAttribute('data-history-start')) { await openHistory(); return; }
    if (button.hasAttribute('data-gazette-page')) {
      state.gazettePage = Number(button.dataset.gazettePage);
      renderGazettes(false);
      $('#gazette-index-title').scrollIntoView({ block: 'start' });
      return;
    }
    if (button.hasAttribute('data-gazette-year')) {
      if (!allowNavigation()) return;
      $('#gazette-year').value = button.dataset.gazetteYear;
      renderGazetteSeries();
      $('#gazette-series').value = button.dataset.gazetteSeries;
      $('#gazette-category').value = ''; $('#gazette-status').value = ''; $('#gazette-search').value = '';
      renderGazettes();
      $('#gazette-index-title').scrollIntoView({ block: 'start' });
      return;
    }
    if (button.dataset.view && !allowNavigation()) return;
    if (button.dataset.view) { switchView(button.dataset.view); window.scrollTo({ top: 0, behavior: 'instant' }); }
    if (button.dataset.justiceTarget) {
      const heading = document.getElementById(button.dataset.justiceTarget);
      heading.focus({ preventScroll: true });
      heading.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
    if (button.hasAttribute('data-home-query')) await findLaws(button.dataset.homeQuery);
    if (button.hasAttribute('data-home-category')) await findLaws('', button.dataset.homeCategory, button.dataset.homeCategory === 'Ιστορικές αφετηρίες' ? 'oldest' : 'recent');
    if (button.hasAttribute('data-category')) {
      clearTimeout(searchTimer);
      state.category = button.dataset.category;
      state.page = 1;
      renderFilters();
      $('#topic-filters [aria-pressed="true"]').focus({ preventScroll: true });
      await loadList();
    }
    if (button.hasAttribute('data-reset-search')) {
      clearTimeout(searchTimer);
      state.q = ''; state.category = ''; state.type = ''; state.page = 1;
      $('#library-document-type').value = '';
      switchView('library');
      $('#search').value = '';
      renderFilters();
      await loadList();
    }
    if (button.dataset.close) $('#' + button.dataset.close).close();
    if (button.hasAttribute('data-open-import')) $('#import-dialog').showModal();
    if (button.dataset.doc) await openDocument(button.dataset.doc, false, { article: button.dataset.targetArticle, paragraph: button.dataset.targetParagraph, unit: button.dataset.targetUnit, query: button.closest('#document-list') ? state.q : '' });
    if (button.dataset.readerHit && allowNavigation()) {
      state.readerMessage = '';
      const units = state.selected.units;
      const target = units.find(unit => unit.id === button.dataset.readerHit);
      const primary = target.parent_id ? units.find(unit => unit.id === target.parent_id) : target;
      state.focusArticle = primaryNumber(primary) || null;
      state.focusParagraph = target.parent_id ? target.paragraph_number : null;
      state.focusQuote = null;
      state.tab = 'text';
      updateReaderUrl();
      renderReader();
      const passage = document.getElementById('unit-' + target.id);
      if (passage) {
        passage.tabIndex = -1;
        passage.focus({ preventScroll: true });
        passage.scrollIntoView({ block: 'center' });
      }
      return;
    }
    if (button.dataset.page) { state.page = Number(button.dataset.page); await loadList(); }
    if (button.dataset.article && state.selected && allowNavigation()) {
      state.readerMessage = '';
      state.focusArticle = button.dataset.article;
      state.focusParagraph = button.dataset.paragraph || null;
      state.focusQuote = null;
      state.tab = 'text';
      updateReaderUrl();
      renderReader();
      $('#reader').scrollIntoView({block:'start'});
      scrollToParagraph();
    }
    if (button.dataset.tab && allowNavigation()) {
      state.readerMessage = '';
      state.tab = button.dataset.tab;
      updateReaderUrl();
      renderReader();
      if (state.tab === 'links') {
        const sourceId = state.selected.document.canonical_id;
        const result = await api('connections?id=' + encodeURIComponent(sourceId) + '&depth=4');
        if (state.tab === 'links' && state.selected?.document.canonical_id === sourceId) $('#graph-connections').innerHTML = result.connections.length ? result.connections.map(item => '<div class="reference-row"><button class="text-link" data-doc="' + esc(item.id) + '">' + esc(item.title) + '</button><span class="muted">' + item.distance + ' βήματα</span></div>').join('') : '<p class="muted">Δεν υπάρχουν ακόμη άλλοι συνδεδεμένοι νόμοι στη βιβλιοθήκη.</p>';
      }
    }
    if (button.hasAttribute('data-add-text')) textDialog(true);
    if (button.dataset.download) {
      button.disabled = true;
      button.textContent = 'Λήψη…';
      await api('download', { method: 'POST', body: JSON.stringify({ id: button.dataset.download }) });
      await openDocument(state.selected.document.canonical_id, true);
      notice('Το PDF αποθηκεύτηκε στον υπολογιστή σου.');
    }
  } catch (error) { notice(error.message, true); button.disabled = false; }
});

$('#open-import').addEventListener('click', () => { $('#import-error').textContent = ''; $('#import-dialog').showModal(); });
$('#open-text').addEventListener('click', () => textDialog());
$('#import-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    await api('import', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    $('#import-dialog').close();
    notice('Η εισαγωγή ξεκίνησε. Μπορείς να συνεχίσεις την περιήγηση.');
    await Promise.all([refreshStatus(), loadJobs()]);
  } catch (error) { $('#import-error').textContent = error.message; }
  finally { button.disabled = false; }
});

$('#text-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  try {
    if (!allowNavigation()) return;
    const result = await api('text', { method: 'POST', body: JSON.stringify(Object.fromEntries(new FormData(form))) });
    $('#text-dialog').close();
    await Promise.all([loadList(), refreshStatus()]);
    await openDocument(result.id);
    notice('Ο νόμος και οι παραπομπές αποθηκεύτηκαν τοπικά.');
  } catch (error) { $('#text-error').textContent = error.message; }
  finally { button.disabled = false; }
});

$('#backup').addEventListener('click', async event => {
  const button = event.currentTarget;
  button.disabled = true;
  try {
    const result = await api('backup', { method: 'POST', body: '{}' });
    const link = document.createElement('a');
    link.href = result.url;
    link.download = result.filename;
    document.body.append(link);
    link.click();
    link.remove();
    notice('Το αντίγραφο βάσης δημιουργήθηκε. Κράτησε και τον φάκελο files αν έχεις αποθηκεύσει PDF.');
  } catch (error) { notice(error.message, true); }
  finally { button.disabled = false; }
});

document.addEventListener('change', event => {
  if (event.target.matches('select[id^="gazette-"]')) {
    if (event.target.id === 'gazette-year') renderGazetteSeries();
    renderGazettes();
  }
  if (event.target.id === 'library-document-type') {
    clearTimeout(searchTimer);
    state.type = event.target.value;
    state.page = 1;
    switchView('library');
    loadList().catch(error => notice(error.message, true));
  }
  if (event.target.id === 'library-sort') { clearTimeout(searchTimer); state.sort = event.target.value; state.page = 1; loadList().catch(error => notice(error.message, true)); }
  if (event.target.id === 'article-jump' || event.target.id === 'paragraph-jump') {
    if (event.target.id === 'article-jump') { state.focusArticle = event.target.value || null; state.focusParagraph = null; state.focusQuote = null; }
    else state.focusParagraph = event.target.value || null;
    updateReaderUrl();
    renderReader();
    scrollToParagraph();
  }
});

let searchTimer;
$('#reader').addEventListener('input', event => {
  if (event.target.id !== 'reader-search') return;
  state.readerQuery = event.target.value;
  renderReaderMatches();
});
$('#gazette-search').addEventListener('input', renderGazettes);
$('#home-search-form').addEventListener('submit', event => {
  event.preventDefault();
  findLaws($('#home-search').value).catch(error => notice(error.message, true));
});
$('#search').addEventListener('input', event => {
  state.q = event.target.value;
  state.page = 1;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadList().catch(error => notice(error.message, true)), 220);
});
window.addEventListener('keydown', event => {
  if (event.target.matches('[role="tab"]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const index = tabs.indexOf(event.target);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].click();
    document.querySelector('[role="tab"][aria-selected="true"]')?.focus();
  }
  if (event.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) && !document.querySelector('dialog[open]')) { event.preventDefault(); switchView('library'); $('#search').focus(); }
});
window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('hashchange', () => {
  const route = location.hash;
  if (route.startsWith('#law=')) openReaderRoute(route).catch(error => notice(error.message, true));
  else if (route === '#laws') switchView('library', false);
  else if (['#sources', '#library', '#gazettes', '#picks', '#justice', '#jobs', '#settings'].includes(route)) switchView(route.slice(1), false);
});

async function init() {
  renderTopicCards();
  const route = location.hash;
  if (route.startsWith('#topic=')) showTopicGuide(new URLSearchParams(route.slice(1)).get('topic'));
  state.type = location.hash === '#laws' ? 'law' : '';
  $('#library-document-type').value = state.type;
  state.guides = await api('guides');
  renderFilters();
  renderHistory();
  await Promise.all([refreshStatus(), loadList(), loadJobs()]);
  if (location.hash === '#laws') switchView('library', false);
  else if (location.hash === '#history') await openHistory();
  else if (location.hash.startsWith('#law=')) await openReaderRoute(location.hash);
  else switchView(['sources', 'library', 'gazettes', 'picks', 'justice', 'jobs', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'sources', false);
  setInterval(async () => {
    try { await Promise.all([refreshStatus(), loadJobs()]); }
    catch { notice('Η τοπική υπηρεσία δεν απαντά. Έλεγξε ότι το παράθυρο του Appofasistis παραμένει ανοιχτό.', true); }
  }, 3500);
}
init().catch(error => notice(error.message, true));
