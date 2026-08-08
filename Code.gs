/**
 * ==========================================================================
 * BACKEND GOOGLE SHEETS — Stock, Fournisseurs, Clients & Alertes WhatsApp
 * ==========================================================================
 * INSTALLATION :
 * 1. Crée un nouveau Google Sheet (sheets.new).
 * 2. Dans ce Sheet, crée 9 onglets nommés EXACTEMENT :
 *      Produits | Fournisseurs | Clients | Commandes | Depenses | Utilisateurs | LogsWhatsApp | LogsAudit | Reglages
 *    (Le script crée automatiquement les en-têtes au premier appel,
 *    pas besoin de les taper à la main.)
 * 3. Menu Extensions > Apps Script. Supprime le contenu par défaut et colle
 *    tout ce fichier.
 * 4. Clique sur "Déployer" > "Nouveau déploiement".
 *    - Type : Application Web
 *    - Exécuter en tant que : Moi
 *    - Qui a accès : Tout le monde
 * 5. Autorise les permissions demandées, puis copie l'URL "/exec" fournie.
 * 6. Colle cette URL dans l'appli, onglet Réglages > "URL Google Apps Script".
 *
 * DOCUMENTS (Google Drive) : ce script accède à Google Drive pour permettre
 * à la page "Documents" de parcourir un dossier, consulter/télécharger ses
 * fichiers, et d'y AJOUTER des fichiers depuis l'appli. Comme le déploiement
 * s'exécute "en tant que Moi", TOUS les utilisateurs de l'appli (y compris
 * les Agents, qui n'ont pas de compte Google) peuvent lire et ajouter des
 * fichiers via ce script, sans avoir besoin d'accès Drive personnel.
 * -> Lors du premier déploiement après cette mise à jour, Google demandera
 *    une NOUVELLE autorisation (accès à Google Drive) : c'est normal,
 *    accepte la demande avec le même compte propriétaire du script.
 * -> Dans l'appli, va dans Réglages > "Dossier Google Drive" et colle le
 *    lien (ou l'ID) du dossier à afficher dans la page Documents. Le compte
 *    propriétaire du script doit avoir accès à ce dossier.
 * -> Cette intégration reste volontairement LIMITÉE À LA LECTURE + L'AJOUT :
 *    aucune fonction de suppression, de renommage ou de modification de
 *    fichiers/dossiers Drive existants n'est présente dans ce script.
 *
 * TAUX DE CHANGE PAR COMMANDE : la colonne 'exchangeRate' a été ajoutée aux
 * commandes. Chaque commande enregistre désormais le taux de change en
 * vigueur au moment de sa création, pour que les commandes déjà passées ne
 * soient jamais affectées rétroactivement par un changement de taux dans
 * Réglages.
 *
 * SÉCURITÉ DES MOTS DE PASSE (v18, côté appli) : les mots de passe stockés
 * dans l'onglet "Utilisateurs" ne sont plus en clair. L'appli les hache
 * (SHA-256) avant de les enregistrer/synchroniser. Ce script n'a rien à
 * faire de particulier pour ça : il continue de lire/écrire la colonne
 * "password" telle quelle, elle contient simplement une empreinte au lieu
 * du mot de passe en clair.
 *
 * JOURNAL D'AUDIT (v18) : nouvel onglet "LogsAudit" qui trace les
 * modifications et suppressions de produits et de commandes (date,
 * utilisateur, action, entité concernée). Ce journal ne contient jamais de
 * mot de passe ni d'action liée à la gestion des utilisateurs.
 *
 * HISTORIQUE DES PAIEMENTS (v19) : nouvelle colonne 'paymentHistory' sur les
 * commandes, qui enregistre chaque versement (date + montant) reçu sur une
 * commande. Stockée en JSON dans la feuille, comme la colonne 'items',
 * décodée/encodée automatiquement par ce script.
 * ==========================================================================
 */

const SHEETS = {
  products: { name: 'Produits', cols: ['id', 'ref', 'name', 'category', 'priceBuy', 'priceSell', 'qty', 'minQty', 'supplierId', 'lastUpdated', 'createdAt', 'supplierAmountPaid', 'supplierPaidDate', 'regularisePar', 'createdBy', 'updatedBy'] },
  suppliers: { name: 'Fournisseurs', cols: ['id', 'name', 'phone', 'notes'] },
  clients: { name: 'Clients', cols: ['id', 'nom', 'prenom', 'lieu', 'phone', 'notes', 'createdAt'] },
  orders: { name: 'Commandes', cols: ['id', 'clientId', 'clientName', 'beneficiaryNom', 'beneficiaryPrenom', 'items', 'total', 'amountPaid', 'status', 'paymentMethod', 'date', 'createdAt', 'createdBy', 'updatedBy', 'exchangeRate', 'paymentHistory'] },
  expenses: { name: 'Depenses', cols: ['id', 'kind', 'category', 'productId', 'productName', 'cause', 'qty', 'newPrice', 'amount', 'note', 'date', 'createdAt', 'createdBy'] },
  users: { name: 'Utilisateurs', cols: ['id', 'username', 'password', 'role', 'createdAt'] },
  waLogs: { name: 'LogsWhatsApp', cols: ['id', 'timestamp', 'type', 'recipient', 'message'] },
  auditLogs: { name: 'LogsAudit', cols: ['id', 'timestamp', 'username', 'entityType', 'entityId', 'entityLabel', 'action', 'details'] },
  settings: { name: 'Reglages', cols: ['key', 'value'] }
};

function doGet(e) {
  try {
    const action = e && e.parameter && e.parameter.action;

    if (action === 'listDriveFolder') {
      return jsonResponse(listDriveFolder_(e.parameter.folderId));
    }

    if (action === 'downloadDriveFile') {
      return jsonResponse(getDriveFileAsBase64_(e.parameter.fileId));
    }

    return jsonResponse({ success: true, data: getAllData() });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);

    if (body.action === 'saveAll') {
      saveAllData(body.data);
      return jsonResponse({ success: true });
    }

    if (body.action === 'uploadDriveFile') {
      return jsonResponse(uploadDriveFile_(body.folderId, body.fileName, body.mimeType, body.base64Data));
    }

    return jsonResponse({ success: false, error: 'Action inconnue: ' + body.action });
  } catch (err) {
    return jsonResponse({ success: false, error: err.message });
  }
}

// Permet au navigateur de faire une requête "simple" (pas de préflight CORS)
function doOptions(e) {
  return ContentService.createTextOutput('');
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function getSheet_(key) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const cfg = SHEETS[key];
  let sh = ss.getSheetByName(cfg.name);
  if (!sh) sh = ss.insertSheet(cfg.name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cfg.cols.length).setValues([cfg.cols]);
  }
  return sh;
}

function sheetToObjects_(key) {
  const cfg = SHEETS[key];
  const sh = getSheet_(key);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const values = sh.getRange(2, 1, lastRow - 1, cfg.cols.length).getValues();
  return values
    .filter(row => row.some(cell => cell !== '' && cell !== null))
    .map(row => {
      const obj = {};
      cfg.cols.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
}

function objectsToSheet_(key, items) {
  const cfg = SHEETS[key];
  const sh = getSheet_(key);
  const lastRow = sh.getLastRow();
  if (lastRow > 1) {
    sh.getRange(2, 1, lastRow - 1, cfg.cols.length).clearContent();
  }
  if (!items || items.length === 0) return;
  const rows = items.map(item => cfg.cols.map(col => (item[col] !== undefined ? item[col] : '')));
  sh.getRange(2, 1, rows.length, cfg.cols.length).setValues(rows);
}

function getAllData() {
  const settingsRows = sheetToObjects_('settings'); // list of {key, value}
  const settings = {};
  settingsRows.forEach(row => {
    let val = row.value;
    if (val === 'true') val = true;
    else if (val === 'false') val = false;
    settings[row.key] = val;
  });

  const orders = sheetToObjects_('orders').map(o => {
    let items = [];
    try { items = JSON.parse(o.items || '[]'); } catch (err) { items = []; }
    let paymentHistory = [];
    try { paymentHistory = JSON.parse(o.paymentHistory || '[]'); } catch (err) { paymentHistory = []; }
    return Object.assign({}, o, { items: items, paymentHistory: paymentHistory, total: Number(o.total) || 0, amountPaid: Number(o.amountPaid) || 0 });
  });

  const expenses = sheetToObjects_('expenses').map(e => Object.assign({}, e, { qty: Number(e.qty) || 0, amount: Number(e.amount) || 0 }));

  return {
    products: sheetToObjects_('products'),
    suppliers: sheetToObjects_('suppliers'),
    clients: sheetToObjects_('clients'),
    orders: orders,
    expenses: expenses,
    users: sheetToObjects_('users'),
    waLogs: sheetToObjects_('waLogs'),
    auditLogs: sheetToObjects_('auditLogs'),
    settings: settings
  };
}

function saveAllData(data) {
  if (data.products) objectsToSheet_('products', data.products);
  if (data.suppliers) objectsToSheet_('suppliers', data.suppliers);
  if (data.clients) objectsToSheet_('clients', data.clients);
  if (data.orders) {
    const ordersForSheet = data.orders.map(o => Object.assign({}, o, {
      items: JSON.stringify(o.items || []),
      paymentHistory: JSON.stringify(o.paymentHistory || [])
    }));
    objectsToSheet_('orders', ordersForSheet);
  }
  if (data.expenses) objectsToSheet_('expenses', data.expenses);
  if (data.users) objectsToSheet_('users', data.users);
  if (data.waLogs) objectsToSheet_('waLogs', data.waLogs);
  if (data.auditLogs) objectsToSheet_('auditLogs', data.auditLogs);
  if (data.settings) {
    const settingsArr = Object.keys(data.settings).map(k => ({ key: k, value: data.settings[k] }));
    objectsToSheet_('settings', settingsArr);
  }
}

// ==========================================================================
// DOCUMENTS (Google Drive) — lecture + ajout de fichiers uniquement
// ==========================================================================
// Ces fonctions permettent de LISTER le contenu d'un dossier, de LIRE/SERVIR
// le contenu d'un fichier, et d'AJOUTER un nouveau fichier dans un dossier.
// Aucune fonction de suppression, de renommage, de déplacement ou de
// modification d'un fichier/dossier EXISTANT n'est fournie ici — c'est
// volontaire, pour garantir que la page Documents ne peut jamais altérer ou
// supprimer ce qui existe déjà sur le Drive, quel que soit le profil de
// l'utilisateur connecté.

function getSettingValue_(key) {
  const rows = sheetToObjects_('settings');
  const row = rows.find(r => r.key === key);
  return row ? row.value : '';
}

// Accepte soit un ID de dossier Drive brut, soit une URL Google Drive
// complète (https://drive.google.com/drive/folders/XXXX...), et en extrait l'ID.
function extractDriveId_(input) {
  if (!input) return '';
  const s = String(input).trim();
  const m = s.match(/[-\w]{20,}/);
  return m ? m[0] : s;
}

function listDriveFolder_(folderIdOrUrlParam) {
  const rootSetting = getSettingValue_('driveFolderId');
  const targetId = extractDriveId_(folderIdOrUrlParam || rootSetting);

  if (!targetId) {
    return { success: false, error: "Aucun dossier Google Drive n'est configuré. Renseignez-le dans Réglages." };
  }

  let folder;
  try {
    folder = DriveApp.getFolderById(targetId);
  } catch (err) {
    return { success: false, error: "Dossier Google Drive introuvable ou inaccessible (vérifiez l'ID/le lien, et que le compte propriétaire du script y a accès)." };
  }

  const folders = [];
  const subIt = folder.getFolders();
  while (subIt.hasNext()) {
    const f = subIt.next();
    folders.push({ id: f.getId(), name: f.getName() });
  }
  folders.sort(function (a, b) { return a.name.localeCompare(b.name); });

  const files = [];
  const fileIt = folder.getFiles();
  while (fileIt.hasNext()) {
    const file = fileIt.next();
    files.push({
      id: file.getId(),
      name: file.getName(),
      mimeType: file.getMimeType(),
      size: file.getSize(),
      lastUpdated: file.getLastUpdated().toISOString()
    });
  }
  files.sort(function (a, b) { return a.name.localeCompare(b.name); });

  return {
    success: true,
    folder: { id: folder.getId(), name: folder.getName() },
    folders: folders,
    files: files
  };
}

// Renvoie le contenu d'un fichier Drive encodé en base64, dans une réponse JSON
// classique (un Blob brut renvoyé par doGet provoque une redirection vers un
// domaine googleusercontent.com qui casse le fetch() cross-origin côté appli).
function getDriveFileAsBase64_(fileId) {
  if (!fileId) {
    return { success: false, error: 'Identifiant de fichier manquant.' };
  }
  try {
    const file = DriveApp.getFileById(fileId);
    const blob = file.getBlob();
    return {
      success: true,
      name: file.getName(),
      mimeType: blob.getContentType(),
      base64Data: Utilities.base64Encode(blob.getBytes())
    };
  } catch (err) {
    return { success: false, error: "Fichier introuvable ou inaccessible : " + err.message };
  }
}

// Ajoute un nouveau fichier dans le dossier Drive indiqué (à partir de son contenu
// encodé en base64, envoyé par la page Documents). C'est la SEULE opération
// d'écriture Drive exposée par ce script : elle crée un nouveau fichier, elle ne
// touche jamais à un fichier ou dossier existant.
function uploadDriveFile_(folderIdParam, fileName, mimeType, base64Data) {
  const rootSetting = getSettingValue_('driveFolderId');
  const targetId = extractDriveId_(folderIdParam || rootSetting);

  if (!targetId) {
    return { success: false, error: "Aucun dossier Google Drive n'est configuré. Renseignez-le dans Réglages." };
  }
  if (!base64Data) {
    return { success: false, error: 'Aucun contenu de fichier reçu.' };
  }

  let folder;
  try {
    folder = DriveApp.getFolderById(targetId);
  } catch (err) {
    return { success: false, error: "Dossier Google Drive introuvable ou inaccessible (vérifiez l'ID/le lien, et que le compte propriétaire du script y a accès)." };
  }

  try {
    const decoded = Utilities.base64Decode(base64Data);
    const blob = Utilities.newBlob(decoded, mimeType || 'application/octet-stream', fileName || 'fichier');
    const file = folder.createFile(blob);
    return {
      success: true,
      file: {
        id: file.getId(),
        name: file.getName(),
        mimeType: file.getMimeType(),
        size: file.getSize(),
        lastUpdated: file.getLastUpdated().toISOString()
      }
    };
  } catch (err) {
    return { success: false, error: "Échec de l'envoi du fichier : " + err.message };
  }
}
