document.addEventListener('DOMContentLoaded', function () {
  // login check
  var userName = localStorage.getItem('userName');
  if (!userName) {
    window.location.href = 'index.html';
    return;
  }
  document.getElementById('user-name').textContent = userName;

  document.getElementById('logout-btn').addEventListener('click', function() {
    localStorage.removeItem('userName');
    window.location.href = 'index.html';
  });

  // branch dropdown logic reused
  var branchesBtn = document.getElementById('branches-btn');
  var branchDropdown = document.getElementById('branch-dropdown');
  if (branchesBtn && branchDropdown) {
    branchesBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      branchDropdown.classList.toggle('is-open');
    });
    document.addEventListener('click', function() {
      branchDropdown.classList.remove('is-open');
    });
    branchDropdown.addEventListener('click', function(e) { e.stopPropagation(); });

    branchDropdown.querySelectorAll('.branch-option').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var branch = this.getAttribute('data-branch');
        localStorage.setItem('selectedBranch', branch);
        window.location.href = 'records.html';
      });
    });
  }

  // three-dots menu same as other pages
  var navDotsBtn = document.getElementById('nav-dots-btn');
  var navDotsDropdown = document.getElementById('nav-dots-dropdown');
  if (navDotsBtn && navDotsDropdown) {
    navDotsBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      var isOpen = navDotsDropdown.classList.toggle('is-open');
      navDotsBtn.setAttribute('aria-expanded', isOpen);
    });
    document.addEventListener('click', function() {
      navDotsDropdown.classList.remove('is-open');
      navDotsBtn.setAttribute('aria-expanded', 'false');
    });
    navDotsDropdown.addEventListener('click', function(e) { e.stopPropagation(); });
    navDotsDropdown.querySelectorAll('.nav-dots-item').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var action = this.getAttribute('data-action');
        navDotsDropdown.classList.remove('is-open');
        if (action === 'home') window.location.href = 'dashboard.html';
        else if (action === 'records') window.location.href = 'records.html';
        else if (action === 'analytics') window.location.href = 'analytics.html';
        else if (action === 'branches') window.location.href = 'branches.html';
        else if (action === 'teams') window.location.href = 'teams.html';
        else if (action === 'etc') window.location.href = 'about.html';
        else if (action === 'contact') window.location.href = 'contact.html';
      });
    });
  }

  // -----------------------------------------------------------------------------
  // replicate map functionality from dashboard
  // list of municipalities with coordinates and barangays
  var municipalities = [
    { name: 'Almagro', lat: 11.9167, lng: 124.2833, barangays: ['Bacjao', 'Biasong I', 'Biasong II', 'Costa Rica', 'Costa Rica II', 'Guin-ansan', 'Imelda', 'Kerikite', 'Lunang I', 'Lunang II', 'Mabuhay', 'Magsaysay', 'Malobago', 'Marasbaras', 'Panjobjoban I', 'Panjobjoban II', 'Poblacion', 'Roño', 'San Isidro', 'San Jose', 'Talahid', 'Tonga-tonga', 'Veloso'] },
    { name: 'Basey', lat: 11.2833, lng: 125.0667, barangays: ['Amandayehan', 'Anglit', 'Bacubac', 'Balante', 'Baloog', 'Basiao', 'Baybay', 'Binongtu-an', 'Buenavista', 'Bulao', 'Burgos', 'Buscada', 'Cambayan', 'Can-abay', 'Cancaiyas', 'Canmanila', 'Catadman', 'Cogon', 'Del Pilar', 'Dolongan', 'Guintigui-an', 'Guirang', 'Iba', 'Inuntan', 'Lawa-an', 'Loog', 'Loyo', 'Mabini', 'Magallanes', 'Manlilinab', 'May-it', 'Mercado', 'Mongabong', 'New San Agustin', 'Nouvelas Occidental', 'Old San Agustin', 'Palaypay', 'Panugmonon', 'Pelit', 'Roxas', 'Salvacion', 'San Antonio', 'San Fernando', 'Sawa', 'Serum', 'Sugca', 'Sugponon', 'Sulod', 'Tinaogan', 'Tingib', 'Villa Aurora'] },
    { name: 'Calbayog City', lat: 12.0672, lng: 124.5972, barangays: ['Acedillo', 'Aguit-itan', 'Alibaba', 'Amampacang', 'Anislag', 'Awang East', 'Awang West', 'Ba-ay', 'Bagacay', 'Bagong Lipunan', 'Baja', 'Balud', 'Bante', 'Bantian', 'Basud', 'Bayo', 'Begaho', 'Binaliw', 'Bontay', 'Buenavista', 'Bugtong', 'Cabacungan', 'Cabatuan', 'Cabicahan', 'Cabugawan', 'Cacaransan', 'Cag-anahaw', 'Cag-anibong', 'Cag-olango', 'Cagbanayacao', 'Cagbayang', 'Cagbilwang', 'Cagboborac', 'Caglanipao Sur', 'Cagmanipes Norte', 'Cagmanipes Sur', 'Cagnipa', 'Cagsalaosao', 'Cahumpan', 'Calocnayan', 'Cangomaod', 'Canhumadac', 'Capacuhan', 'Capoocan', 'Carayman', 'Carmen', 'Catabunan', 'Caybago', 'Central', 'Cogon', 'Dagum', 'Danao I', 'Danao II', 'Dawo', 'De Victoria', 'Dinabongan', 'Dinagan', 'Dinawacan', 'Esperanza', 'Gabay', 'Gadgaran', 'Gasdo', 'Geraga-an', 'Guimbaoyan Norte', 'Guimbaoyan Sur', 'Guin-on', 'Hamorawon', 'Helino', 'Hibabngan', 'Hibatang', 'Higasaan', 'Himalandrog', 'Hugon Rosales', 'Jacinto', 'Jimautan', 'Jose A. Roño', 'Kalilihan', 'Kilikili', 'La Paz', 'Langoyon', 'Lapaan', 'Libertad', 'Limarayon', 'Longsob', 'Lonoy', 'Looc', 'Mabini I', 'Mabini II', 'Macatingog', 'Mag-ubay', 'Maguino-o', 'Malaga', 'Malajog', 'Malayog', 'Malopalo', 'Mancol', 'Mantaong', 'Manuel Barral, Sr.', 'Marcatubig', 'Matobato', 'Mawacat', 'Maybog', 'Maysalong', 'Migara', 'Nabang', 'Naga', 'Naguma', 'Navarro', 'Nijaga', 'Oboob', 'Obrero', 'Olera', 'Oquendo', 'Osmeña', 'Pagbalican', 'Palanas', 'Palanogan', 'Panlayahan', 'Panonongan', 'Panoypoy', 'Patong', 'Payahan', 'Peña', 'Pilar', 'Pinamorotan', 'Quezon', 'Rawis', 'Rizal I', 'Rizal II', 'Roxas I', 'Roxas II', 'Saljag', 'Salvacion', 'San Antonio', 'San Isidro', 'San Joaquin', 'San Jose', 'San Policarpio', 'San Rufino', 'Saputan', 'Sigo', 'Sinantan', 'Sinidman Occidental', 'Sinidman Oriental', 'Tabawan', 'Talahiban', 'Tanval', 'Tapa-e', 'Tarabucan', 'Tigbe', 'Tinambacan Norte', 'Tinambacan Sur', 'Tinaplacan', 'Tomaliguez', 'Trinidad', 'Victory', 'Villahermosa'] },
    { name: 'Calbiga', lat: 11.6167, lng: 125.0167, barangays: ['Antol', 'Bacyaran', 'Barangay 1', 'Barangay 2', 'Barangay 3', 'Barangay 4', 'Barangay 5', 'Barangay 6', 'Barangay 7', 'Barobaybay', 'Beri', 'Binanggaran', 'Borong', 'Bulao', 'Buluan', 'Caamlongan', 'Calayaan', 'Calingonan', 'Canbagtic', 'Canticum', 'Daligan', 'Guinbanga', 'Hindang', 'Hubasan', 'Literon', 'Lubang', 'Macaalan', 'Mahangcao', 'Malabal', 'Minata', 'Otoc', 'Panayuran', 'Pasigay', 'Patong', 'Polangi', 'Rawis', 'San Ignacio', 'San Mauricio', 'Sinalangtan', 'Timbangan', 'Tinago'] },
    { name: 'Catbalogan City', lat: 11.7792, lng: 124.8842, barangays: ['Albalate', 'Bagongon', 'Bangon', 'Basiao', 'Buluan', 'Bunuanan', 'Cabugawan', 'Cagudalo', 'Cagusipan', 'Cagutian', 'Cagutsan', 'Canhawan Gote', 'Canlapwas', 'Cawayan', 'Cinco', 'Darahuway Daco', 'Darahuway Gote', 'Estaka', 'Guindaponan', 'Guinsorongan', 'Ibol', 'Iguid', 'Lagundi', 'Libas', 'Lobo', 'Manguehay', 'Maulong', 'Mercedes', 'Mombon', 'Muñoz', 'New Mahayag', 'Old Mahayag', 'Palanyogon', 'Pangdan', 'Payao', 'Poblacion 1', 'Poblacion 2', 'Poblacion 3', 'Poblacion 4', 'Poblacion 5', 'Poblacion 6', 'Poblacion 7', 'Poblacion 8', 'Poblacion 9', 'Poblacion 10', 'Poblacion 11', 'Poblacion 12', 'Poblacion 13', 'Pupua', 'Rama', 'San Andres', 'San Pablo', 'San Roque', 'San Vicente', 'Silanga', 'Socorro', 'Totoringon'] },
    { name: 'Daram', lat: 11.6333, lng: 124.7833, barangays: ['Arawane', 'Astorga', 'Bachao', 'Baclayan', 'Bagacay', 'Bayog', 'Betaug', 'Birawan', 'Bono-anon', 'Buenavista', 'Burgos', 'Cabac', 'Cabil-isan', 'Cabiton-an', 'Cabugao', 'Cagboboto', 'Calawan-an', 'Cambuhay', 'Campelipa', 'Candugue', 'Canloloy', 'Cansaganay', 'Casab-ahan', 'Guindapunan', 'Guintampilan', 'Iquiran', 'Jacopon', 'Losa', 'Lucob-lucob', 'Mabini', 'Macalpe', 'Mandoyucan', 'Marupangdan', 'Mayabay', 'Mongolbongol', 'Nipa', 'Parasan', 'Poblacion 1', 'Poblacion 2', 'Poblacion 3', 'Pondang', 'Poso', 'Real', 'Rizal', 'San Antonio', 'San Jose', 'San Miguel', 'San Roque', 'San Vicente', 'Saugan', 'So-ong', 'Sua', 'Sugod', 'Talisay', 'Tugas', 'Ubo', 'Valles-Bello', 'Yangta'] },
    { name: 'Gandara', lat: 12.0167, lng: 124.8167, barangays: ['Adela Heights', 'Arong', 'Balocawe', 'Bangahon', 'Beslig', 'Buao', 'Bunyagan', 'Burabod I', 'Burabod II', 'Calirocan', 'Canhumawid', 'Caparangasan', 'Caranas', 'Carmona', 'Casab-ahan', 'Casandig', 'Catorse de Agosto', 'Caugbusan', 'Concepcion', 'Diaz', 'Dumalo-ong', 'Elcano', 'Gerali', 'Gereganan', 'Giaboc', 'Hampton', 'Hetebac', 'Himamaloto', 'Hinayagan', 'Hinugacan', 'Hiparayan', 'Jasminez', 'Lungib', 'Mabuhay', 'Macugo', 'Malayog', 'Marcos', 'Minda', 'Nacube', 'Nalihugan', 'Napalisan', 'Natimonan', 'Ngoso', 'Palambrag', 'Palanas', 'Pizarro', 'Piñaplata', 'Pologon', 'Purog', 'Rawis', 'Rizal', 'Samoyao', 'San Agustin', 'San Antonio', 'San Enrique', 'San Francisco', 'San Isidro', 'San Jose', 'San Miguel', 'San Pelayo', 'San Ramon', 'Santa Elena', 'Santo Niño', 'Senibaran', 'Sidmon', 'Tagnao', 'Tambongan', 'Tawiran', 'Tigbawon'] },
    { name: 'Hinabangan', lat: 11.6833, lng: 125.0833, barangays: ['Bagacay', 'Binobucalan', 'Bucalan', 'Cabalagnan', 'Cabang', 'Canano', 'Concord', 'Consolabao', 'Dalosdoson', 'Fatima', 'Lim-ao', 'Malihao', 'Mugdo', 'Osmeña', 'Poblacion 1', 'Poblacion 2', 'Rawis', 'San Jose', 'San Rafael', 'Tabay', 'Yabon'] },
    { name: 'Jiabong', lat: 11.7667, lng: 124.9500, barangays: ['Barangay No. 1', 'Barangay No. 2', 'Barangay No. 3', 'Barangay No. 4', 'Barangay No. 5', 'Barangay No. 6', 'Barangay No. 7', 'Barangay No. 8', 'Bawang', 'Bugho', 'Camarobo-an', 'Candayao', 'Cantongtong', 'Casapa', 'Catalina', 'Cristina', 'Dogongan', 'Garcia', 'Hinaga', 'Jia-an', 'Jidanao', 'Lulugayan', 'Macabetas', 'Malino', 'Malobago', 'Mercedes', 'Nagbac', 'Parina', 'Salvacion', 'San Andres', 'San Fernando', 'San Miguel', 'Tagbayaon', 'Victory'] },
    { name: 'Marabut', lat: 11.1167, lng: 125.2167, barangays: ['Amambucale', 'Amantillo', 'Binukyahan', 'Caluwayan', 'Canyoyo', 'Catato Poblacion', 'Ferreras', 'Legaspi', 'Lipata', 'Logero', 'Mabuhay', 'Malobago', 'Odoc', 'Osmeña', 'Panan-awan', 'Pinalanga', 'Pinamitinan', 'Roño', 'San Roque', 'Santa Rita', 'Santo Niño Poblacion', 'Tagalag', 'Tinabanan', 'Veloso'] },
    { name: 'Matuguinao', lat: 12.1333, lng: 124.8833, barangays: ['Angyap', 'Bag-otan', 'Barruz', 'Camonoan', 'Carolina', 'Deit', 'Del Rosario', 'Inubod', 'Libertad', 'Ligaya', 'Mabuligon Poblacion', 'Maduroto Poblacion', 'Mahanud', 'Mahayag', 'Nagpapacao', 'Rizal', 'Salvacion', 'San Isidro', 'San Roque', 'Santa Cruz'] },
    { name: 'Motiong', lat: 11.7782, lng: 124.9986, barangays: ['Angyap', 'Barayong', 'Bayog', 'Beri', 'Bonga', 'Calantawan', 'Calapi', 'Caluyahan', 'Canatuan', 'Candomacol', 'Canvais', 'Capaysagan', 'Caranas', 'Caulayanan', 'Hinica-an', 'Inalad', 'Linonoban', 'Malobago', 'Malonoy', 'Mararangsi', 'Maypange', 'New Minarog', 'Oyandic', 'Pamamasan', 'Poblacion I', 'Poblacion I-A', 'Pusongan', 'San Andres', 'Santo Niño', 'Sarao'] },
    { name: 'Paranas (Wright)', lat: 11.7715, lng: 125.0225, barangays: [
      { name: 'Anagasi', lat: 11.80, lng: 125.05 },
      { name: 'Apolonia', lat: 11.78, lng: 125.08 },
      { name: 'Bagsa', lat: 11.79, lng: 125.04 },
      { name: 'Balbagan', lat: 11.75, lng: 125.06 },
      { name: 'Bato', lat: 11.77, lng: 125.03 },
      { name: 'Buray', lat: 11.7753, lng: 125.0387 },
      { name: 'Cantaguic', lat: 11.73, lng: 125.08 },
      { name: 'Cantao-an', lat: 11.79, lng: 125.05 },
      { name: 'Cantato', lat: 11.76, lng: 125.07 },
      { name: 'Casandig I', lat: 11.74, lng: 125.04 },
      { name: 'Casandig II', lat: 11.74, lng: 125.05 },
      { name: 'Cawayan', lat: 11.7931, lng: 125.0318 },
      { name: 'Concepcion', lat: 11.72, lng: 125.09 },
      { name: 'Jose Roño', lat: 11.71, lng: 125.10 },
      { name: 'Lawaan I', lat: 11.70, lng: 125.11 },
      { name: 'Lawaan II', lat: 11.70, lng: 125.12 },
      { name: 'Lipata', lat: 11.788, lng: 125.016 },
      { name: 'Lokilok n', lat: 11.69, lng: 125.13 },
      { name: 'Mangcal', lat: 11.78, lng: 125.02 },
      { name: 'Maylobe', lat: 11.72, lng: 125.10 },
      { name: 'Minarog', lat: 11.79, lng: 125.02 },
      { name: 'Nawi', lat: 11.71, lng: 125.11 },
      { name: 'Pabanog', lat: 11.76, lng: 125.01 },
      { name: 'Paco', lat: 11.75, lng: 125.02 },
      { name: 'Pagsa-ogan', lat: 11.73, lng: 125.03 },
      { name: 'Pagsanjan', lat: 11.72, lng: 125.04 },
      { name: 'Patag', lat: 11.71, lng: 125.05 },
      { name: 'Pequit', lat: 11.80, lng: 125.03 },
      { name: 'Poblacion 1', lat: 11.77, lng: 125.02 },
      { name: 'Poblacion 2', lat: 11.77, lng: 125.02 },
      { name: 'Poblacion 3', lat: 11.77, lng: 125.02 },
      { name: 'Poblacion 4', lat: 11.77, lng: 125.02 },
      { name: 'Poblacion 5', lat: 11.77, lng: 125.02 },
      { name: 'Poblacion 6', lat: 11.77, lng: 125.02 },
      { name: 'Salay', lat: 11.78, lng: 125.07 },
      { name: 'San Isidro', lat: 11.70, lng: 125.06 },
      { name: 'Santo Niño', lat: 11.69, lng: 125.07 },
      { name: 'Sulopan', lat: 11.68, lng: 125.08 },
      { name: 'Tabucan', lat: 11.67, lng: 125.09 },
      { name: 'Tapul', lat: 11.66, lng: 125.10 },
      { name: 'Tenani', lat: 11.65, lng: 125.11 },
      { name: 'Tigbawon', lat: 11.76, lng: 125.00 },
      { name: 'Tula', lat: 11.64, lng: 125.12 },
      { name: 'Tutubigan', lat: 11.63, lng: 125.13 },
    ] },
    { name: 'Pinabacdao', lat: 11.6167, lng: 124.9833, barangays: ['Bangon', 'Barangay I', 'Barangay II', 'Botoc', 'Bugho', 'Calampong', 'Canlobo', 'Catigawan', 'Dolores', 'Lale', 'Lawaan', 'Laygayon', 'Layo', 'Loctob', 'Madalunot', 'Magdawat', 'Mambog', 'Manaing', 'Nabong', 'Obayan', 'Pahug', 'Parasanon', 'Pelaon', 'San Isidro'] },
    { name: 'San Jorge', lat: 11.3000, lng: 125.0833, barangays: ['Anquiana', 'Aurora', 'Bay-ang', 'Blanca Aurora', 'Buenavista I', 'Buenavista II', 'Bulao', 'Bungliw', 'Cabugao', 'Cag-olo-olo', 'Calundan', 'Cantaguic', 'Canyaki', 'Cogtoto-og', 'Erenas', 'Gayondato', 'Guadalupe', 'Guindapunan', 'Hernandez', 'Himay', 'Janipon', 'La Paz', 'Libertad', 'Lincoro', 'Mabuhay', 'Mancol', 'Matalud', 'Mobo-ob', 'Mombon', 'Puhagan', 'Quezon', 'Ranera', 'Rawis', 'Rosalim', 'San Isidro', 'San Jorge I', 'San Jorge II', 'San Juan', 'Sapinit', 'Sinit-an', 'Tomogbong'] },
    { name: 'San Jose de Buan', lat: 12.0500, lng: 125.0333, barangays: ['Aguingayan', 'Babaclayon', 'Barangay 1', 'Barangay 2', 'Barangay 3', 'Barangay 4', 'Can-aponte', 'Cataydongan', 'Gusa', 'Hagbay', 'Hibaca-an', 'Hiduroma', 'Hilumot', 'San Nicolas'] },
    { name: 'San Sebastian', lat: 11.7000, lng: 125.0167, barangays: ['Balogo', 'Bontod', 'Cabaywa', 'Camanhagay', 'Campiyak', 'Canduyucan', 'Dolores', 'Hita-asan I', 'Hita-asan II', 'Inobongan', 'Poblacion Barangay 1', 'Poblacion Barangay 2', 'Poblacion Barangay 3', 'Poblacion Barangay 4'] },
    { name: 'Santa Margarita', lat: 12.0378, lng: 124.6584, barangays: ['Agrupacion', 'Arapison', 'Avelino', 'Bahay', 'Balud', 'Bana-ao', 'Burabod', 'Cagsumje', 'Cautod (Poblacion)', 'Camperito', 'Campeig', 'Can-ipulan', 'Canmoros', 'Cinco', 'Curry', 'Gajo', 'Hindang', 'Ilo', 'Imelda', 'Inoraguiao', 'Jolacao', 'Lambao', 'Mabuhay', 'Mahayag', 'Matayonas', 'Monbon (Poblacion)', 'Nabulo', 'Napuro I', 'Napuro II', 'Palale', 'Panabatan', 'Panaruan', 'Roxas', 'Salvacion', 'Solsogon', 'Sundara'] },
    { name: 'Santa Rita', lat: 11.4500, lng: 124.9333, barangays: ['Alegria', 'Anibongan', 'Aslum', 'Bagolibas', 'Binanalan', 'Bokinggan Poblacion', 'Bougainvilla Poblacion', 'Cabacungan', 'Cabunga-an', 'Camayse', 'Cansadong', 'Caticugan', 'Dampigan', 'Guinbalot-an', 'Gumamela Poblacion', 'Hinangudtan', 'Igang-igang', 'La Paz', 'Lupig', 'Magsaysay', 'Maligaya', 'New Manunca', 'Old Manunca', 'Pagsulhogon', 'Rosal Poblacion', 'Salvacion', 'San Eduardo', 'San Isidro', 'San Juan', 'San Pascual', 'San Pedro', 'San Roque', 'Santa Elena', 'Santan Poblacion', 'Tagacay', 'Tominamos', 'Tulay', 'Union'] },
    { name: 'Santo Niño', lat: 11.9833, lng: 124.4667, barangays: ['Balatguti', 'Baras', 'Basud', 'Buenavista', 'Cabunga-an', 'Corocawayan', 'Ilijan', 'Ilo', 'Lobelobe', 'Pinanangnan', 'Sevilla', 'Takut', 'Villahermosa'] },
    { name: 'Tagapul-an', lat: 11.9500, lng: 124.8333, barangays: ['Baguiw', 'Balocawe', 'Guinbarucan', 'Labangbaybay', 'Luna', 'Mataluto', 'Nipa', 'Pantalan', 'Pulangbato', 'San Jose', 'San Vicente', 'Suarez', 'Sugod', 'Trinidad'] },
    { name: 'Talalora', lat: 11.5333, lng: 124.8333, barangays: ['Bo. Independencia', 'Malaguining', 'Mallorga', 'Navatas Daku', 'Navatas Guti', 'Placer', 'Poblacion Barangay 1', 'Poblacion Barangay 2', 'San Juan', 'Tatabunan', 'Victory'] },
    { name: 'Tarangnan', lat: 11.9000, lng: 124.7500, barangays: ['Alcazar', 'Awang', 'Bahay', 'Balonga-as', 'Balugo', 'Bangon Gote', 'Baras', 'Binalayan', 'Bisitahan', 'Bonga', 'Cabunga-an', 'Cagtutulo', 'Cambatutay Nuevo', 'Cambatutay Viejo', 'Canunghan', 'Catan-agan', 'Dapdap', 'Gallego', 'Imelda Poblacion', 'Lahong', 'Libucan Dacu', 'Libucan Gote', 'Lucerdoni', 'Majacob', 'Mancares', 'Marabut', 'Oeste-A', 'Oeste-B', 'Pajo', 'Palencia', 'Poblacion A', 'Poblacion B', 'Poblacion C', 'Poblacion D', 'Poblacion E', 'San Vicente', 'Santa Cruz', 'Sugod', 'Talinga', 'Tigdaranao', 'Tizon'] },
    { name: 'Villareal', lat: 11.5667, lng: 124.9333, barangays: ['Banquil', 'Bino-ongan', 'Burabod', 'Cambaguio', 'Canmucat', 'Central', 'Conant', 'Guintarcan', 'Himyangan', 'Igot', 'Inarumbacan', 'Inasudlan', 'Lam-awan', 'Lamingao', 'Lawa-an', 'Macopa', 'Mahayag', 'Malonoy', 'Mercado', 'Miramar', 'Nagcaduha', 'Pacao', 'Pacoyoy', 'Pangpang', 'Patag', 'Plaridel', 'Polangi', 'San Andres', 'San Fernando', 'San Rafael', 'San Roque', 'Santa Rosa', 'Santo Niño', 'Soledad', 'Tayud', 'Tomabe', 'Ulayan', 'Villarosa Poblacion'] },
    { name: 'Zumarraga', lat: 11.6333, lng: 124.8500, barangays: ['Alegria', 'Arteche', 'Bioso', 'Boblaran', 'Botaera', 'Buntay', 'Camayse', 'Canwarak', 'Ibarra', 'Lumalantang', 'Macalunod', 'Maga-an', 'Maputi', 'Marapilit', 'Monbon', 'Mualbual', 'Pangdan', 'Poblacion 1', 'Poblacion 2', 'Poro', 'San Isidro', 'Sugod', 'Talab', 'Tinaugan', 'Tubigan'] }
  ];
  // Prefer shared data if available
  if (Array.isArray(window.SAMELCO_MUNICIPALITIES) && window.SAMELCO_MUNICIPALITIES.length) {
    municipalities = window.SAMELCO_MUNICIPALITIES;
  }
  // Hide the offshore marker at 11.9833, 124.4667.
  municipalities = municipalities.filter(function(m) {
    return !(Number(m.lat) === 11.9833 && Number(m.lng) === 124.4667);
  });

  // create sidebar list
  var sidebarList = document.getElementById('municipalities-sidebar-list');
  if (sidebarList) {
    municipalities.forEach(function(m) {
      var item = document.createElement('div');
      item.className = 'sidebar-municipality-item';
      var barangayCount = Array.isArray(m.barangays) ? m.barangays.length : m.barangays;
      var header = document.createElement('div');
      header.innerHTML = '<h4>' + m.name + '</h4><p>' + barangayCount + ' Barangays</p>';
      item.appendChild(header);
      var bList = document.createElement('div');
      bList.className = 'sidebar-barangays';
      bList.style.display = 'none';
      if (Array.isArray(m.barangays)) {
        m.barangays.forEach(function(b) {
          var bItem = document.createElement('div');
          bItem.className = 'barangay-item-sidebar';
          var bName = typeof b === 'object' && b.name ? b.name : b;
          bItem.textContent = bName;
          bList.appendChild(bItem);
        });
      }
      item.appendChild(bList);
      item.addEventListener('click', function() {
        bList.style.display = (bList.style.display === 'none') ? 'block' : 'none';
        if (window.map) window.map.setView([m.lat, m.lng], 11);
      });
      sidebarList.appendChild(item);
    });
  }

  var mapEl = document.getElementById('map');
  if (mapEl) {
    var map = L.map('map', {
      center: [11.7, 124.9],
      zoom: 10,
      minZoom: 9,
      maxZoom: 13,
      zoomControl: true,
      scrollWheelZoom: true,
      maxBounds: [[10.5, 124.0], [12.5, 125.5]]
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors © CARTO',
      subdomains: 'abcd',
      maxZoom: 18
    }).addTo(map);
    var customIcon = L.divIcon({
      className: 'custom-marker',
      html: '<div class="marker-pin"></div>',
      iconSize: [30, 42],
      iconAnchor: [15, 42]
    });

    // --- Map Labels ---
    var municipalityLabelLayer = L.layerGroup();
    var barangayLabelLayer = L.layerGroup();

    function updateMapLabels() {
      var zoom = map.getZoom();
      
      // Toggle Municipality Labels (Visible at zoom 10 and above)
      if (zoom >= 10) {
        if (!map.hasLayer(municipalityLabelLayer)) municipalityLabelLayer.addTo(map);
      } else {
        if (map.hasLayer(municipalityLabelLayer)) map.removeLayer(municipalityLabelLayer);
      }

      // Toggle Barangay Labels (Visible at zoom 12 and above)
      if (zoom >= 12) {
        if (!map.hasLayer(barangayLabelLayer)) barangayLabelLayer.addTo(map);
      } else {
        if (map.hasLayer(barangayLabelLayer)) map.removeLayer(barangayLabelLayer);
      }
    }

    function initMunicipalityLabels() {
      if (!window.SAMELCO_MUNICIPALITIES) return;
      window.SAMELCO_MUNICIPALITIES.forEach(function(m) {
        if (!m.lat || !m.lng) return;
        L.marker([m.lat, m.lng], {
          icon: L.divIcon({
          className: 'map-label municipality-label',
          html: '<span>' + m.name + '</span>',
          iconSize: [160, 24],
          iconAnchor: [80, 12]
        }),
          interactive: false,
          pane: 'markerPane'
        }).addTo(municipalityLabelLayer);
      });
    }

    map.on('zoomend', updateMapLabels);
    initMunicipalityLabels();

    municipalities.forEach(function(m) {
      L.marker([m.lat, m.lng], { icon: customIcon }).addTo(map);
    });

    // Render Coverage GeoJSON if available
    if (window.SAMELCO_COVERAGE_GEOJSON) {
      L.geoJSON(window.SAMELCO_COVERAGE_GEOJSON, {
        style: function(feature) {
          return {
            color: '#8b2a2a',
            weight: 1.5,
            opacity: 0.6,
            fillColor: '#8b2a2a',
            fillOpacity: 0.05
          };
        },
        onEachFeature: function(feature, layer) {
          if (feature.properties) {
            var props = feature.properties;
            var popupContent = '<div class="map-popup-content">' +
              '<h4 style="margin:0 0 8px; color:#8b2a2a; border-bottom:1px solid #eee; padding-bottom:4px;">' + (props.NAME_3 || 'Unknown Barangay') + '</h4>' +
              '<p style="margin:4px 0;"><strong>Municipality:</strong> ' + (props.NAME_2 || 'N/A') + '</p>' +
              '</div>';
            layer.bindPopup(popupContent);
            
            layer.on({
              mouseover: function(e) {
                var l = e.target;
                l.setStyle({
                  weight: 3,
                  opacity: 1,
                  fillOpacity: 0.2
                });
              },
              mouseout: function(e) {
                var l = e.target;
                l.setStyle({
                  weight: 1.5,
                  opacity: 0.6,
                  fillOpacity: 0.05
                });
              }
            });

            // Add barangay label to the barangayLabelLayer
            if (props.NAME_3) {
              var bounds = layer.getBounds();
              if (bounds.isValid()) {
                var center = bounds.getCenter();
                L.marker(center, {
                  icon: L.divIcon({
                  className: 'map-label barangay-label',
                  html: '<span>' + props.NAME_3 + '</span>',
                  iconSize: [120, 18],
                  iconAnchor: [60, 9]
                }),
                  interactive: false,
                  pane: 'markerPane'
                }).addTo(barangayLabelLayer);
              }
            }
          }
        }
      }).addTo(map);
    }

    // Initial update of labels
    updateMapLabels();

    var group = new L.featureGroup(map._layers);
    map.fitBounds(group.getBounds().pad(0.1));
    window.map = map;
  }

  // Modal functionality for branches and municipalities
  var branchesCard = document.getElementById('branches-card');
  var municipalitiesCard = document.getElementById('municipalities-card');
  var branchesModal = document.getElementById('branches-modal');
  var municipalitiesModal = document.getElementById('municipalities-modal');
  var closeBranches = document.getElementById('close-branches');
  var closeMunicipalities = document.getElementById('close-municipalities');

  if (branchesCard && branchesModal) {
    branchesCard.addEventListener('click', function() {
      branchesModal.style.display = 'block';
    });
  }

  if (municipalitiesCard && municipalitiesModal) {
    municipalitiesCard.addEventListener('click', function() {
      municipalitiesModal.style.display = 'block';
    });
  }

  if (closeBranches && branchesModal) {
    closeBranches.addEventListener('click', function() {
      branchesModal.style.display = 'none';
    });
  }

  if (closeMunicipalities && municipalitiesModal) {
    closeMunicipalities.addEventListener('click', function() {
      municipalitiesModal.style.display = 'none';
    });
  }

  // Close modals when clicking outside
  window.addEventListener('click', function(event) {
    if (event.target === branchesModal) {
      branchesModal.style.display = 'none';
    }
    if (event.target === municipalitiesModal) {
      municipalitiesModal.style.display = 'none';
    }
  });
});
