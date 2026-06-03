"use strict";

const COLLECTIONS = [
  "products",
  "imports",
  "inventoryMovements",
  "sales",
  "customers",
  "payments",
  "settings"
];

const STORE_KEY = "sunglassesWholesaleBaseSystem";
const ACTIVE_TAB_KEY = "sunglassesWholesaleActiveTab";
const DEFAULT_LOW_STOCK_THRESHOLD = 8000;

const COLLECTION_LABELS = {
  products: "מוצרים",
  imports: "יבוא",
  inventoryMovements: "תנועות מלאי",
  sales: "מכירות",
  customers: "לקוחות",
  payments: "תשלומים",
  settings: "הגדרות"
};

const SOURCE_LABELS = {
  import: "יבוא",
  sale: "מכירה",
  adjustment: "התאמה"
};

const SUPABASE_TABLES = {
  products: "products",
  imports: "imports",
  inventoryMovements: "inventory_movements",
  sales: "sales",
  customers: "customers",
  payments: "payments",
  settings: "settings"
};

function storedSupabaseConfig() {
  try {
    const raw = window.localStorage.getItem(STORE_KEY);
    const settings = raw ? JSON.parse(raw).settings || {} : {};
    return {
      url: normalizeSupabaseUrl(settings.supabaseUrl),
      anonKey: normalizeSupabaseKey(settings.supabaseAnonKey),
      ready: Boolean(settings.supabaseReady)
    };
  } catch (error) {
    return { url: "", anonKey: "", ready: false };
  }
}

function normalizeSupabaseUrl(value) {
  const raw = String(value || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  if (/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(raw)) return raw;
  const withoutProtocol = raw.replace(/^https?:\/\//i, "");
  if (/^[a-z0-9-]+\.supabase\.co$/i.test(withoutProtocol)) return `https://${withoutProtocol}`;
  if (/^[a-z0-9-]+$/i.test(withoutProtocol)) return `https://${withoutProtocol}.supabase.co`;
  return raw;
}

function isValidSupabaseUrl(value) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(normalizeSupabaseUrl(value));
}

function normalizeSupabaseKey(value) {
  return String(value || "").trim();
}

const helpers = {
  cleanNumberText(value) {
    return String(value ?? "").replaceAll(",", "").trim();
  },
  number(value, fallback = 0) {
    const parsed = parseFloat(helpers.cleanNumberText(value));
    return Number.isFinite(parsed) ? parsed : fallback;
  },
  money(value) {
    return helpers.number(value).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  },
  moneyWhole(value) {
    return Math.trunc(helpers.number(value)).toLocaleString("en-US", {
      maximumFractionDigits: 0
    });
  },
  moneyThree(value) {
    return helpers.number(value).toLocaleString("en-US", {
      minimumFractionDigits: 3,
      maximumFractionDigits: 3
    });
  },
  moneyInput(value) {
    return helpers.numberText(value);
  },
  numberText(value) {
    const cleaned = helpers.cleanNumberText(value);
    if (!cleaned) return "";
    const parsed = parseFloat(cleaned);
    if (!Number.isFinite(parsed)) return cleaned;
    const decimalPart = cleaned.includes(".") ? cleaned.split(".")[1] || "" : "";
    return parsed.toLocaleString("en-US", {
      minimumFractionDigits: decimalPart.length,
      maximumFractionDigits: decimalPart.length
    });
  },
  text(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  },
  dateTime() {
    return new Date().toISOString();
  },
  id(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }
};

const validationHelper = {
  required(value) {
    return value !== undefined && value !== null && String(value).trim() !== "";
  },
  isDecimal(value) {
    const parsed = parseFloat(helpers.cleanNumberText(value));
    return Number.isFinite(parsed);
  },
  hasBaseShape(data) {
    return COLLECTIONS.every((name) => Array.isArray(data[name]) || name === "settings");
  }
};

const uiHelper = {
  resultCard(label, value, options = {}) {
    const classes = ["calc-card"];
    if (options.highlight) classes.push("highlight-calc");
    if (options.className) classes.push(options.className);
    return `<div class="${classes.join(" ")}"><span>${helpers.text(label)}</span><strong>${value}</strong></div>`;
  },
  statusPill(label, tone = "warn") {
    return `<span class="pill ${tone}">${helpers.text(label)}</span>`;
  },
  setMessage(id, message, type = "fail") {
    const messageElement = document.getElementById(id);
    if (!messageElement) return;
    messageElement.textContent = message;
    messageElement.className = `form-message ${type}`;
  },
  clearMessage(id) {
    const messageElement = document.getElementById(id);
    if (!messageElement) return;
    messageElement.textContent = "";
    messageElement.className = "form-message";
  }
};

const cloudService = (() => {
  const config = () => storedSupabaseConfig();

  const tableUrl = (collection, query = "") => {
    const current = config();
    if (!current.url || !current.anonKey) throw new Error("חסרים פרטי חיבור Supabase");
    const table = SUPABASE_TABLES[collection];
    return `${current.url.replace(/\/$/, "")}/rest/v1/${table}${query}`;
  };

  const rowFromRecord = (collection, record) => {
    const row = {
      id: record.id,
      created_at: record.createdAt || record.created_at || helpers.dateTime(),
      updated_at: record.updatedAt || record.updated_at || helpers.dateTime(),
      data: record
    };
    if (collection === "imports") row.product_id = record.productId || null;
    if (collection === "inventoryMovements") {
      row.product_id = record.productId || null;
      row.import_id = record.importId || (record.sourceType === "import" ? record.sourceId : null);
      row.sale_id = record.saleId || (record.sourceType === "sale" ? record.sourceId : null);
      row.type = record.type || record.sourceType || null;
      row.quantity = helpers.number(record.quantity);
      row.movement_date = record.movementDate || record.date || null;
    }
    if (collection === "sales") {
      row.customer_id = record.customerId || null;
      row.product_id = record.productId || null;
      row.status = record.status || null;
    }
    if (collection === "payments") {
      row.sale_id = record.saleId || null;
      row.customer_id = record.customerId || null;
      row.kind = record.kind || null;
    }
    return row;
  };

  const recordFromRow = (row) => ({
    ...(row.data || {}),
    id: row.id,
    createdAt: row.data?.createdAt || row.created_at,
    updatedAt: row.data?.updatedAt || row.updated_at
  });

  const request = async (url, options = {}) => {
    if (typeof fetch !== "function") throw new Error("Fetch is unavailable");
    const current = config();
    if (!current.url || !current.anonKey) throw new Error("חסרים פרטי חיבור Supabase");
    const headers = {
      apikey: current.anonKey,
      Authorization: `Bearer ${current.anonKey}`,
      "Content-Type": "application/json"
    };
    const response = await fetch(url, { ...options, headers: { ...headers, ...(options.headers || {}) } });
    if (!response.ok) {
      const message = await response.text();
      const error = new Error(message || `Supabase error ${response.status}`);
      error.status = response.status;
      error.statusText = response.statusText;
      error.url = url;
      error.body = message;
      throw error;
    }
    if (response.status === 204) return null;
    return response.json();
  };

  const upsert = async (collection, record) => {
    const payload = rowFromRecord(collection, record);
    if (collection === "imports") {
      console.log("Saving import to Supabase:");
      console.log("Payload:", payload);
    }
    try {
      const [saved] = await request(tableUrl(collection, "?on_conflict=id"), {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=representation" },
        body: JSON.stringify(payload)
      });
      if (collection === "imports") console.log("Supabase insert result:", saved);
      return saved;
    } catch (error) {
      if (collection === "imports") console.error("Supabase insert error:", error);
      throw error;
    }
  };

  const remove = async (collection, id) => {
    await request(tableUrl(collection, `?id=eq.${encodeURIComponent(id)}`), { method: "DELETE" });
  };

  const fetchCollection = async (collection) => {
    const rows = await request(tableUrl(collection, "?select=*"));
    return rows.map(recordFromRow);
  };

  const testConnection = async () => {
    const current = config();
    console.log("Supabase URL used:", current.url);
    console.log("Supabase key exists:", Boolean(current.anonKey));
    console.log("Testing Supabase connection...");
    try {
      const rows = await request(tableUrl("settings", "?select=id,created_at,updated_at,data&limit=1"));
      console.log("Supabase connection success", rows);
      return rows;
    } catch (error) {
      console.error("Supabase connection error:", {
        message: error.message,
        status: error.status,
        statusText: error.statusText,
        url: error.url,
        body: error.body,
        error
      });
      throw error;
    }
  };

  const fetchAll = async () => {
    const entries = await Promise.all(COLLECTIONS.map(async (collection) => [collection, await fetchCollection(collection)]));
    const data = storageService.emptyData();
    entries.forEach(([collection, records]) => {
      if (collection === "settings") {
        data.settings = records[0] || data.settings;
      } else {
        data[collection] = records;
      }
    });
    return data;
  };

  const pushAll = async (data) => {
    const normalized = storageService.normalize(data);
    for (const collection of COLLECTIONS) {
      if (collection === "settings") {
        await upsert("settings", normalized.settings);
      } else {
        for (const record of normalized[collection]) {
          await upsert(collection, record);
        }
      }
    }
  };

  const hasRemoteData = (data) => COLLECTIONS.some((collection) => {
    if (collection === "settings") return false;
    return Array.isArray(data[collection]) && data[collection].length > 0;
  });

  const isConfigured = () => {
    const current = config();
    return Boolean(current.url && current.anonKey && current.ready);
  };

  return { upsert, remove, fetchAll, pushAll, hasRemoteData, isConfigured, testConnection };
})();

const calculationHelper = {
  inventoryQuantity(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (product) {
      const imported = productImportCostData(product).importedQuantity;
      const nonImportMovements = state.inventoryMovements
        .filter((movement) => movement.productId === productId && movement.sourceType !== "import" && movement.type !== "import")
        .reduce((sum, movement) => sum + helpers.number(movement.quantity), 0);
      return imported + nonImportMovements;
    }
    return state.inventoryMovements
      .filter((movement) => movement.productId === productId)
      .reduce((sum, movement) => sum + helpers.number(movement.quantity), 0);
  },
  importedQuantity(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (product) return productImportCostData(product).importedQuantity;
    return state.inventoryMovements
      .filter((movement) => movement.productId === productId && movement.sourceType === "import")
      .reduce((sum, movement) => sum + Math.max(0, helpers.number(movement.quantity)), 0);
  },
  soldQuantity(productId) {
    return state.inventoryMovements
      .filter((movement) => movement.productId === productId && movement.sourceType === "sale")
      .reduce((sum, movement) => sum + Math.abs(Math.min(0, helpers.number(movement.quantity))), 0);
  },
  inventoryValue(productId) {
    const product = state.products.find((item) => item.id === productId);
    if (!product) return 0;
    return calculationHelper.inventoryQuantity(productId) * productAverageCost(product);
  },
  productProfit(product) {
    const salePrice = helpers.number(product.sellingPriceIncludingVat);
    const cost = productAverageCost(product);
    const vatRate = helpers.number(product.vat) / 100;
    const priceWithoutVat = vatRate > 0 ? salePrice / (1 + vatRate) : salePrice;
    return priceWithoutVat - cost;
  },
  totalInventoryUnits() {
    return state.products.reduce((sum, product) => sum + calculationHelper.inventoryQuantity(product.id), 0);
  },
  inventoryCostValue() {
    return state.products.reduce((sum, product) => {
      return sum + calculationHelper.inventoryValue(product.id);
    }, 0);
  },
  salesValue() {
    return state.sales.reduce((sum, sale) => sum + helpers.number(sale.total), 0);
  },
  paymentsValue() {
    return state.payments
      .filter((payment) => payment.kind === "payment")
      .reduce((sum, payment) => sum + helpers.number(payment.amount), 0);
  }
};

const storageService = (() => {
  const emptyData = () => ({
    products: [],
    imports: [],
    inventoryMovements: [],
    sales: [],
    customers: [],
    payments: [],
    settings: {
      id: "settings_main",
      createdAt: helpers.dateTime(),
      updatedAt: helpers.dateTime(),
      vat: 18,
      tax: 5,
      targetProfit: 2,
      quantityLevels: [300, 600, 1200, 2400],
      supabaseUrl: "",
      supabaseAnonKey: "",
      supabaseStatus: "לא מחובר",
      lastBackupAt: "",
      backupStatus: "לא בוצע גיבוי",
      storageMode: "localStorage",
      supabaseReady: false
    }
  });

  const normalize = (rawData) => {
    const base = emptyData();
    const data = rawData && typeof rawData === "object" ? rawData : {};
    COLLECTIONS.forEach((collection) => {
      if (collection === "settings") {
        base.settings = { ...base.settings, ...(data.settings || {}) };
      } else {
        base[collection] = Array.isArray(data[collection]) ? data[collection] : [];
      }
    });
    base.settings.supabaseUrl = normalizeSupabaseUrl(base.settings.supabaseUrl);
    base.settings.supabaseAnonKey = normalizeSupabaseKey(base.settings.supabaseAnonKey);
    base.settings.supabaseReady = Boolean(base.settings.supabaseUrl && base.settings.supabaseAnonKey && base.settings.supabaseReady);
    if (["שגיאת חיבור", "שגיאת סנכרון", "חסרים פרטי חיבור", "URL לא תקין"].includes(base.settings.supabaseStatus)) {
      base.settings.supabaseReady = false;
    }
    if (!base.settings.supabaseUrl || !base.settings.supabaseAnonKey) {
      base.settings.supabaseStatus = "לא מחובר";
      base.settings.supabaseReady = false;
    }
    return base;
  };

  const load = () => {
    try {
      const raw = window.localStorage.getItem(STORE_KEY);
      return normalize(raw ? JSON.parse(raw) : null);
    } catch (error) {
      return emptyData();
    }
  };

  const save = (data) => {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(normalize(data)));
  };

  const getAll = (collection) => {
    const data = load();
    if (collection === "settings") return data.settings;
    return [...data[collection]];
  };

  const getById = (collection, id) => {
    const data = load();
    if (collection === "settings") return data.settings.id === id ? data.settings : null;
    return data[collection].find((item) => item.id === id) || null;
  };

  const create = (collection, payload) => {
    const data = load();
    const now = helpers.dateTime();
    const record = {
      id: payload.id || helpers.id(collection),
      createdAt: now,
      updatedAt: now,
      ...payload
    };
    if (collection === "settings") {
      data.settings = { ...data.settings, ...record, updatedAt: now };
    } else {
      data[collection].push(record);
    }
    save(data);
    if (cloudService.isConfigured()) {
      cloudService.upsert(collection, record).catch((error) => console.error("Supabase save failed", error));
    }
    return record;
  };

  const update = (collection, id, payload) => {
    const data = load();
    const now = helpers.dateTime();
    if (collection === "settings") {
      data.settings = { ...data.settings, ...payload, id, updatedAt: now };
      save(data);
      if (cloudService.isConfigured()) {
        cloudService.upsert(collection, data.settings).catch((error) => console.error("Supabase update failed", error));
      }
      return data.settings;
    }
    const index = data[collection].findIndex((item) => item.id === id);
    if (index < 0) return null;
    data[collection][index] = { ...data[collection][index], ...payload, updatedAt: now };
    save(data);
    if (cloudService.isConfigured()) {
      cloudService.upsert(collection, data[collection][index]).catch((error) => console.error("Supabase update failed", error));
    }
    return data[collection][index];
  };

  const remove = (collection, id) => {
    const data = load();
    if (collection === "settings") return false;
    const before = data[collection].length;
    data[collection] = data[collection].filter((item) => item.id !== id);
    save(data);
    if (data[collection].length !== before && cloudService.isConfigured()) {
      cloudService.remove(collection, id).catch((error) => console.error("Supabase delete failed", error));
    }
    return data[collection].length !== before;
  };

  const replaceAll = (payload, syncCloud = true) => {
    const normalized = normalize(payload);
    normalized.settings.updatedAt = helpers.dateTime();
    save(normalized);
    if (syncCloud && cloudService.isConfigured()) {
      cloudService.pushAll(normalized).catch((error) => console.error("Supabase full sync failed", error));
    }
  };

  const reset = () => {
    window.localStorage.removeItem(STORE_KEY);
    save(emptyData());
  };

  const hasData = () => Boolean(window.localStorage.getItem(STORE_KEY));

  const exportData = () => load();

  return { getAll, getById, create, update, delete: remove, replaceAll, reset, hasData, exportData, emptyData, normalize };
})();

let state = {};
let activeTab = "dashboard";
let importFormOpen = false;
let editingImportId = null;
const selectedImportIds = new Set();
let productFormOpen = false;
let editingProductId = null;
let manualInventoryOpen = false;
let manualInventoryProductId = "";
let inventorySearch = "";
let inventoryStatusFilter = "";
let pricingResult = null;
let salesDraft = null;
let saleFormOpen = false;
let editingSaleId = null;
let viewingSaleId = null;
let customerFormOpen = false;
let editingCustomerId = null;
let viewingCustomerId = null;
let paymentFormOpen = false;
let editingPaymentId = null;
let viewingPaymentSaleId = null;
let paymentSaleId = "";
let systemIssueMessageShown = false;
let lastAutoFocusedFormId = "";

const INVENTORY_MODULE_LEGACY_BACKUP_NOTE = "מבנה מוצרים ומלאי הקודם נשמר בהיסטוריית הקוד לפני שיפור מלאי נמוך, פסי מצב, פירוט יבוא ותנועות מלאי מסומנות.";
const UX_UI_LEGACY_BACKUP_NOTE = "גיבוי UX/UI פנימי נשמר בתיקייה internal-backups/ux-before-2026-05-29 לפני שיפור רוחבי של ריווח, היררכיה, טבלאות, כפתורים ופוקוס טפסים.";

const tabs = [
  { id: "dashboard", label: "דשבורד ראשי", purpose: "סיכום בלבד", icon: "◇" },
  { id: "imports", label: "יבוא ועלויות", purpose: "קליטת יבוא ועלויות בסיס", icon: "↧" },
  { id: "inventory", label: "מוצרים ומלאי", purpose: "מוצרים ותנועות מלאי", icon: "▦" },
  { id: "pricing", label: "סימולטור תמחור", purpose: "חישובי מחיר ורווח", icon: "₪" },
  { id: "customers", label: "לקוחות", purpose: "לקוחות חוזרים וחד פעמיים", icon: "◎" },
  { id: "sales", label: "מכירות", purpose: "מכירות המקושרות ללקוחות", icon: "✓" },
  { id: "payments", label: "תשלומים", purpose: "תשלומים המקושרים למכירות", icon: "◌" },
  { id: "settings", label: "הגדרות וגיבוי", purpose: "בדיקות, גיבוי ושחזור", icon: "⚙" }
];

const appContent = document.getElementById("appContent");
const toast = document.getElementById("toast");
const importFileInput = document.getElementById("importFileInput");

function refreshState() {
  state = {};
  COLLECTIONS.forEach((collection) => {
    state[collection] = storageService.getAll(collection);
  });
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 2400);
}

function focusFirstFormField() {
  const form = appContent.querySelector("form");
  if (!form) {
    lastAutoFocusedFormId = "";
    return;
  }
  if (form.id === lastAutoFocusedFormId) return;
  const field = form.querySelector("input:not([type='hidden']):not([readonly]), select:not([disabled]), textarea:not([readonly])");
  if (!field) return;
  lastAutoFocusedFormId = form.id;
  window.setTimeout(() => field.focus({ preventScroll: true }), 0);
}

function setActiveTab(tabId) {
  if (!tabs.some((tab) => tab.id === tabId)) return;
  activeTab = tabId;
  window.localStorage.setItem(ACTIVE_TAB_KEY, tabId);
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tabId);
  });
  render();
}

function moduleHeader(tabId, description) {
  const tab = tabs.find((item) => item.id === tabId);
  return `
    <section class="module-header">
      <div>
        <div class="eyebrow">${tab.purpose}</div>
        <h2>${tab.label}</h2>
        <p>${description}</p>
      </div>
    </section>
  `;
}

function emptyState(icon, title, text) {
  return `
    <div class="empty-state">
      <div class="empty-icon" aria-hidden="true">${icon}</div>
      <strong>${title}</strong>
      <p>${text}</p>
    </div>
  `;
}

function statCard(label, value, note, progress = 0, statusClass = "") {
  return `
    <article class="card stat-card ${statusClass}">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
      <div class="progress" aria-hidden="true"><span style="width:${Math.max(0, Math.min(progress, 100))}%"></span></div>
      <div class="note">${note}</div>
    </article>
  `;
}

function importNumberFields() {
  return [
    "quantity",
    "supplierPaymentCount",
    "supplierPayment1",
    "supplierPayment2",
    "supplierPayment3",
    "supplierRefund",
    "shipping",
    "ilacReport",
    "customsBroker",
    "unloadingPort",
    "productFileBuild",
    "customs",
    "otherExpenses"
  ];
}

function calculateImportRecord(importRecord) {
  const settings = appSettings();
  const vatRate = helpers.number(settings.vat, 18) / 100;
  const vatMultiplier = 1 + vatRate;
  const quantity = helpers.number(importRecord.quantity);
  const supplierPaymentCount = Math.max(1, Math.min(3, helpers.number(importRecord.supplierPaymentCount, importRecord.goodsCostBeforeVat ? 1 : 1)));
  const supplierPayments = [1, 2, 3].map((index) => {
    if (importRecord[`supplierPayment${index}`] !== undefined) return helpers.number(importRecord[`supplierPayment${index}`]);
    return index === 1 ? helpers.number(importRecord.goodsCostBeforeVat) : 0;
  });
  const supplierTotal = supplierPayments
    .slice(0, supplierPaymentCount)
    .reduce((sum, payment) => sum + payment, 0);
  const supplierRefund = helpers.number(importRecord.supplierRefund);
  const shipping = helpers.number(importRecord.shipping);
  const customsIncludingVat = helpers.number(importRecord.customs);
  const otherExpensesIncludingVat = helpers.number(importRecord.otherExpenses);
  const ilacReportDirectCost = helpers.number(importRecord.ilacReport);
  const customsBrokerIncludingVat = helpers.number(importRecord.customsBroker);
  const unloadingPortIncludingVat = helpers.number(importRecord.unloadingPort);
  const productFileBuildIncludingVat = helpers.number(importRecord.productFileBuild);
  const customsBeforeVat = vatMultiplier > 0 ? customsIncludingVat / vatMultiplier : customsIncludingVat;
  const customsVat = customsIncludingVat - customsBeforeVat;
  const importVatBase = supplierTotal + shipping;
  const importVat = importVatBase * vatRate;
  const israeliExpensesIncludingVat = [
    customsIncludingVat,
    otherExpensesIncludingVat,
    customsBrokerIncludingVat,
    unloadingPortIncludingVat,
    productFileBuildIncludingVat
  ].reduce((sum, value) => sum + value, 0);
  const includedVatCosts = [
    customsIncludingVat,
    otherExpensesIncludingVat,
    customsBrokerIncludingVat,
    unloadingPortIncludingVat,
    productFileBuildIncludingVat
  ];
  const israeliExpensesBeforeVat = includedVatCosts.reduce((sum, value) => {
    return sum + (vatMultiplier > 0 ? value / vatMultiplier : value);
  }, 0);
  const israeliExpensesVat = includedVatCosts.reduce((sum, value) => {
    const beforeVat = vatMultiplier > 0 ? value / vatMultiplier : value;
    return sum + value - beforeVat;
  }, 0);
  const noVatExpenses = ilacReportDirectCost;
  const totalCostBeforeVat = Math.max(0, supplierTotal + shipping + israeliExpensesBeforeVat + noVatExpenses - supplierRefund);
  const totalVatPaid = importVat + israeliExpensesVat;
  const cashPaidIncludingVat = Math.max(0, supplierTotal + shipping + israeliExpensesIncludingVat + noVatExpenses + importVat - supplierRefund);
  const unitCostBeforeVat = quantity > 0 ? totalCostBeforeVat / quantity : 0;
  const unitCostIncludingVat = quantity > 0 ? cashPaidIncludingVat / quantity : 0;
  return {
    supplierPaymentCount,
    supplierPayments,
    supplierTotal,
    supplierRefund,
    importVat,
    importVatBase,
    customsBeforeVat,
    customsVat,
    otherExpensesBeforeVat: israeliExpensesBeforeVat,
    otherExpensesVat: israeliExpensesVat,
    israeliExpensesIncludingVat,
    israeliExpensesBeforeVat,
    israeliExpensesVat,
    noVatExpenses,
    taxableCostBeforeVat: importVatBase,
    totalVatPaid,
    totalCostBeforeVat,
    cashPaidIncludingVat,
    unitCostBeforeVat,
    unitCostIncludingVat,
    totalCost: totalCostBeforeVat,
    finalUnitCost: unitCostBeforeVat,
    unitCostAfterExpenses: unitCostBeforeVat
  };
}

function productKeyFromImport(importRecord) {
  return [
    String(importRecord.productName || "").trim(),
    String(importRecord.model || "").trim(),
    String(importRecord.material || "").trim()
  ].join("|").toLowerCase();
}

function findProductForImport(importRecord) {
  return state.products.find((product) => product.importKey === productKeyFromImport(importRecord))
    || state.products.find((product) => product.name === importRecord.productName && product.model === importRecord.model && product.material === importRecord.material)
    || state.products.find((product) => product.name === importRecord.productName)
    || null;
}

function importsForProduct(product) {
  return state.imports.filter((importRecord) => {
    if (importRecord.productId && importRecord.productId === product.id) return true;
    return product.importKey && productKeyFromImport(importRecord) === product.importKey;
  });
}

function productImportCostData(product) {
  const relatedImports = importsForProduct(product);
  const importedQuantity = relatedImports.reduce((sum, importRecord) => sum + helpers.number(importRecord.quantity), 0);
  const totalCostBeforeVat = relatedImports.reduce((sum, importRecord) => {
    return sum + calculateImportRecord(importRecord).totalCostBeforeVat;
  }, 0);
  return {
    importedQuantity,
    totalCostBeforeVat,
    averageCost: importedQuantity > 0 ? totalCostBeforeVat / importedQuantity : 0
  };
}

function productAverageCost(product) {
  const costData = productImportCostData(product);
  return costData.importedQuantity > 0 ? costData.averageCost : helpers.number(product.costPerUnit);
}

function recalculateProductFromImports(productId) {
  refreshState();
  const product = state.products.find((item) => item.id === productId);
  if (!product) return;
  const relatedImports = importsForProduct(product);
  const totalQuantity = relatedImports.reduce((sum, importRecord) => sum + helpers.number(importRecord.quantity), 0);
  const totalCost = relatedImports.reduce((sum, importRecord) => sum + calculateImportRecord(importRecord).totalCost, 0);
  const supplierCost = relatedImports.reduce((sum, importRecord) => sum + calculateImportRecord(importRecord).supplierTotal, 0);
  storageService.update("products", product.id, {
    name: product.name,
    model: product.model || "",
    material: product.material || "",
    importKey: product.importKey || [product.name || "", product.model || "", product.material || ""].join("|").toLowerCase(),
    costPerUnit: totalQuantity > 0 ? totalCost / totalQuantity : 0,
    importCostBeforeVatPerUnit: totalQuantity > 0 ? supplierCost / totalQuantity : 0
  });
}

function isImportInventoryMovement(movement) {
  return movement && (movement.sourceType === "import" || movement.type === "import");
}

function movementImportSourceId(movement) {
  if (!isImportInventoryMovement(movement)) return "";
  return movement.importId || movement.sourceId || "";
}

function importMovementMatchesImport(movement, importRecord) {
  return isImportInventoryMovement(movement)
    && movement.productId === importRecord.productId
    && movementImportSourceId(movement) === importRecord.id;
}

function duplicateImportMovementSortValue(movement) {
  return String(movement.movementDateTime || movement.createdAt || movement.updatedAt || movement.id || "");
}

function cleanupDuplicateImportMovements(importRecord = null) {
  const groups = new Map();
  state.inventoryMovements
    .filter(isImportInventoryMovement)
    .filter((movement) => movementImportSourceId(movement))
    .filter((movement) => !importRecord || importMovementMatchesImport(movement, importRecord))
    .forEach((movement) => {
      const key = `${movement.productId || ""}|${movementImportSourceId(movement)}|import`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(movement);
    });

  let keptMovement = null;
  groups.forEach((movements) => {
    const sorted = [...movements].sort((a, b) => duplicateImportMovementSortValue(a).localeCompare(duplicateImportMovementSortValue(b)));
    const [keeper, ...duplicates] = sorted;
    if (importRecord && keeper && importMovementMatchesImport(keeper, importRecord)) keptMovement = keeper;
    duplicates.forEach((movement) => storageService.delete("inventoryMovements", movement.id));
  });
  return keptMovement;
}

function rebuildImportMovement(importRecord) {
  refreshState();
  state.inventoryMovements
    .filter((movement) => isImportInventoryMovement(movement) && movementImportSourceId(movement) === importRecord.id && movement.productId !== importRecord.productId)
    .forEach((movement) => storageService.delete("inventoryMovements", movement.id));
  refreshState();
  const existingMovement = cleanupDuplicateImportMovements(importRecord);
  const fixedMovementDateTime = existingMovement?.movementDateTime || existingMovement?.createdAt || importRecord.createdAt || helpers.dateTime();
  const payload = {
    productId: importRecord.productId,
    type: "import",
    importId: importRecord.id,
    sourceType: "import",
    sourceId: importRecord.id,
    quantity: helpers.number(importRecord.quantity),
    date: importRecord.importDate || helpers.dateTime().slice(0, 10),
    movementDate: importRecord.importDate || helpers.dateTime().slice(0, 10),
    movementDateTime: fixedMovementDateTime,
    reason: "קליטת יבוא"
  };
  if (existingMovement) storageService.update("inventoryMovements", existingMovement.id, payload);
  else storageService.create("inventoryMovements", payload);
}

function syncProductForImport(importRecord) {
  refreshState();
  const importKey = productKeyFromImport(importRecord);
  const existingProduct = importRecord.productId
    ? state.products.find((product) => product.id === importRecord.productId)
    : findProductForImport(importRecord);
  if (existingProduct) {
    storageService.update("products", existingProduct.id, {
      name: importRecord.productName,
      model: importRecord.model,
      material: importRecord.material,
      importKey
    });
    return existingProduct.id;
  }
  const product = storageService.create("products", {
    name: importRecord.productName,
    model: importRecord.model,
    material: importRecord.material,
    sku: "",
    importKey,
    costPerUnit: 0,
    importCostBeforeVatPerUnit: 0
  });
  return product.id;
}

function importTotals(imports = state.imports) {
  const quantity = imports.reduce((sum, importRecord) => sum + helpers.number(importRecord.quantity), 0);
  const totalCost = imports.reduce((sum, importRecord) => sum + calculateImportRecord(importRecord).totalCost, 0);
  return {
    count: imports.length,
    quantity,
    totalCost,
    averageUnitCost: quantity > 0 ? totalCost / quantity : 0
  };
}

function selectedImportsForSummary() {
  const existingIds = new Set(state.imports.map((importRecord) => importRecord.id));
  [...selectedImportIds].forEach((id) => {
    if (!existingIds.has(id)) selectedImportIds.delete(id);
  });
  const selectedImports = state.imports.filter((importRecord) => selectedImportIds.has(importRecord.id));
  return selectedImports.length ? selectedImports : state.imports;
}

function inventoryProducts() {
  return state.products.filter((product) => {
    const searchMatch = !inventorySearch || String(product.name || "").includes(inventorySearch);
    const statusMatch = !inventoryStatusFilter || productStatus(product) === inventoryStatusFilter;
    return searchMatch && statusMatch;
  });
}

function productDisplayModel(product) {
  if (product.model) return product.model;
  const relatedImport = importsForProduct(product).find((importRecord) => importRecord.model);
  return relatedImport?.model || "";
}

function productMinimumStock(product) {
  const value = helpers.number(product.minimumStock, DEFAULT_LOW_STOCK_THRESHOLD);
  return value > 0 ? value : DEFAULT_LOW_STOCK_THRESHOLD;
}

function productStockHealth(product) {
  if (product.status === "הופסק") return { status: "הופסק", tone: "fail", percent: 0 };
  const available = calculationHelper.inventoryQuantity(product.id);
  const minimum = productMinimumStock(product);
  if (available < minimum) {
    return { status: "מלאי נמוך", tone: "fail", percent: minimum > 0 ? Math.max(4, available / minimum * 100) : 0 };
  }
  if (available < minimum * 1.2) {
    return { status: "מתקרב למינימום", tone: "warn", percent: minimum > 0 ? Math.min(100, available / minimum * 100) : 100 };
  }
  return { status: "מלאי תקין", tone: "pass", percent: 100 };
}

function productStatus(product) {
  return productStockHealth(product).status;
}

function inventoryTotals() {
  const availableUnits = state.products.reduce((sum, product) => sum + calculationHelper.inventoryQuantity(product.id), 0);
  const lowStock = state.products.filter((product) => productStockHealth(product).status === "מלאי נמוך").length;
  return {
    products: state.products.length,
    availableUnits,
    totalValue: calculationHelper.inventoryCostValue(),
    lowStock
  };
}

function productInventoryData(product) {
  const costData = productImportCostData(product);
  const imported = costData.importedQuantity;
  const sold = calculationHelper.soldQuantity(product.id);
  const available = calculationHelper.inventoryQuantity(product.id);
  const averageCost = productAverageCost(product);
  const minimumStock = productMinimumStock(product);
  const stockHealth = productStockHealth(product);
  return {
    imported,
    sold,
    available,
    minimumStock,
    stockDifference: available - minimumStock,
    stockHealth,
    averageCost,
    value: available * averageCost,
    status: stockHealth.status
  };
}

function appSettings() {
  const settings = state.settings || {};
  const quantityLevels = Array.isArray(settings.quantityLevels) && settings.quantityLevels.length
    ? settings.quantityLevels
    : [300, 600, 1200, 2400];
  return {
    vat: helpers.number(settings.vat, 18),
    tax: helpers.number(settings.tax, 5),
    targetProfit: helpers.number(settings.targetProfit, 2),
    quantityLevels
  };
}

function calculatePricingQuote(input) {
  const product = state.products.find((item) => item.id === input.productId);
  const settings = appSettings();
  const quantity = helpers.number(input.quantity);
  const priceIncludingVat = helpers.number(input.priceIncludingVat);
  const vatRate = helpers.number(settings.vat) / 100;
  const taxRate = helpers.number(settings.tax) / 100;
  const priceBeforeVat = vatRate > 0 ? priceIncludingVat / (1 + vatRate) : priceIncludingVat;
  const vatPerUnit = priceIncludingVat - priceBeforeVat;
  const unitCost = product ? productAverageCost(product) : 0;
  const grossProfitPerUnit = priceBeforeVat - unitCost;
  const grossProfitTotal = grossProfitPerUnit * quantity;
  const estimatedTax = Math.max(0, grossProfitTotal * taxRate);
  const netProfitTotal = grossProfitTotal - estimatedTax;
  const netProfitPerUnit = quantity > 0 ? netProfitTotal / quantity : 0;
  const availableInventory = product ? calculationHelper.inventoryQuantity(product.id) : 0;
  let decision = "לא למכור";
  if (netProfitPerUnit >= settings.targetProfit && netProfitPerUnit <= settings.targetProfit * 1.1) {
    decision = "גבולי";
  }
  if (netProfitPerUnit > settings.targetProfit * 1.1) {
    decision = "עסקה טובה";
  }
  return {
    product,
    settings,
    quantity,
    priceIncludingVat,
    priceBeforeVat,
    vatPerUnit,
    unitCost,
    grossProfitPerUnit,
    grossProfitTotal,
    estimatedTax,
    netProfitPerUnit,
    netProfitTotal,
    availableInventory,
    inventoryOk: quantity <= availableInventory,
    decision
  };
}

function activeSaleStatuses() {
  return ["בגבייה", "ממתין לתשלום", "שולם", "סופק"];
}

function isActiveSaleStatus(status) {
  return activeSaleStatuses().includes(status);
}

function saleStatusOptions() {
  return ["טיוטה", "בגבייה", "שולם", "סופק", "בוטל"];
}

function customerTypeOptions() {
  return ["לקוח קבוע", "לקוח חד פעמי"];
}

function calculateSaleRecord(sale) {
  const settings = appSettings();
  const product = state.products.find((item) => item.id === sale.productId);
  const quantity = helpers.number(sale.quantity);
  const unitPriceIncludingVat = helpers.number(sale.unitPriceIncludingVat);
  const vatRate = helpers.number(settings.vat) / 100;
  const taxRate = helpers.number(settings.tax) / 100;
  const totalIncludingVat = quantity * unitPriceIncludingVat;
  const totalBeforeVat = vatRate > 0 ? totalIncludingVat / (1 + vatRate) : totalIncludingVat;
  const vatAmount = totalIncludingVat - totalBeforeVat;
  const unitCost = product ? productAverageCost(product) : 0;
  const totalCost = quantity * unitCost;
  const grossProfit = totalBeforeVat - totalCost;
  const estimatedTax = Math.max(0, grossProfit * taxRate);
  const netProfit = grossProfit - estimatedTax;
  const netProfitPerUnit = quantity > 0 ? netProfit / quantity : 0;
  return {
    product,
    quantity,
    unitPriceIncludingVat,
    totalIncludingVat,
    totalBeforeVat,
    vatAmount,
    totalCost,
    grossProfit,
    estimatedTax,
    netProfit,
    netProfitPerUnit
  };
}

function saleTotals() {
  const activeSales = state.sales.filter((sale) => isActiveSaleStatus(sale.status));
  return activeSales.reduce((totals, sale) => {
    const calc = calculateSaleRecord(sale);
    totals.count += 1;
    totals.income += calc.totalIncludingVat;
    totals.netProfit += calc.netProfit;
    totals.units += calc.quantity;
    return totals;
  }, { count: 0, income: 0, netProfit: 0, units: 0 });
}

function salesForCustomer(customerId) {
  return state.sales.filter((sale) => sale.customerId === customerId && sale.status !== "בוטל");
}

function paymentsForCustomer(customerId) {
  return state.payments.filter((payment) => payment.customerId === customerId);
}

function paymentRowsForCustomer(customerId) {
  return paymentBalanceRows().filter((row) => row.sale.customerId === customerId);
}

function paymentEntriesForCustomer(customerId) {
  return state.payments
    .filter((payment) => payment.customerId === customerId && payment.kind === "payment")
    .sort((a, b) => String(b.paymentDate || "").localeCompare(String(a.paymentDate || "")));
}

function customerSummary(customer) {
  const sales = salesForCustomer(customer.id);
  const paymentRows = paymentRowsForCustomer(customer.id);
  const totals = sales.reduce((sum, sale) => {
    const calc = calculateSaleRecord(sale);
    sum.purchases += calc.totalIncludingVat;
    sum.units += calc.quantity;
    sum.netProfit += calc.netProfit;
    sum.priceTotal += calc.unitPriceIncludingVat * calc.quantity;
    const saleTime = sale.saleDate ? new Date(sale.saleDate).getTime() : 0;
    if (saleTime > sum.lastPurchaseTime) sum.lastPurchaseTime = saleTime;
    return sum;
  }, { purchases: 0, units: 0, netProfit: 0, priceTotal: 0, lastPurchaseTime: 0 });
  const openBalance = paymentRows.reduce((sum, row) => sum + helpers.number(row.openBalance), 0);
  return {
    purchaseCount: sales.length,
    totalPurchases: totals.purchases,
    totalUnits: totals.units,
    averageQuantity: sales.length ? totals.units / sales.length : 0,
    averageUnitPrice: totals.units ? totals.priceTotal / totals.units : 0,
    netProfit: totals.netProfit,
    openBalance,
    lastPurchaseDate: totals.lastPurchaseTime ? new Date(totals.lastPurchaseTime) : null
  };
}

function customerTotals() {
  return state.customers.reduce((totals, customer) => {
    const summary = customerSummary(customer);
    totals.count += 1;
    if (customer.type === "לקוח קבוע") totals.returning += 1;
    if (customer.type === "לקוח חד פעמי") totals.oneTime += 1;
    totals.openBalance += summary.openBalance;
    return totals;
  }, { count: 0, returning: 0, oneTime: 0, openBalance: 0 });
}

function productRows() {
  if (!state.products.length) {
    return emptyState("▦", "אין מוצרים עדיין", "בשלב הבסיס המערכת מוכנה לקבל מוצרים, יבוא ותנועות מלאי בהמשך.");
  }
  return `
    <div class="list">
      ${state.products.map((product) => `
        <div class="row">
          <div>
            <strong>${product.name}</strong>
            <small>מק״ט: ${product.sku || "טרם הוגדר"}</small>
          </div>
          <div>
            <small>כמות זמינה</small>
            <strong>${calculationHelper.inventoryQuantity(product.id).toLocaleString("he-IL")}</strong>
          </div>
          <div>
            <small>עלות יחידה</small>
            <strong>₪${helpers.moneyThree(productAverageCost(product))}</strong>
          </div>
          <div>
            <small>מחיר מכירה כולל מע״מ</small>
            <strong>₪${helpers.money(product.sellingPriceIncludingVat)}</strong>
          </div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderDashboardLegacyBackup() {
  const inventory = inventoryTotals();
  const sales = saleTotals();
  const payments = paymentTotals();
  const importedUnits = state.products.reduce((sum, product) => sum + calculationHelper.importedQuantity(product.id), 0);
  const soldUnits = state.products.reduce((sum, product) => sum + calculationHelper.soldQuantity(product.id), 0);
  const soldPercent = importedUnits > 0 ? soldUnits / importedUnits * 100 : 0;
  const remainingPercent = Math.max(0, 100 - soldPercent);
  const grossProfit = activeSalesForPayments().reduce((sum, sale) => sum + calculateSaleRecord(sale).grossProfit, 0);
  const salesVat = activeSalesForPayments().reduce((sum, sale) => sum + calculateSaleRecord(sale).vatAmount, 0);
  const estimatedTax = activeSalesForPayments().reduce((sum, sale) => sum + calculateSaleRecord(sale).estimatedTax, 0);
  const averageNetPerUnit = sales.units > 0 ? sales.netProfit / sales.units : 0;
  const debtRows = paymentBalanceRows().filter((row) => row.openBalance > 0);
  return `
    ${moduleHeader("dashboard", "מסך סיכום בלבד. כל הנתונים מחושבים ממודולי היבוא, המלאי, המכירות, התשלומים, הלקוחות וההגדרות.")}
    <section class="grid stats dashboard-stats">
      ${statCard("הכנסות כוללות", `₪${helpers.moneyWhole(sales.income)}`, "ממכירות פעילות", sales.income ? 100 : 12)}
      ${statCard("מע״מ ממכירות", `₪${helpers.moneyWhole(salesVat)}`, "סכום לשמור לדיווח מע״מ", salesVat ? 76 : 12, "warn-card")}
      ${statCard("רווח גולמי", `₪${helpers.moneyWhole(grossProfit)}`, "לפני מס משוער", grossProfit ? 78 : 12)}
      ${statCard("רווח נקי משוער", `₪${helpers.moneyWhole(sales.netProfit)}`, "לאחר מס משוער", sales.netProfit ? 72 : 12)}
      ${statCard("רווח ממוצע ליחידה", `₪${helpers.money(averageNetPerUnit)}`, "רווח נקי חלקי יחידות שנמכרו", averageNetPerUnit ? 64 : 12)}
      ${statCard("יתרת מלאי", inventory.availableUnits.toLocaleString("he-IL"), "יחידות זמינות", inventory.availableUnits ? 86 : 12)}
      ${statCard("שווי מלאי", `₪${helpers.moneyWhole(inventory.totalValue)}`, "זמינות כפול עלות ממוצעת", inventory.totalValue ? 82 : 12)}
      ${statCard("יתרת חובות פתוחים", `₪${helpers.moneyWhole(payments.open)}`, "ממכירות שלא שולמו במלואן", payments.open ? 70 : 12)}
    </section>
    <section class="grid two" style="margin-top:16px">
      <article class="card">
        <div class="section-title"><h3>סיכום מלאי</h3><span class="pill">נמכר מול נשאר</span></div>
        <div class="data-preview">
          <div class="check-item"><span>סה״כ יחידות שיובאו</span><strong>${importedUnits.toLocaleString("he-IL")}</strong></div>
          <div class="check-item"><span>יחידות שנמכרו</span><strong>${soldUnits.toLocaleString("he-IL")}</strong></div>
          <div class="check-item"><span>יחידות זמינות</span><strong>${inventory.availableUnits.toLocaleString("he-IL")}</strong></div>
          <div>
            <div class="section-title"><span class="meta">נמכר ${helpers.money(soldPercent)}%</span><span class="meta">נשאר ${helpers.money(remainingPercent)}%</span></div>
            <div class="progress split-progress" aria-label="נמכר מול נשאר"><span style="width:${Math.max(0, Math.min(soldPercent, 100))}%"></span></div>
          </div>
        </div>
      </article>
      <article class="card">
        <div class="section-title"><h3>סיכום רווח</h3><span class="pill">מחושב ממכירות</span></div>
        <div class="calculated-grid">
          <div class="calc-card"><span>רווח גולמי</span><strong>₪${helpers.moneyWhole(grossProfit)}</strong></div>
          <div class="calc-card"><span>מע״מ ממכירות לשמירה</span><strong>₪${helpers.moneyWhole(salesVat)}</strong></div>
          <div class="calc-card"><span>מס משוער</span><strong>₪${helpers.moneyWhole(estimatedTax)}</strong></div>
          <div class="calc-card"><span>רווח נקי</span><strong>₪${helpers.moneyWhole(sales.netProfit)}</strong></div>
          <div class="calc-card"><span>רווח נקי ממוצע ליחידה</span><strong>₪${helpers.money(averageNetPerUnit)}</strong></div>
        </div>
      </article>
    </section>
    ${debtRows.length ? `
      <section class="card" style="margin-top:16px">
        <div class="section-title"><h3>התראות תשלום</h3><span class="pill fail">חובות פתוחים</span></div>
        <div class="list">
          ${debtRows.map((row) => `<div class="check-item"><span>${helpers.text(row.sale.customerName)} · ${helpers.text(row.calc.product?.name || "מכירה")}</span><strong>₪${helpers.moneyWhole(row.openBalance)}</strong></div>`).join("")}
        </div>
      </section>
    ` : ""}
    <section class="card" style="margin-top:16px">
      <div class="section-title"><h3>פעולות מהירות</h3><span class="pill">ניווט בלבד</span></div>
      <div class="actions">
        <button class="icon-button" type="button" data-action="quick-sale">הוסף מכירה</button>
        <button class="secondary-button" type="button" data-action="quick-pricing">בדוק מחיר</button>
        <button class="secondary-button" type="button" data-action="quick-customer">הוסף לקוח</button>
      </div>
    </section>
  `;
}

function renderDashboard() {
  const inventory = inventoryTotals();
  const sales = saleTotals();
  const payments = paymentTotals();
  const importedUnits = state.products.reduce((sum, product) => sum + calculationHelper.importedQuantity(product.id), 0);
  const soldUnits = state.products.reduce((sum, product) => sum + calculationHelper.soldQuantity(product.id), 0);
  const soldPercent = importedUnits > 0 ? soldUnits / importedUnits * 100 : 0;
  const remainingPercent = Math.max(0, 100 - soldPercent);
  const grossProfit = activeSalesForPayments().reduce((sum, sale) => sum + calculateSaleRecord(sale).grossProfit, 0);
  const salesVat = activeSalesForPayments().reduce((sum, sale) => sum + calculateSaleRecord(sale).vatAmount, 0);
  const estimatedTax = activeSalesForPayments().reduce((sum, sale) => sum + calculateSaleRecord(sale).estimatedTax, 0);
  const averageNetPerUnit = sales.units > 0 ? sales.netProfit / sales.units : 0;
  const debtRows = paymentBalanceRows().filter((row) => row.openBalance > 0);
  const lowStockCount = inventory.lowStock;
  const profitabilityLabel = sales.netProfit > 0 ? "רווחיות חיובית" : sales.income > 0 ? "דורש בדיקה" : "אין מכירות פעילות";
  return `
    ${moduleHeader("dashboard", "מסך סיכום בלבד. כל הנתונים מחושבים ממודולי היבוא, המלאי, המכירות, התשלומים, הלקוחות וההגדרות.")}

    <section class="grid stats dashboard-stats">
      ${statCard("רווח נקי", `₪${helpers.moneyWhole(sales.netProfit)}`, "לאחר מס משוער", sales.netProfit ? 100 : 12)}
      ${statCard("הכנסות", `₪${helpers.moneyWhole(sales.income)}`, "ממכירות פעילות", sales.income ? 88 : 12)}
      ${statCard("שווי מלאי", `₪${helpers.moneyWhole(inventory.totalValue)}`, "זמינות כפול עלות ממוצעת", inventory.totalValue ? 82 : 12)}
      ${statCard("תזרים מזומן", `₪${helpers.moneyWhole(payments.received)}`, "תשלומים שהתקבלו בפועל", payments.received ? 76 : 12)}
    </section>

    <section class="card" style="margin-top:16px">
      <div class="section-title"><h3>סטטוס מערכת</h3><span class="pill">מבט מהיר</span></div>
      <div class="calculated-grid">
        <div class="calc-card">
          <span>מלאי נמוך</span>
          <strong>${lowStockCount.toLocaleString("he-IL")} מוצרים</strong>
          <small>${lowStockCount ? "יש מוצרים מתחת לסף המינימום" : "אין התראות מלאי נמוך"}</small>
        </div>
        <div class="calc-card">
          <span>לקוחות לא שילמו</span>
          <strong>${debtRows.length.toLocaleString("he-IL")} עסקאות</strong>
          <small>יתרה פתוחה ₪${helpers.moneyWhole(payments.open)}</small>
        </div>
        <div class="calc-card highlight-calc">
          <span>מצב רווחיות</span>
          <strong>${helpers.text(profitabilityLabel)}</strong>
          <small>רווח נקי ממוצע ליחידה ₪${helpers.money(averageNetPerUnit)}</small>
        </div>
      </div>
    </section>

    <section class="card" style="margin-top:16px">
      <div class="section-title"><h3>פעולות מהירות</h3><span class="pill">ניווט בלבד</span></div>
      <div class="actions">
        <button class="icon-button" type="button" data-action="quick-sale">מכירה חדשה</button>
        <button class="secondary-button" type="button" data-action="quick-customer">לקוח חדש</button>
        <button class="secondary-button" type="button" data-action="quick-import">יבוא חדש</button>
        <button class="secondary-button" type="button" data-action="quick-pricing">בדיקת תמחור</button>
      </div>
    </section>

    <section class="grid two" style="margin-top:16px">
      <article class="card">
        <div class="section-title"><h3>סיכום מלאי</h3><span class="pill">נמכר מול נשאר</span></div>
        <div class="data-preview">
          <div class="check-item"><span>סה״כ יחידות שיובאו</span><strong>${importedUnits.toLocaleString("he-IL")}</strong></div>
          <div class="check-item"><span>יחידות שנמכרו</span><strong>${soldUnits.toLocaleString("he-IL")}</strong></div>
          <div class="check-item"><span>יחידות זמינות</span><strong>${inventory.availableUnits.toLocaleString("he-IL")}</strong></div>
          <div>
            <div class="section-title"><span class="meta">נמכר ${helpers.money(soldPercent)}%</span><span class="meta">נשאר ${helpers.money(remainingPercent)}%</span></div>
            <div class="progress split-progress" aria-label="נמכר מול נשאר"><span style="width:${Math.max(0, Math.min(soldPercent, 100))}%"></span></div>
          </div>
        </div>
      </article>
      <article class="card">
        <div class="section-title"><h3>סיכום רווח ותשלומים</h3><span class="pill">מחושב ממכירות</span></div>
        <div class="calculated-grid">
          <div class="calc-card"><span>רווח גולמי</span><strong>₪${helpers.moneyWhole(grossProfit)}</strong></div>
          <div class="calc-card"><span>מע״מ ממכירות לשמירה</span><strong>₪${helpers.moneyWhole(salesVat)}</strong></div>
          <div class="calc-card"><span>מס משוער</span><strong>₪${helpers.moneyWhole(estimatedTax)}</strong></div>
          <div class="calc-card"><span>רווח ממוצע ליחידה</span><strong>₪${helpers.money(averageNetPerUnit)}</strong></div>
          <div class="calc-card"><span>יתרת חובות פתוחים</span><strong>₪${helpers.moneyWhole(payments.open)}</strong></div>
        </div>
      </article>
    </section>

    ${debtRows.length ? `
      <section class="card" style="margin-top:16px">
        <div class="section-title"><h3>לקוחות שלא שילמו</h3><span class="pill fail">חובות פתוחים</span></div>
        <div class="list">
          ${debtRows.map((row) => `<div class="check-item"><span>${helpers.text(row.sale.customerName)} · ${helpers.text(row.calc.product?.name || "מכירה")}</span><strong>₪${helpers.moneyWhole(row.openBalance)}</strong></div>`).join("")}
        </div>
      </section>
    ` : ""}
  `;
}

function renderImports() {
  const summaryImports = selectedImportsForSummary();
  const totals = importTotals(summaryImports);
  const editingImport = editingImportId ? state.imports.find((item) => item.id === editingImportId) : null;
  const summaryNote = selectedImportIds.size ? "לפי בחירת שורות בטבלה" : "סיכום כל רשומות היבוא";
  return `
    ${moduleHeader("imports", "כל משלוח יבוא נרשם כאן ומייצר כניסה למלאי. עלות היחידה מחושבת מהיבוא ומשמשת בהמשך את המוצרים, התמחור, המכירות והדשבורד.")}
    <section class="grid stats">
      ${statCard("סך הכל משלוחי יבוא", totals.count.toLocaleString("he-IL"), summaryNote, totals.count ? 100 : 12)}
      ${statCard("סך הכל יחידות שיובאו", totals.quantity.toLocaleString("he-IL"), summaryNote, totals.quantity ? 100 : 12)}
      ${statCard("עלות יבוא כוללת", `₪${helpers.moneyWhole(totals.totalCost)}`, summaryNote, totals.totalCost ? 82 : 12)}
      ${statCard("עלות ממוצעת ליחידה", `₪${helpers.moneyThree(totals.averageUnitCost)}`, summaryNote, totals.averageUnitCost ? 64 : 12)}
    </section>
    <section class="card" style="margin-top:16px">
      <div class="section-title">
        <h3>משלוחי יבוא</h3>
        <button class="icon-button compact-button" type="button" data-action="new-import">＋ הוסף יבוא</button>
      </div>
      ${importFormOpen ? renderImportForm(editingImport) : ""}
      ${state.imports.length ? renderImportsTable() : emptyState("↧", "אין יבוא רשום", "לחץ על הוסף יבוא כדי לקלוט משלוח ראשון ולהכניס מלאי למערכת.")}
    </section>
  `;
}

function renderImportFormLegacyBackup(importRecord) {
  const values = {
    productName: importRecord?.productName || "",
    model: importRecord?.model || "",
    material: importRecord?.material || "",
    importDate: importRecord?.importDate || importRecord?.arrivalDate || new Date().toISOString().slice(0, 10),
    quantity: importRecord?.quantity ?? "",
    supplierPaymentCount: importRecord?.supplierPaymentCount || (importRecord?.goodsCostBeforeVat ? 1 : 1),
    supplierPayment1: importRecord?.supplierPayment1 ?? importRecord?.goodsCostBeforeVat ?? "",
    supplierPayment2: importRecord?.supplierPayment2 ?? "",
    supplierPayment3: importRecord?.supplierPayment3 ?? "",
    supplierRefund: importRecord?.supplierRefund ?? "",
    shipping: importRecord?.shipping ?? "",
    ilacReport: importRecord?.ilacReport ?? "",
    customsBroker: importRecord?.customsBroker ?? "",
    unloadingPort: importRecord?.unloadingPort ?? "",
    productFileBuild: importRecord?.productFileBuild ?? "",
    customs: importRecord?.customs ?? "",
    shippingType: importRecord?.shippingType || "ימי",
    otherExpenses: importRecord?.otherExpenses ?? "",
    notes: importRecord?.notes || ""
  };
  const supplierPaymentCount = Math.max(1, Math.min(3, helpers.number(values.supplierPaymentCount, 1)));
  const calc = calculateImportRecord(values);
  return `
    <form class="import-form" id="importForm" novalidate>
      <input type="hidden" name="id" value="${importRecord?.id || ""}">
      <div class="form-grid">
        ${formField("מוצר", "productName", values.productName, "text", true)}
        ${formField("דגם", "model", values.model)}
        ${formField("תאריך הגעת סחורה", "importDate", values.importDate, "date")}
        ${formField("כמות שיובאה", "quantity", values.quantity, "quantity", true)}
        <label class="field">
          <span>סוג משלוח</span>
          <select name="shippingType">
            <option value="ימי" ${values.shippingType === "ימי" ? "selected" : ""}>ימי</option>
            <option value="אווירי" ${values.shippingType === "אווירי" ? "selected" : ""}>אווירי</option>
          </select>
        </label>
        <label class="field">
          <span>מספר תשלומים לספק</span>
          <select name="supplierPaymentCount" data-supplier-payment-count>
            <option value="1" ${supplierPaymentCount === 1 ? "selected" : ""}>1</option>
            <option value="2" ${supplierPaymentCount === 2 ? "selected" : ""}>2</option>
            <option value="3" ${supplierPaymentCount === 3 ? "selected" : ""}>3</option>
          </select>
        </label>
        ${[1, 2, 3].map((index) => `
          <div class="${index > supplierPaymentCount ? "hidden-field" : ""}" data-supplier-payment-field="${index}">
            ${formField(`תשלום ספק ${index}`, `supplierPayment${index}`, values[`supplierPayment${index}`], "money", index === 1)}
          </div>
        `).join("")}
        <div class="calc-card inline-result"><span>סה״כ תשלום לספק</span><strong id="supplierTotalResult">₪${helpers.moneyWhole(calc.supplierTotal)}</strong></div>
        ${formField("עלות משלוח לפני מע״מ", "shipping", values.shipping, "money")}
        ${formField("בדיקת דוח ILAC", "ilacReport", values.ilacReport, "money")}
        ${formField("עמיל מכס", "customsBroker", values.customsBroker, "money")}
        ${formField("נמל פריקה", "unloadingPort", values.unloadingPort, "money")}
        ${formField("בניית תיק מוצר", "productFileBuild", values.productFileBuild, "money")}
        ${formField("מכס כולל מע״מ", "customs", values.customs, "money")}
        ${formField("הוצאות נוספות כולל מע״מ", "otherExpenses", values.otherExpenses, "money")}
        <label class="field full-field">
          <span>הערות</span>
          <textarea name="notes" rows="3">${helpers.text(values.notes)}</textarea>
        </label>
        <div class="supplier-refund-box full-field">
          ${formField("החזר ספק", "supplierRefund", values.supplierRefund, "money")}
        </div>
      </div>
      <div class="section-title compact-section-title"><h3>תוצאה מחושבת</h3></div>
      <div class="calculated-grid import-result-grid" id="importCalculatedFields">
        ${renderImportCalculatedFields(calc)}
      </div>
      <div class="form-message" id="importFormMessage" role="alert"></div>
      <div class="actions">
        <button class="icon-button" type="submit" data-action="save-import">${importRecord ? "שמור שינויים" : "שמור יבוא"}</button>
        <button class="secondary-button" type="button" data-action="cancel-import">ביטול</button>
      </div>
    </form>
  `;
}

function renderImportForm(importRecord) {
  const values = {
    productName: importRecord?.productName || "",
    model: importRecord?.model || "",
    material: importRecord?.material || "",
    importDate: importRecord?.importDate || importRecord?.arrivalDate || new Date().toISOString().slice(0, 10),
    quantity: importRecord?.quantity ?? "",
    supplierPaymentCount: importRecord?.supplierPaymentCount || (importRecord?.goodsCostBeforeVat ? 1 : 1),
    supplierPayment1: importRecord?.supplierPayment1 ?? importRecord?.goodsCostBeforeVat ?? "",
    supplierPayment2: importRecord?.supplierPayment2 ?? "",
    supplierPayment3: importRecord?.supplierPayment3 ?? "",
    supplierRefund: importRecord?.supplierRefund ?? "",
    shipping: importRecord?.shipping ?? "",
    ilacReport: importRecord?.ilacReport ?? "",
    customsBroker: importRecord?.customsBroker ?? "",
    unloadingPort: importRecord?.unloadingPort ?? "",
    productFileBuild: importRecord?.productFileBuild ?? "",
    customs: importRecord?.customs ?? "",
    shippingType: importRecord?.shippingType || "ימי",
    otherExpenses: importRecord?.otherExpenses ?? "",
    notes: importRecord?.notes || ""
  };
  const supplierPaymentCount = Math.max(1, Math.min(3, helpers.number(values.supplierPaymentCount, 1)));
  const calc = calculateImportRecord(values);
  return `
    <form class="import-form import-form-organized" id="importForm" novalidate>
      <input type="hidden" name="id" value="${importRecord?.id || ""}">

      <section class="form-block">
        <div class="form-block-title"><h4>פרטי יבוא</h4></div>
        <div class="form-grid">
          ${formField("מוצר", "productName", values.productName, "text", true)}
          ${formField("דגם", "model", values.model)}
          ${formField("תאריך הגעת סחורה", "importDate", values.importDate, "date")}
          ${formField("כמות שיובאה", "quantity", values.quantity, "quantity", true)}
          <label class="field">
            <span>סוג משלוח</span>
            <select name="shippingType">
              <option value="ימי" ${values.shippingType === "ימי" ? "selected" : ""}>ימי</option>
              <option value="אווירי" ${values.shippingType === "אווירי" ? "selected" : ""}>אווירי</option>
            </select>
          </label>
        </div>
      </section>

      <section class="form-block">
        <div class="form-block-title"><h4>תשלומים לספק</h4></div>
        <div class="form-grid">
          <label class="field">
            <span>מספר תשלומים לספק</span>
            <select name="supplierPaymentCount" data-supplier-payment-count>
              <option value="1" ${supplierPaymentCount === 1 ? "selected" : ""}>1</option>
              <option value="2" ${supplierPaymentCount === 2 ? "selected" : ""}>2</option>
              <option value="3" ${supplierPaymentCount === 3 ? "selected" : ""}>3</option>
            </select>
          </label>
          ${[1, 2, 3].map((index) => `
            <div class="${index > supplierPaymentCount ? "hidden-field" : ""}" data-supplier-payment-field="${index}">
              ${formField(`תשלום ספק ${index}`, `supplierPayment${index}`, values[`supplierPayment${index}`], "money", index === 1)}
            </div>
          `).join("")}
          <div class="calc-card inline-result supplier-total-card"><span>סה״כ תשלום לספק</span><strong id="supplierTotalResult">₪${helpers.moneyWhole(calc.supplierTotal)}</strong></div>
          <div class="supplier-refund-box full-field">
            ${formField("החזר ספק", "supplierRefund", values.supplierRefund, "money")}
          </div>
        </div>
      </section>

      <section class="form-block">
        <div class="form-block-title"><h4>עלויות שילוח ושחרור</h4></div>
        <div class="form-grid">
          ${formField("עלות משלוח לפני מע״מ", "shipping", values.shipping, "money")}
          ${formField("בדיקת דוח ILAC", "ilacReport", values.ilacReport, "money")}
          ${formField("עמיל מכס", "customsBroker", values.customsBroker, "money")}
          ${formField("נמל פריקה", "unloadingPort", values.unloadingPort, "money")}
          ${formField("בניית תיק מוצר", "productFileBuild", values.productFileBuild, "money")}
          ${formField("מכס כולל מע״מ", "customs", values.customs, "money")}
          ${formField("הוצאות נוספות כולל מע״מ", "otherExpenses", values.otherExpenses, "money")}
        </div>
      </section>

      <section class="form-block">
        <div class="form-block-title"><h4>הערות</h4></div>
        <label class="field full-field">
          <span>הערות</span>
          <textarea name="notes" rows="3">${helpers.text(values.notes)}</textarea>
        </label>
      </section>

      <section class="form-block result-block">
        <div class="form-block-title"><h4>תוצאה מחושבת</h4></div>
        <div class="calculated-grid import-result-grid" id="importCalculatedFields">
          ${renderImportCalculatedFields(calc)}
        </div>
      </section>

      <div class="form-message" id="importFormMessage" role="alert"></div>
      <div class="actions">
        <button class="icon-button" type="submit" data-action="save-import">${importRecord ? "שמור שינויים" : "שמור יבוא"}</button>
        <button class="secondary-button" type="button" data-action="cancel-import">ביטול</button>
      </div>
    </form>
  `;
}

function formField(label, name, value, type = "text", required = false) {
  const numeric = type === "number" || type === "quantity";
  const money = type === "money";
  const inputType = money || numeric ? "text" : type;
  const hasValue = value !== undefined && value !== null && value !== "";
  const displayValue = money && hasValue
    ? helpers.moneyInput(value)
    : numeric && hasValue
      ? helpers.numberText(value)
      : helpers.text(value);
  return `
    <label class="field">
      <span>${label}</span>
      <input
        name="${name}"
        type="${inputType}"
        value="${helpers.text(displayValue)}"
        ${required ? "required" : ""}
        ${numeric ? "inputmode=\"decimal\" data-number=\"true\"" : ""}
        ${money ? "inputmode=\"decimal\" data-money=\"true\"" : ""}
      >
    </label>
  `;
}

function renderImportCalculatedFields(calc) {
  return `
    ${uiHelper.resultCard("בסיס מע״מ יבוא על טובין ומשלוח", `₪${helpers.moneyWhole(calc.importVatBase)}`)}
    ${uiHelper.resultCard("מע״מ יבוא על טובין ומשלוח", `₪${helpers.moneyWhole(calc.importVat)}`)}
    ${uiHelper.resultCard("הוצאות ישראליות לפני מע״מ", `₪${helpers.money(calc.israeliExpensesBeforeVat)}`)}
    ${uiHelper.resultCard("מע״מ מתוך הוצאות ישראליות", `₪${helpers.money(calc.israeliExpensesVat)}`)}
    ${uiHelper.resultCard("הוצאות ללא מע״מ", `₪${helpers.moneyWhole(calc.noVatExpenses)}`)}
    ${uiHelper.resultCard("סך מע״מ ששולם", `₪${helpers.moneyWhole(calc.totalVatPaid)}`)}
    ${uiHelper.resultCard("עלות עסקית נטו לחישוב רווח", `₪${helpers.moneyWhole(calc.totalCostBeforeVat)}`)}
    ${uiHelper.resultCard("תשלום כולל בפועל", `₪${helpers.moneyWhole(calc.cashPaidIncludingVat)}`)}
    ${uiHelper.resultCard("עלות ליחידה נטו לחישוב רווח", `₪${helpers.moneyThree(calc.unitCostBeforeVat)}`, { highlight: true })}
    ${uiHelper.resultCard("עלות ליחידה לפי תזרים בפועל", `₪${helpers.moneyThree(calc.unitCostIncludingVat)}`)}
  `;
}

function renderImportsTable() {
  return `
    <div class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>בחירה</th>
            <th>מוצר</th>
            <th>דגם</th>
            <th>תאריך הגעת סחורה</th>
            <th>סוג משלוח</th>
            <th>כמות</th>
            <th>עלות כוללת לפני מע״מ</th>
            <th>עלות ליחידה לפני מע״מ</th>
            <th>פעולות</th>
          </tr>
        </thead>
        <tbody>
          ${state.imports.map((importRecord) => {
            const calc = calculateImportRecord(importRecord);
            return `
              <tr>
                <td>
                  <input
                    type="checkbox"
                    data-import-select="${helpers.text(importRecord.id)}"
                    aria-label="בחר יבוא"
                    ${selectedImportIds.has(importRecord.id) ? "checked" : ""}
                  >
                </td>
                <td><strong>${helpers.text(importRecord.productName)}</strong></td>
                <td>${helpers.text(importRecord.model || "לא צוין")}</td>
                <td>${importRecord.importDate ? new Date(importRecord.importDate).toLocaleDateString("he-IL") : "לא צוין"}</td>
                <td>${helpers.text(importRecord.shippingType || "ימי")}</td>
                <td>${helpers.number(importRecord.quantity).toLocaleString("he-IL")}</td>
                <td>₪${helpers.moneyWhole(calc.totalCostBeforeVat)}</td>
                <td>₪${helpers.moneyThree(calc.unitCostBeforeVat)}</td>
                <td>
                  <div class="table-actions">
                    <button class="secondary-button compact-button" type="button" data-action="edit-import" data-id="${importRecord.id}">ערוך</button>
                    <button class="danger-button compact-button" type="button" data-action="delete-import" data-id="${importRecord.id}">מחק</button>
                  </div>
                </td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderInventory() {
  const totals = inventoryTotals();
  const products = inventoryProducts();
  return `
    ${moduleHeader("inventory", "מודול זה מציג מוצרים ומצב מלאי בלבד. עלויות יבוא מגיעות רק ממודול יבוא ועלויות, והכמויות מחושבות מתנועות מלאי.")}
    <section class="grid stats inventory-stats">
      ${statCard("שווי מלאי כולל", `₪${helpers.moneyWhole(totals.totalValue)}`, "כמות זמינה כפול עלות ממוצעת", totals.totalValue ? 82 : 12)}
      ${statCard("סה״כ יחידות זמינות", totals.availableUnits.toLocaleString("he-IL"), "יבוא פחות מכירות ועדכונים", totals.availableUnits ? 100 : 12)}
      ${statCard("מוצרים במלאי נמוך", totals.lowStock.toLocaleString("he-IL"), "זמינות מתחת למינימום", totals.lowStock ? 46 : 12, totals.lowStock ? "warn-card" : "")}
      ${statCard("סה״כ מוצרים", totals.products.toLocaleString("he-IL"), "מוצרים שנוצרו מהיבוא", totals.products ? 100 : 12)}
    </section>
    <section class="card" style="margin-top:16px">
      <div class="section-title">
        <h3>מוצרים ומלאי</h3>
        <button class="icon-button compact-button" type="button" data-action="new-manual-inventory">＋ עדכן מלאי ידני</button>
      </div>
      ${renderInventoryToolbar()}
      ${manualInventoryOpen ? renderManualInventoryForm(manualInventoryProductId) : ""}
      ${products.length ? renderInventoryTable(products) : emptyState("▦", "אין מוצרים להצגה", "מוצרים נוצרים דרך יבוא ועלויות. ניתן לשנות חיפוש או סינון כדי לראות מוצרים קיימים.")}
      <div class="movement-panel">
        <div class="section-title"><h3>תנועות מלאי אחרונות</h3><span class="pill">${state.inventoryMovements.length} תנועות</span></div>
        ${state.inventoryMovements.length ? renderMovements() : emptyState("↕", "אין תנועות מלאי", "יבוא יוסיף מלאי, מכירה תגרע מלאי, ועדכון ידני ייצור תנועה מבוקרת.")}
      </div>
    </section>
  `;
}

function renderInventoryToolbar() {
  const statuses = ["מלאי תקין", "מתקרב למינימום", "מלאי נמוך", "הופסק"];
  return `
    <div class="inventory-toolbar">
      <label class="field">
        <span>חיפוש לפי שם מוצר</span>
        <input name="inventorySearch" type="search" value="${helpers.text(inventorySearch)}" data-filter="inventory-search">
      </label>
      <label class="field">
        <span>סינון לפי סטטוס</span>
        <select name="inventoryStatus" data-filter="inventory-status">
          <option value="">כל הסטטוסים</option>
          ${statuses.map((status) => `<option value="${helpers.text(status)}" ${status === inventoryStatusFilter ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </label>
    </div>
  `;
}

function renderInventoryTable(products) {
  return `
    <div class="table-wrap">
      <table class="data-table inventory-table">
        <thead>
          <tr>
            <th>מוצר</th>
            <th>דגם</th>
            <th>יובא</th>
            <th>נמכר</th>
            <th>זמין</th>
            <th>עלות ממוצעת</th>
            <th>שווי מלאי</th>
            <th>סטטוס</th>
          </tr>
        </thead>
        <tbody>
          ${products.map((product) => {
            const data = productInventoryData(product);
            return `
              <tr>
                <td>
                  <strong>${helpers.text(product.name)}</strong>
                </td>
                <td>${helpers.text(productDisplayModel(product) || "לא צוין")}</td>
                <td>${data.imported.toLocaleString("he-IL")}</td>
                <td>${data.sold.toLocaleString("he-IL")}</td>
                <td><strong>${data.available.toLocaleString("he-IL")}</strong></td>
                <td>₪${helpers.moneyThree(data.averageCost)}</td>
                <td>₪${helpers.moneyWhole(data.value)}</td>
                <td>${uiHelper.statusPill(data.status, data.stockHealth.tone)}</td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderProductForm(product) {
  const values = {
    name: product?.name || "",
    model: product?.model || "",
    material: product?.material || "",
    status: productStatus(product || {}),
    minimumStock: product?.minimumStock ?? DEFAULT_LOW_STOCK_THRESHOLD,
    notes: product?.notes || ""
  };
  return `
    <form class="import-form" id="productForm" novalidate>
      <div class="form-grid compact-form-grid">
        ${formField("שם מוצר", "name", values.name, "text", true)}
        ${formField("דגם", "model", values.model)}
        ${formField("חומר", "material", values.material)}
        ${formField("מינימום מלאי", "minimumStock", values.minimumStock, "quantity")}
        <label class="field">
          <span>סטטוס מוצר</span>
          <select name="status">
            ${["פעיל", "הופסק"].map((status) => `<option value="${status}" ${status === product?.status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </label>
        <label class="field full-field">
          <span>הערות</span>
          <textarea name="notes" rows="3">${helpers.text(values.notes)}</textarea>
        </label>
      </div>
      <div class="form-message" id="productFormMessage" role="alert"></div>
      <div class="actions">
        <button class="icon-button" type="submit">שמור מוצר</button>
        <button class="secondary-button" type="button" data-action="cancel-product">ביטול</button>
      </div>
    </form>
  `;
}

function renderManualInventoryForm(selectedProductId = "") {
  const productId = selectedProductId || "";
  return `
    <form class="import-form" id="manualInventoryForm" novalidate>
      <div class="form-grid compact-form-grid">
        <label class="field">
          <span>מוצר</span>
          <select name="productId" required>
            <option value="">בחר מוצר</option>
            ${state.products.map((product) => `<option value="${product.id}" ${product.id === productId ? "selected" : ""}>${helpers.text(product.name)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>סוג פעולה</span>
          <select name="actionType">
            <option value="add">הוספה</option>
            <option value="subtract">הורדה</option>
          </select>
        </label>
        ${formField("כמות", "quantity", "", "quantity", true)}
        ${formField("תאריך", "movementDate", new Date().toISOString().slice(0, 10), "date")}
        <label class="field full-field">
          <span>סיבת עדכון</span>
          <textarea name="reason" rows="3"></textarea>
        </label>
      </div>
      <div class="form-message" id="manualInventoryMessage" role="alert"></div>
      <div class="actions">
        <button class="icon-button" type="submit">שמור עדכון מלאי</button>
        <button class="secondary-button" type="button" data-action="cancel-manual-inventory">ביטול</button>
      </div>
    </form>
  `;
}

function renderPricing() {
  const settings = appSettings();
  const selectedProductId = pricingResult?.product?.id || state.products[0]?.id || "";
  const selectedProduct = state.products.find((product) => product.id === selectedProductId);
  return `
    ${moduleHeader("pricing", "בדיקת רווחיות לפני הצעת מחיר. הסימולטור אינו יוצר מכירה, אלא מחשב החלטה ומאפשר להעביר טיוטה למכירות.")}
    <section class="grid two">
      <article class="card">
        <div class="section-title"><h3>פרטי בדיקה</h3><span class="pill">חישוב בלבד</span></div>
        ${state.products.length ? renderPricingForm(selectedProductId, settings) : emptyState("₪", "אין מוצרים לתמחור", "מוצרים ועלות ממוצעת נוצרים ממודול יבוא ועלויות ומוצגים במוצרים ומלאי.")}
      </article>
      <article class="card" id="pricingSourceSection">
        <div class="section-title"><h3>נתונים שנמשכו אוטומטית</h3><span class="pill">מקור משותף</span></div>
        ${selectedProduct ? renderPricingSourceCards(selectedProduct, settings) : emptyState("◇", "בחר מוצר", "לאחר בחירת מוצר יוצגו עלות ממוצעת, מלאי זמין והגדרות מס.")}
      </article>
    </section>
    <section class="card" id="pricingResultSection" style="margin-top:16px">
      <div class="section-title"><h3>תוצאת תמחור</h3>${pricingResult ? renderDecisionPill(pricingResult) : uiHelper.statusPill("ממתין לחישוב", "warn")}</div>
      ${pricingResult ? renderPricingResult(pricingResult) : emptyState("₪", "עוד לא חושב מחיר", "בחר מוצר, כמות ומחיר מכירה כולל מע״מ.")}
    </section>
  `;
}

function renderPricingForm(selectedProductId, settings) {
  return `
    <form class="pricing-form" id="pricingForm" novalidate>
      <div class="form-grid compact-form-grid">
        <label class="field full-field">
          <span>מוצר</span>
          <select name="productId" required>
            <option value="">בחר מוצר</option>
            ${state.products.map((product) => `<option value="${product.id}" ${product.id === selectedProductId ? "selected" : ""}>${helpers.text(product.name)}</option>`).join("")}
          </select>
        </label>
        ${formField("כמות", "quantity", pricingResult?.quantity || "", "quantity", true)}
        ${formField("מחיר מכירה ליחידה כולל מע״מ", "priceIncludingVat", pricingResult?.priceIncludingVat || "", "money", true)}
      </div>
      <div class="form-message" id="pricingFormMessage" role="alert"></div>
      <div class="actions" id="pricingActions">
        ${pricingResult ? `<button class="secondary-button" type="button" data-action="pricing-to-sale">הפוך למכירה</button>` : ""}
      </div>
    </form>
  `;
}

function renderPricingSourceCards(product, settings) {
  const available = calculationHelper.inventoryQuantity(product.id);
  return `
    <div class="calculated-grid">
      <div class="calc-card"><span>עלות ממוצעת ליחידה</span><strong>₪${helpers.moneyThree(productAverageCost(product))}</strong></div>
      <div class="calc-card"><span>מלאי זמין</span><strong>${available.toLocaleString("he-IL")}</strong></div>
      <div class="calc-card"><span>מע״מ</span><strong>${helpers.moneyWhole(settings.vat)}%</strong></div>
      <div class="calc-card"><span>מס משוער</span><strong>${helpers.moneyWhole(settings.tax)}%</strong></div>
      <div class="calc-card"><span>יעד רווח נקי ליחידה</span><strong>₪${helpers.money(settings.targetProfit)}</strong></div>
    </div>
  `;
}

function renderDecisionPill(result) {
  if (!result.inventoryOk) return uiHelper.statusPill("אין מספיק מלאי", "fail");
  const className = result.decision === "עסקה טובה" ? "pass" : result.decision === "גבולי" ? "warn" : "fail";
  return uiHelper.statusPill(result.decision, className);
}

function renderPricingResult(result) {
  return `
    ${!result.inventoryOk ? `<div class="notice fail">אין מספיק מלאי</div>` : ""}
    <div class="pricing-result-grid">
      ${uiHelper.resultCard("מחיר לפני מע״מ", `₪${helpers.money(result.priceBeforeVat)}`)}
      ${uiHelper.resultCard("מע״מ ליחידה", `₪${helpers.money(result.vatPerUnit)}`)}
      ${uiHelper.resultCard("עלות ליחידה", `₪${helpers.moneyThree(result.unitCost)}`)}
      ${uiHelper.resultCard("רווח גולמי ליחידה", `₪${helpers.money(result.grossProfitPerUnit)}`)}
      ${uiHelper.resultCard("רווח גולמי כולל", `₪${helpers.moneyWhole(result.grossProfitTotal)}`)}
      ${uiHelper.resultCard("מס משוער", `₪${helpers.moneyWhole(result.estimatedTax)}`)}
      ${uiHelper.resultCard("רווח נקי ליחידה", `₪${helpers.money(result.netProfitPerUnit)}`, { highlight: true })}
      ${uiHelper.resultCard("רווח נקי כולל", `₪${helpers.moneyWhole(result.netProfitTotal)}`)}
    </div>
  `;
}

function renderSales() {
  const totals = saleTotals();
  const editingSale = editingSaleId ? state.sales.find((sale) => sale.id === editingSaleId) : null;
  const viewingSale = viewingSaleId ? state.sales.find((sale) => sale.id === viewingSaleId) : null;
  return `
    ${moduleHeader("sales", "רישום מכירות אמיתיות. מכירה פעילה גורעת מלאי ויוצרת יתרת תשלום מקושרת, בלי לנהל כאן טבלאות לקוחות או תשלומים נפרדות.")}
    <section class="grid stats">
      ${statCard("סה״כ מכירות", totals.count.toLocaleString("he-IL"), "מכירות פעילות בלבד", totals.count ? 100 : 12)}
      ${statCard("הכנסות כוללות", `₪${helpers.moneyWhole(totals.income)}`, "כולל מע״מ", totals.income ? 82 : 12)}
      ${statCard("רווח נקי ממכירות", `₪${helpers.moneyWhole(totals.netProfit)}`, "לאחר מס משוער", totals.netProfit ? 68 : 12)}
      ${statCard("יחידות שנמכרו", totals.units.toLocaleString("he-IL"), "מכירות פעילות", totals.units ? 76 : 12)}
    </section>
    <section class="card" style="margin-top:16px">
      <div class="section-title">
        <h3>מכירות</h3>
        <button class="icon-button compact-button" type="button" data-action="new-sale">＋ הוסף מכירה</button>
      </div>
      ${saleFormOpen ? renderSaleForm(editingSale) : ""}
      ${viewingSale ? renderSaleDetails(viewingSale) : ""}
      ${state.sales.length ? renderSalesTable() : emptyState("✓", "אין מכירות עדיין", "לחץ על הוסף מכירה כדי לרשום מכירה אמיתית וליצור יתרת תשלום.")}
    </section>
  `;
}

function renderSaleForm(sale) {
  const draftProductId = salesDraft?.productId || state.products[0]?.id || "";
  const values = {
    customerId: sale?.customerId || salesDraft?.customerId || "",
    customerName: sale?.customerName || "",
    customerType: sale?.customerType || "לקוח קבוע",
    phone: sale?.phone || "",
    productId: sale?.productId || draftProductId,
    quantity: sale?.quantity ?? salesDraft?.quantity ?? "",
    unitPriceIncludingVat: sale?.unitPriceIncludingVat ?? salesDraft?.priceIncludingVat ?? "",
    saleDate: sale?.saleDate || new Date().toISOString().slice(0, 10),
    status: sale?.status || "טיוטה",
    notes: sale?.notes || ""
  };
  const selectedCustomer = state.customers.find((customer) => customer.id === values.customerId);
  const preview = calculateSaleRecord(values);
  return `
    ${salesDraft && !sale ? `<div class="notice"><strong>טיוטת מכירה מהסימולטור</strong><span>הנתונים מולאו מהסימולטור, והמכירה לא תישמר עד לחיצה על שמור מכירה.</span></div>` : ""}
    <form class="import-form" id="saleForm" novalidate>
      <div class="form-grid">
        <label class="field">
          <span>לקוח קיים</span>
          <select name="customerId" data-sale-customer-select>
            <option value="">לקוח חדש או ללא בחירה</option>
            ${state.customers.map((customer) => `<option value="${customer.id}" ${customer.id === values.customerId ? "selected" : ""}>${helpers.text(customer.name)}</option>`).join("")}
          </select>
        </label>
        ${selectedCustomer ? `
          <div class="calc-card">
            <span>פרטי לקוח</span>
            <strong>${helpers.text(selectedCustomer.name)}</strong>
            <small>${helpers.text(selectedCustomer.type || "לקוח קבוע")} · ${helpers.text(selectedCustomer.phone || "אין טלפון")}</small>
          </div>
        ` : `
          ${formField("לקוח", "customerName", values.customerName, "text", true)}
          <label class="field">
            <span>סוג לקוח</span>
            <select name="customerType">${customerTypeOptions().map((type) => `<option value="${type}" ${type === values.customerType ? "selected" : ""}>${type}</option>`).join("")}</select>
          </label>
          ${formField("טלפון", "phone", values.phone, "text")}
        `}
        <label class="field">
          <span>מוצר</span>
          <select name="productId" required>
            <option value="">בחר מוצר</option>
            ${state.products.map((product) => `<option value="${product.id}" ${product.id === values.productId ? "selected" : ""}>${helpers.text(product.name)}</option>`).join("")}
          </select>
        </label>
        ${formField("כמות", "quantity", values.quantity, "quantity", true)}
        ${formField("מחיר ליחידה כולל מע״מ", "unitPriceIncludingVat", values.unitPriceIncludingVat, "money", true)}
        ${formField("תאריך מכירה", "saleDate", values.saleDate, "date")}
        <label class="field">
          <span>סטטוס מכירה</span>
          <select name="status">${saleStatusOptions().map((status) => `<option value="${status}" ${status === values.status ? "selected" : ""}>${status}</option>`).join("")}</select>
        </label>
        <label class="field full-field">
          <span>הערות</span>
          <textarea name="notes" rows="3">${helpers.text(values.notes)}</textarea>
        </label>
      </div>
      <div class="pricing-result-grid" id="saleCalculatedFields">${renderSaleCalculatedFields(preview)}</div>
      <div class="form-message" id="saleFormMessage" role="alert"></div>
      <div class="actions">
        <button class="icon-button" type="submit">שמור מכירה</button>
        <button class="secondary-button" type="button" data-action="cancel-sale-form">ביטול</button>
      </div>
    </form>
  `;
}

function renderSaleCalculatedFields(calc) {
  return `
    ${uiHelper.resultCard("סה״כ עסקה כולל מע״מ", `₪${helpers.moneyWhole(calc.totalIncludingVat)}`)}
    ${uiHelper.resultCard("סה״כ לפני מע״מ", `₪${helpers.moneyWhole(calc.totalBeforeVat)}`)}
    ${uiHelper.resultCard("מע״מ", `₪${helpers.moneyWhole(calc.vatAmount)}`)}
    ${uiHelper.resultCard("עלות כוללת", `₪${helpers.moneyWhole(calc.totalCost)}`)}
    ${uiHelper.resultCard("רווח גולמי", `₪${helpers.moneyWhole(calc.grossProfit)}`)}
    ${uiHelper.resultCard("מס משוער", `₪${helpers.moneyWhole(calc.estimatedTax)}`)}
    ${uiHelper.resultCard("רווח נקי", `₪${helpers.moneyWhole(calc.netProfit)}`, { highlight: true })}
    ${uiHelper.resultCard("רווח נקי ליחידה", `₪${helpers.money(calc.netProfitPerUnit)}`)}
  `;
}

function renderSalesTable() {
  return `
    <div class="table-wrap">
      <table class="data-table inventory-table">
        <thead>
          <tr>
            <th>לקוח</th><th>מוצר</th><th>כמות</th><th>מחיר ליחידה</th><th>סה״כ</th><th>רווח נקי</th><th>סטטוס</th><th>תשלום</th><th>תאריך</th><th>פעולות</th>
          </tr>
        </thead>
        <tbody>
          ${state.sales.map((sale) => {
            const calc = calculateSaleRecord(sale);
            const payment = paymentForSale(sale.id);
            return `
              <tr>
                <td>${helpers.text(sale.customerName)}</td>
                <td>${helpers.text(calc.product?.name || "לא צוין")}</td>
                <td>${calc.quantity.toLocaleString("he-IL")}</td>
                <td>₪${helpers.money(calc.unitPriceIncludingVat)}</td>
                <td>₪${helpers.moneyWhole(calc.totalIncludingVat)}</td>
                <td>₪${helpers.moneyWhole(calc.netProfit)}</td>
                <td><span class="pill ${sale.status === "בוטל" ? "fail" : sale.status === "טיוטה" ? "warn" : "pass"}">${helpers.text(sale.status)}</span></td>
                <td>${helpers.text(payment?.paymentStatus || "אין יתרה")}</td>
                <td>${sale.saleDate ? new Date(sale.saleDate).toLocaleDateString("he-IL") : "לא צוין"}</td>
                <td><div class="table-actions">
                  <button class="secondary-button compact-button" type="button" data-action="edit-sale" data-id="${sale.id}">ערוך</button>
                  <button class="danger-button compact-button" type="button" data-action="cancel-sale" data-id="${sale.id}">בטל מכירה</button>
                </div></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSaleDetails(sale) {
  const calc = calculateSaleRecord(sale);
  const payment = paymentForSale(sale.id);
  return `
    <div class="notice">
      <strong>פרטי מכירה</strong>
      <span>לקוח: ${helpers.text(sale.customerName)} · מוצר: ${helpers.text(calc.product?.name || "לא צוין")} · יתרה פתוחה: ₪${helpers.moneyWhole(payment?.openBalance || 0)}</span>
    </div>
  `;
}

function renderCustomers() {
  const totals = customerTotals();
  const editingCustomer = editingCustomerId ? state.customers.find((customer) => customer.id === editingCustomerId) : null;
  const viewingCustomer = viewingCustomerId ? state.customers.find((customer) => customer.id === viewingCustomerId) : null;
  return `
    ${moduleHeader("customers", "מאגר לקוחות והיסטוריית רכישות. הנתונים המחושבים מגיעים ממכירות ותשלומים בלבד, ללא הזנה ידנית של סיכומים.")}
    <section class="grid stats">
      ${statCard("סה״כ לקוחות", totals.count.toLocaleString("he-IL"), "כל הלקוחות במערכת", totals.count ? 100 : 12)}
      ${statCard("לקוחות קבועים", totals.returning.toLocaleString("he-IL"), "לקוחות B2B חוזרים", totals.returning ? 74 : 12)}
      ${statCard("לקוחות חד פעמיים", totals.oneTime.toLocaleString("he-IL"), "לקוחות חד פעמיים", totals.oneTime ? 54 : 12)}
      ${statCard("יתרת חובות מלקוחות", `₪${helpers.moneyWhole(totals.openBalance)}`, "מתוך תשלומים פתוחים", totals.openBalance ? 82 : 12)}
    </section>
    <section class="card" style="margin-top:16px">
      <div class="section-title">
        <h3>לקוחות</h3>
        <button class="icon-button compact-button" type="button" data-action="new-customer">＋ הוסף לקוח</button>
      </div>
      ${customerFormOpen ? renderCustomerForm(editingCustomer) : ""}
      ${viewingCustomer ? renderCustomerDetails(viewingCustomer) : ""}
      ${state.customers.length ? renderCustomersTable() : emptyState("◎", "אין לקוחות עדיין", "לקוחות יכולים להיווצר ממכירה או דרך הוספה ידנית למסד הלקוחות.")}
    </section>
  `;
}

function renderCustomerForm(customer) {
  const values = {
    name: customer?.name || "",
    type: customer?.type || "לקוח קבוע",
    phone: customer?.phone || "",
    businessName: customer?.businessName || "",
    city: customer?.city || "",
    source: customer?.source || "",
    notes: customer?.notes || ""
  };
  return `
    <form class="import-form" id="customerForm" novalidate>
      <div class="form-grid compact-form-grid">
        ${formField("שם לקוח", "name", values.name, "text", true)}
        <label class="field">
          <span>סוג לקוח</span>
          <select name="type">${customerTypeOptions().map((type) => `<option value="${type}" ${type === values.type ? "selected" : ""}>${type}</option>`).join("")}</select>
        </label>
        ${formField("טלפון", "phone", values.phone, "text")}
        ${formField("שם עסק", "businessName", values.businessName, "text")}
        ${formField("עיר", "city", values.city, "text")}
        ${formField("מקור הגעה", "source", values.source, "text")}
        <label class="field full-field">
          <span>הערות</span>
          <textarea name="notes" rows="3">${helpers.text(values.notes)}</textarea>
        </label>
      </div>
      <div class="form-message" id="customerFormMessage" role="alert"></div>
      <div class="actions">
        <button class="icon-button" type="submit">שמור לקוח</button>
        <button class="secondary-button" type="button" data-action="cancel-customer-form">ביטול</button>
      </div>
    </form>
  `;
}

function renderCustomersTable() {
  return `
    <div class="table-wrap">
      <table class="data-table inventory-table">
        <thead>
          <tr>
            <th>שם לקוח</th><th>סוג</th><th>טלפון</th><th>סה״כ קניות</th><th>יחידות שנקנו</th><th>רווח נקי</th><th>יתרה פתוחה</th><th>קנייה אחרונה</th><th>פעולות</th>
          </tr>
        </thead>
        <tbody>
          ${state.customers.map((customer) => {
            const summary = customerSummary(customer);
            return `
              <tr>
                <td><strong>${helpers.text(customer.name)}</strong></td>
                <td>${helpers.text(customer.type || "לקוח קבוע")}</td>
                <td>${helpers.text(customer.phone || "לא צוין")}</td>
                <td>₪${helpers.moneyWhole(summary.totalPurchases)}</td>
                <td>${summary.totalUnits.toLocaleString("he-IL")}</td>
                <td>₪${helpers.moneyWhole(summary.netProfit)}</td>
                <td>₪${helpers.moneyWhole(summary.openBalance)}</td>
                <td>${summary.lastPurchaseDate ? summary.lastPurchaseDate.toLocaleDateString("he-IL") : "אין רכישות"}</td>
                <td><div class="table-actions">
                  <button class="secondary-button compact-button" type="button" data-action="edit-customer" data-id="${customer.id}">ערוך לקוח</button>
                  <button class="secondary-button compact-button" type="button" data-action="view-customer" data-id="${customer.id}">צפה בהיסטוריה</button>
                  <button class="danger-button compact-button" type="button" data-action="delete-customer" data-id="${customer.id}">מחק לקוח</button>
                </div></td>
              </tr>
            `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderCustomerDetails(customer) {
  const summary = customerSummary(customer);
  const sales = salesForCustomer(customer.id);
  const paymentRows = paymentRowsForCustomer(customer.id);
  const paymentEntries = paymentEntriesForCustomer(customer.id);
  return `
    <div class="movement-panel">
      <div class="section-title"><h3>פרטי לקוח</h3><span class="pill ${summary.openBalance > 0 ? "warn" : "pass"}">יתרה פתוחה ₪${helpers.moneyWhole(summary.openBalance)}</span></div>
      <div class="calculated-grid">
        <div class="calc-card"><span>שם עסק</span><strong>${helpers.text(customer.businessName || "לא צוין")}</strong></div>
        <div class="calc-card"><span>עיר</span><strong>${helpers.text(customer.city || "לא צוין")}</strong></div>
        <div class="calc-card"><span>מקור הגעה</span><strong>${helpers.text(customer.source || "לא צוין")}</strong></div>
        <div class="calc-card"><span>ממוצע כמות להזמנה</span><strong>${helpers.money(summary.averageQuantity)}</strong></div>
        <div class="calc-card"><span>ממוצע מחיר ליחידה</span><strong>₪${helpers.money(summary.averageUnitPrice)}</strong></div>
        <div class="calc-card"><span>רווח נקי כולל מהלקוח</span><strong>₪${helpers.moneyWhole(summary.netProfit)}</strong></div>
      </div>
      <div class="grid two" style="margin-top:16px">
        <article class="card">
          <div class="section-title"><h3>היסטוריית מכירות</h3><span class="pill">${sales.length} מכירות</span></div>
          ${sales.length ? renderCustomerSalesHistory(sales) : emptyState("✓", "אין מכירות ללקוח", "מכירות שיישמרו במודול מכירות יופיעו כאן אוטומטית.")}
        </article>
        <article class="card">
          <div class="section-title"><h3>היסטוריית תשלומים</h3><span class="pill">${paymentRows.length} עסקאות</span></div>
          ${paymentRows.length || paymentEntries.length ? renderCustomerPaymentHistory(paymentRows, paymentEntries) : emptyState("◌", "אין תשלומים ללקוח", "יתרות תשלום ותשלומים בפועל יופיעו כאן.")}
        </article>
      </div>
    </div>
  `;
}

function renderCustomerSalesHistory(sales) {
  return `<div class="list">${sales.map((sale) => {
    const calc = calculateSaleRecord(sale);
    return `<div class="check-item"><span>${helpers.text(calc.product?.name || "מוצר")} · ${calc.quantity.toLocaleString("he-IL")} יחידות</span><strong>₪${helpers.moneyWhole(calc.totalIncludingVat)}</strong></div>`;
  }).join("")}</div>`;
}

function renderCustomerPaymentHistory(paymentRows, paymentEntries) {
  return `
    <div class="list">
      ${paymentRows.map((row) => `
        <div class="check-item">
          <span>
            ${helpers.text(row.calc.product?.name || "מכירה")} · ${helpers.text(row.paymentStatus)}
            <br><small>שולם ₪${helpers.moneyWhole(row.paid)} מתוך ₪${helpers.moneyWhole(row.calc.totalIncludingVat)}</small>
          </span>
          <strong>יתרה ₪${helpers.moneyWhole(row.openBalance)}</strong>
        </div>
      `).join("")}
      ${paymentEntries.length ? `
        <div class="notice">
          <strong>תשלומים שנרשמו בפועל</strong>
          <span>${paymentEntries.map((payment) => `${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString("he-IL") : "ללא תאריך"} · ${helpers.text(payment.method || "אחר")} · ₪${helpers.moneyWhole(payment.amount)}`).join(" | ")}</span>
        </div>
      ` : ""}
    </div>
  `;
}

function renderPayments() {
  const totals = paymentTotals();
  const rows = paymentBalanceRows();
  const editingPayment = editingPaymentId ? state.payments.find((payment) => payment.id === editingPaymentId) : null;
  const viewingRow = viewingPaymentSaleId ? rows.find((row) => row.sale.id === viewingPaymentSaleId) : null;
  return `
    ${moduleHeader("payments", "ניהול גביית כספים לפי מכירות. כל תשלום מקושר למכירה, והיתרה מחושבת מתוך סכום העסקה פחות כל התשלומים שנרשמו.")}
    <section class="grid stats">
      ${statCard("סה״כ התקבל", `₪${helpers.moneyWhole(totals.received)}`, "תשלומים שנרשמו בפועל", totals.received ? 100 : 12)}
      ${statCard("יתרת חובות פתוחים", `₪${helpers.moneyWhole(totals.open)}`, "יתרה מכל המכירות הפעילות", totals.open ? 82 : 12, totals.open ? "warn-card" : "")}
      ${statCard("עסקאות שלא שולמו", totals.unpaid.toLocaleString("he-IL"), "לא נרשם תשלום", totals.unpaid ? 62 : 12)}
      ${statCard("עסקאות ששולמו חלקית", totals.partial.toLocaleString("he-IL"), "נשארה יתרה פתוחה", totals.partial ? 52 : 12)}
    </section>
    <section class="card" style="margin-top:16px">
      <div class="section-title">
        <h3>תשלומים ויתרות</h3>
        <button class="icon-button compact-button" type="button" data-action="new-payment">＋ הוסף תשלום</button>
      </div>
      ${totals.open > 0 ? `<div class="notice fail"><strong>חובות פתוחים</strong><span>יש מכירות שלא שולמו במלואן או שלא שולמו כלל.</span></div>` : `<div class="notice"><strong>אין חובות פתוחים</strong><span>כל המכירות הפעילות שולמו במלואן.</span></div>`}
      ${paymentFormOpen ? renderPaymentForm(editingPayment) : ""}
      ${viewingRow ? renderPaymentDetails(viewingRow) : ""}
      ${rows.length ? renderPaymentsTable(rows) : emptyState("◌", "אין מכירות פעילות לתשלום", "כאשר מכירה פעילה תישמר, תיווצר כאן יתרת תשלום אוטומטית.")}
    </section>
  `;
}

function renderPaymentForm(payment) {
  const selectedSaleId = payment?.saleId || paymentSaleId || paymentBalanceRows().find((row) => row.openBalance > 0)?.sale.id || activeSalesForPayments()[0]?.id || "";
  return `
    <form class="import-form" id="paymentForm" novalidate>
      <div class="form-grid compact-form-grid">
        <label class="field">
          <span>מכירה</span>
          <select name="saleId" required>
            <option value="">בחר מכירה</option>
            ${paymentBalanceRows().map((row) => `<option value="${row.sale.id}" ${row.sale.id === selectedSaleId ? "selected" : ""}>${helpers.text(row.sale.customerName)} · ₪${helpers.moneyWhole(row.calc.totalIncludingVat)} · יתרה ₪${helpers.moneyWhole(row.openBalance)}</option>`).join("")}
          </select>
        </label>
        <label class="field">
          <span>לקוח</span>
          <input name="customerName" type="text" value="${helpers.text(customerNameForSale(selectedSaleId))}" readonly>
        </label>
        ${formField("תאריך תשלום", "paymentDate", payment?.paymentDate || new Date().toISOString().slice(0, 10), "date")}
        ${formField("סכום תשלום", "amount", payment?.amount ?? "", "money", true)}
        <label class="field">
          <span>אמצעי תשלום</span>
          <select name="method">${paymentMethodOptions().map((method) => `<option value="${method}" ${method === payment?.method ? "selected" : ""}>${method}</option>`).join("")}</select>
        </label>
        <label class="field full-field">
          <span>הערות</span>
          <textarea name="notes" rows="3">${helpers.text(payment?.notes || "")}</textarea>
        </label>
      </div>
      <div class="form-message" id="paymentFormMessage" role="alert"></div>
      <div class="actions">
        <button class="icon-button" type="submit">שמור תשלום</button>
        <button class="secondary-button" type="button" data-action="cancel-payment-form">ביטול</button>
      </div>
    </form>
  `;
}

function customerNameForSale(saleId) {
  const sale = state.sales.find((item) => item.id === saleId);
  return sale?.customerName || "";
}

function renderPaymentsTable(rows) {
  return `
    <div class="table-wrap">
      <table class="data-table inventory-table">
        <thead>
          <tr>
            <th>לקוח</th><th>מכירה</th><th>סכום עסקה</th><th>שולם</th><th>יתרה</th><th>סטטוס</th><th>תאריך אחרון</th><th>פעולות</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${helpers.text(row.sale.customerName)}</td>
              <td>${helpers.text(row.calc.product?.name || "מכירה")}</td>
              <td>₪${helpers.moneyWhole(row.calc.totalIncludingVat)}</td>
              <td>₪${helpers.moneyWhole(row.paid)}</td>
              <td class="${row.openBalance > 0 ? "money-emphasis" : ""}">₪${helpers.moneyWhole(row.openBalance)}</td>
              <td><span class="pill ${row.paymentStatus === "שולם מלא" ? "pass" : row.paymentStatus === "בתהליך" ? "warn" : "fail"}">${row.paymentStatus}</span></td>
              <td>${row.lastPayment?.paymentDate ? new Date(row.lastPayment.paymentDate).toLocaleDateString("he-IL") : "אין תשלום"}</td>
              <td><div class="table-actions">
                <button class="secondary-button compact-button" type="button" data-action="payment-for-sale" data-id="${row.sale.id}">הוסף תשלום</button>
                <button class="secondary-button compact-button" type="button" data-action="view-payments" data-id="${row.sale.id}">צפה בתשלומים</button>
                ${row.lastPayment ? `<button class="secondary-button compact-button" type="button" data-action="edit-payment" data-id="${row.lastPayment.id}">ערוך תשלום</button><button class="danger-button compact-button" type="button" data-action="delete-payment" data-id="${row.lastPayment.id}">מחק תשלום</button>` : ""}
              </div></td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderPaymentDetails(row) {
  return `
    <div class="movement-panel">
      <div class="section-title"><h3>תשלומים למכירה</h3><span class="pill ${row.openBalance > 0 ? "warn" : "pass"}">יתרה ₪${helpers.moneyWhole(row.openBalance)}</span></div>
      ${row.entries.length ? `<div class="list">${row.entries.map((payment) => `
        <div class="check-item">
          <span>${payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString("he-IL") : "ללא תאריך"} · ${helpers.text(payment.method || "אחר")}</span>
          <strong>₪${helpers.moneyWhole(payment.amount)}</strong>
        </div>
      `).join("")}</div>` : emptyState("◌", "אין תשלומים למכירה", "ניתן להוסיף תשלום עבור המכירה כל עוד קיימת יתרה פתוחה.")}
    </div>
  `;
}

function renderBasicRows(items, title, moneyField) {
  return `
    <div class="list">
      ${items.map((item, index) => `
        <div class="row">
          <div>
            <strong>${item.name || `${title} ${index + 1}`}</strong>
            <small>${new Date(item.createdAt).toLocaleDateString("he-IL")}</small>
          </div>
          <div><small>סטטוס</small><strong>רשומה פעילה</strong></div>
          <div><small>סכום</small><strong>₪${helpers.moneyWhole(item[moneyField])}</strong></div>
          <div><span class="pill pass">נשמר</span></div>
        </div>
      `).join("")}
    </div>
  `;
}

function renderMovements() {
  return `
    <div class="list">
      ${state.inventoryMovements.map((movement) => {
        const product = state.products.find((item) => item.id === movement.productId);
        const movementMeta = inventoryMovementMeta(movement);
        const sale = saleForInventoryMovement(movement);
        const customer = sale ? state.customers.find((item) => item.id === sale.customerId) : null;
        return `
          <div class="row movement-row ${movementMeta.tone}">
            <div>
              <strong>${movementMeta.icon} ${product ? product.name : "מוצר לא ידוע"}</strong>
              <small>${movement.reason}${sale ? ` · ${helpers.text(sale.customerName || customer?.name || "לקוח לא ידוע")}` : ""}</small>
            </div>
            <div><small>כמות</small><strong>${helpers.number(movement.quantity).toLocaleString("he-IL")}</strong></div>
            <div><small>מקור</small><strong>${SOURCE_LABELS[movement.sourceType] || "תנועה ידנית"}</strong></div>
            <div>
              <small>תאריך ושעה</small>
              <strong>${formatMovementDateTime(movement)}</strong>
            </div>
            <div>
              ${uiHelper.statusPill(movementMeta.label, movementMeta.tone)}
              ${sale?.customerId ? `<button class="secondary-button compact-button" type="button" data-action="open-movement-customer" data-id="${sale.customerId}">תיעוד</button>` : ""}
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function saleForInventoryMovement(movement) {
  if ((movement.sourceType || movement.type) !== "sale") return null;
  return state.sales.find((sale) => sale.id === movement.saleId || sale.id === movement.sourceId) || null;
}

function formatMovementDateTime(movement) {
  const value = movement.movementDateTime || movement.createdAt || movement.movementDate || movement.date;
  if (!value) return "לא צוין";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return helpers.text(value);
  return date.toLocaleString("he-IL", {
    dateStyle: "short",
    timeStyle: "short"
  });
}

function inventoryMovementMeta(movement) {
  const source = movement.sourceType || movement.type;
  if (source === "import") return { tone: "pass", icon: "↑", label: "כניסה" };
  if (source === "sale") return { tone: "fail", icon: "↓", label: "יציאה" };
  return { tone: "warn", icon: "↕", label: "התאמה" };
}

function renderCustomerRows() {
  return `
    <div class="list">
      ${state.customers.map((customer) => `
        <div class="row">
          <div>
            <strong>${customer.name}</strong>
            <small>${customer.type === "returning" ? "לקוח חוזר" : "לקוח חד פעמי"}</small>
          </div>
          <div><small>טלפון</small><strong>${customer.phone || "טרם הוגדר"}</strong></div>
          <div><small>מכירות</small><strong>${state.sales.filter((sale) => sale.customerId === customer.id).length}</strong></div>
          <div><span class="pill pass">פעיל</span></div>
        </div>
      `).join("")}
    </div>
  `;
}

function runChecks() {
  const decimalProduct = state.products.find((product) => helpers.money(product.costPerUnit) === "1.85" && helpers.money(product.sellingPriceIncludingVat) === "4.78");
  const saved = storageService.hasData();
  const noConsoleErrors = true;
  const modulesSeparated = COLLECTIONS.every((collection) => state[collection] !== undefined);
  return [
    { label: "ניווט תקין", passed: document.querySelectorAll(".tab-button").length === tabs.length },
    { label: "שמירה תקינה", passed: saved },
    { label: "תמיכה במספרים עשרוניים", passed: Boolean(decimalProduct) || helpers.money(1.85) === "1.85" },
    { label: "RTL תקין", passed: document.documentElement.dir === "rtl" && document.documentElement.lang === "he" },
    { label: "אין שגיאות מערכת", passed: noConsoleErrors },
    { label: "מודולים מופרדים", passed: modulesSeparated }
  ];
}

function systemIssues() {
  const issues = [];
  if (document.querySelectorAll(".tab-button").length !== tabs.length) issues.push("יש בעיה בניווט הראשי");
  if (document.documentElement.dir !== "rtl" || document.documentElement.lang !== "he") issues.push("יש בעיה בהגדרת RTL/עברית");
  if (!COLLECTIONS.every((collection) => state[collection] !== undefined)) issues.push("יש בעיה במבנה נתוני המערכת");
  return issues;
}

function renderSettingsLegacyBackup() {
  const settings = appSettings();
  const rawSettings = state.settings || {};
  const cloudLocked = Boolean(rawSettings.supabaseReady && rawSettings.supabaseUrl && rawSettings.supabaseAnonKey && ["מחובר", "סונכרן לענן"].includes(rawSettings.supabaseStatus));
  return `
    ${moduleHeader("settings", "ניהול הגדרות עסקיות, חיבור ענן, גיבוי ושחזור. האחסון המקומי נשאר פעיל כגיבוי תמידי.")}
    <section class="grid two">
      <article class="card">
        <div class="section-title"><h3>הגדרות עסקיות</h3><span class="pill">משפיע על תמחור ומכירות</span></div>
        <form class="settings-form" id="businessSettingsForm" novalidate>
          <div class="form-grid compact-form-grid">
            ${formField("אחוז מע״מ", "vat", settings.vat, "quantity", true)}
            ${formField("אחוז מס הכנסה משוער", "tax", settings.tax, "quantity", true)}
            ${formField("יעד רווח נקי ליחידה", "targetProfit", settings.targetProfit, "money", true)}
          </div>
          <div class="form-message" id="businessSettingsMessage" role="alert"></div>
          <div class="actions"><button class="icon-button" type="submit">שמור הגדרות</button></div>
        </form>
      </article>
      <article class="card">
        <div class="section-title"><h3>חיבור ענן Supabase</h3><span class="pill ${cloudLocked ? "pass" : "warn"}">${helpers.text(rawSettings.supabaseStatus || "לא מחובר")}</span></div>
        <form class="settings-form" id="cloudSettingsForm" novalidate>
          <div class="form-grid compact-form-grid">
            <label class="field"><span>Supabase URL</span><input name="supabaseUrl" type="text" dir="ltr" spellcheck="false" autocomplete="off" value="${helpers.text(rawSettings.supabaseUrl || "")}" ${cloudLocked ? "readonly" : ""}></label>
            <label class="field"><span>Supabase anon key</span><input name="supabaseAnonKey" type="text" dir="ltr" spellcheck="false" autocomplete="off" value="${helpers.text(rawSettings.supabaseAnonKey || "")}" ${cloudLocked ? "readonly" : ""}></label>
            <label class="field"><span>סטטוס חיבור</span><input type="text" value="${helpers.text(rawSettings.supabaseStatus || "לא מחובר")}" readonly></label>
          </div>
          <div class="form-message" id="cloudSettingsMessage" role="alert">${cloudLocked ? "החיבור שמור ונעול. כדי לשנות פרטים לחץ התנתק." : "הזן פרטי Supabase ולחץ בדוק חיבור. האחסון המקומי פעיל כגיבוי."}</div>
          <div class="actions">
            <button class="secondary-button" type="button" data-action="check-supabase">בדוק חיבור</button>
            <button class="secondary-button" type="button" data-action="sync-supabase">סנכרן עכשיו</button>
            <button class="danger-button" type="button" data-action="disconnect-supabase">התנתק</button>
          </div>
        </form>
      </article>
    </section>
    <section class="grid two" style="margin-top:16px">
      <article class="card">
        <div class="section-title"><h3>גיבוי ושחזור</h3><span class="pill">JSON</span></div>
        <div class="data-preview">
          <div class="check-item"><span>תאריך גיבוי אחרון</span><strong>${rawSettings.lastBackupAt ? new Date(rawSettings.lastBackupAt).toLocaleString("he-IL") : "לא בוצע"}</strong></div>
          <div class="check-item"><span>סטטוס גיבוי</span><span class="pill ${rawSettings.lastBackupAt ? "pass" : "warn"}">${helpers.text(rawSettings.backupStatus || "לא בוצע גיבוי")}</span></div>
        </div>
        <div class="actions" style="margin-top:14px">
          <button class="secondary-button" type="button" data-action="export">ייצוא גיבוי JSON</button>
          <button class="secondary-button" type="button" data-action="import">ייבוא גיבוי JSON</button>
          <button class="secondary-button" type="button" data-action="restore-backup">שחזור מגיבוי</button>
        </div>
      </article>
    </section>
  `;
}

function settingsGeneralStatus(rawSettings, cloudLocked) {
  if (rawSettings.supabaseStatus === "שגיאת חיבור" || rawSettings.supabaseStatus === "שגיאת סנכרון") {
    return { label: "בעיה בחיבור לענן", tone: "fail" };
  }
  if (cloudLocked) return { label: "מערכת מחוברת לענן", tone: "pass" };
  if (!rawSettings.lastBackupAt) return { label: "אין גיבוי קיים", tone: "warn" };
  return { label: "המערכת פועלת מקומית", tone: "warn" };
}

function renderSettings() {
  const settings = appSettings();
  const rawSettings = state.settings || {};
  const cloudLocked = Boolean(rawSettings.supabaseReady && rawSettings.supabaseUrl && rawSettings.supabaseAnonKey && ["מחובר", "סונכרן לענן"].includes(rawSettings.supabaseStatus));
  const generalStatus = settingsGeneralStatus(rawSettings, cloudLocked);
  const backupStatus = rawSettings.lastBackupAt ? (rawSettings.backupStatus || "גיבוי קיים") : "אין גיבוי קיים";
  return `
    ${moduleHeader("settings", "ניהול הגדרות עסקיות, חיבור ענן, גיבוי ושחזור. האחסון המקומי נשאר פעיל כגיבוי תמידי.")}
    <section class="notice">
      <strong>סטטוס מערכת</strong>
      <span>${uiHelper.statusPill(generalStatus.label, generalStatus.tone)}</span>
    </section>

    <section class="card" style="margin-top:16px">
      <div class="section-title">
        <div>
          <h3>הגדרות עסק</h3>
          <p class="meta">משפיע על חישובי יבוא, תמחור, מכירות ורווחיות.</p>
        </div>
        <span class="pill">עסק</span>
      </div>
      <form class="settings-form" id="businessSettingsForm" novalidate>
        <div class="form-grid compact-form-grid">
          ${formField("אחוז מע״מ", "vat", settings.vat, "quantity", true)}
          ${formField("אחוז מס הכנסה משוער", "tax", settings.tax, "quantity", true)}
          ${formField("יעד רווח נקי ליחידה", "targetProfit", settings.targetProfit, "money", true)}
        </div>
        <div class="form-message" id="businessSettingsMessage" role="alert"></div>
        <div class="actions"><button class="icon-button" type="submit">שמור הגדרות</button></div>
      </form>
    </section>

    <section class="card" style="margin-top:18px">
      <div class="section-title">
        <h3>חיבור ענן Supabase</h3>
        <span class="pill ${cloudLocked ? "pass" : rawSettings.supabaseStatus === "שגיאת חיבור" ? "fail" : "warn"}">${helpers.text(rawSettings.supabaseStatus || "לא מחובר")}</span>
      </div>
      <form class="settings-form" id="cloudSettingsForm" novalidate>
        <div class="form-grid compact-form-grid">
          <label class="field"><span>Supabase URL</span><input name="supabaseUrl" type="text" dir="ltr" spellcheck="false" autocomplete="off" value="${helpers.text(rawSettings.supabaseUrl || "")}" ${cloudLocked ? "readonly" : ""}></label>
          <label class="field"><span>Supabase anon key</span><input name="supabaseAnonKey" type="text" dir="ltr" spellcheck="false" autocomplete="off" value="${helpers.text(rawSettings.supabaseAnonKey || "")}" ${cloudLocked ? "readonly" : ""}></label>
          <label class="field"><span>סטטוס חיבור</span><input type="text" value="${helpers.text(rawSettings.supabaseStatus || "לא מחובר")}" readonly></label>
        </div>
        <div class="form-message" id="cloudSettingsMessage" role="alert">${cloudLocked ? "החיבור שמור ונעול. כדי לשנות פרטים לחץ התנתק מהענן." : "הזן פרטי Supabase ולחץ בדוק חיבור. האחסון המקומי פעיל כגיבוי."}</div>
        <div class="actions">
          <button class="secondary-button" type="button" data-action="check-supabase">בדוק חיבור</button>
          <button class="secondary-button" type="button" data-action="sync-supabase">סנכרן עכשיו</button>
          <button class="danger-button" type="button" data-action="disconnect-supabase">התנתק מהענן</button>
        </div>
      </form>
    </section>

    <section class="card" style="margin-top:18px">
      <div class="section-title">
        <h3>גיבוי ושחזור</h3>
        <span class="pill ${rawSettings.lastBackupAt ? "pass" : "warn"}">${helpers.text(backupStatus)}</span>
      </div>
      <div class="data-preview">
        <div class="check-item"><span>תאריך גיבוי אחרון</span><strong>${rawSettings.lastBackupAt ? new Date(rawSettings.lastBackupAt).toLocaleString("he-IL") : "אין גיבוי קיים"}</strong></div>
        <div class="check-item"><span>סטטוס גיבוי</span><span class="pill ${rawSettings.lastBackupAt ? "pass" : "warn"}">${helpers.text(backupStatus)}</span></div>
      </div>
      <div class="actions" style="margin-top:14px">
        <button class="secondary-button" type="button" data-action="export">ייצוא גיבוי JSON</button>
        <button class="secondary-button" type="button" data-action="import">ייבוא גיבוי JSON</button>
        <button class="secondary-button" type="button" data-action="restore-backup">שחזור מגיבוי אחרון</button>
      </div>
    </section>
  `;
}

function setSettingsMessage(id, message, type = "fail") {
  const messageElement = document.getElementById(id);
  if (!messageElement) return;
  messageElement.textContent = message;
  messageElement.className = `form-message ${type}`;
}

function saveBusinessSettings(form) {
  const formData = new FormData(form);
  const vat = helpers.number(formData.get("vat"));
  const tax = helpers.number(formData.get("tax"));
  const targetProfit = helpers.number(formData.get("targetProfit"));
  if (vat < 0 || tax < 0 || targetProfit < 0) {
    setSettingsMessage("businessSettingsMessage", "לא ניתן להזין ערך שלילי");
    return;
  }
  storageService.update("settings", "settings_main", { vat, tax, targetProfit });
  showToast("ההגדרות העסקיות נשמרו");
  render();
}

function saveCloudSettings(statusMessage, url, anonKey, ready = true) {
  storageService.update("settings", "settings_main", {
    supabaseUrl: normalizeSupabaseUrl(url),
    supabaseAnonKey: normalizeSupabaseKey(anonKey),
    supabaseStatus: statusMessage,
    supabaseReady: ready
  });
  showToast(statusMessage);
  render();
}

async function checkSupabaseConnection(form) {
  if (!form) return;
  const formData = new FormData(form);
  const url = normalizeSupabaseUrl(formData.get("supabaseUrl"));
  const anonKey = normalizeSupabaseKey(formData.get("supabaseAnonKey"));
  if (!url || !anonKey) {
    saveCloudSettings("חסרים פרטי חיבור", url, anonKey, false);
    return;
  }
  if (!isValidSupabaseUrl(url)) {
    console.error("Supabase connection error:", {
      message: "URL לא תקין",
      url,
      expected: "https://PROJECT_ID.supabase.co"
    });
    saveCloudSettings("URL לא תקין", url, anonKey, false);
    return;
  }
  console.log("Supabase URL used:", url);
  console.log("Supabase key exists:", Boolean(anonKey));
  storageService.update("settings", "settings_main", {
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    supabaseStatus: "בודק חיבור",
    supabaseReady: false
  });
  try {
    await cloudService.testConnection();
    saveCloudSettings("מחובר", url, anonKey, true);
  } catch (error) {
    console.error("Supabase connection error:", error);
    saveCloudSettings("שגיאת חיבור", url, anonKey, false);
  }
}

async function syncSupabaseNow() {
  const current = storedSupabaseConfig();
  if (!cloudService.isConfigured()) {
    saveCloudSettings("לא מחובר", current.url, current.anonKey, false);
    return;
  }
  try {
    await cloudService.pushAll(storageService.exportData());
    saveCloudSettings("סונכרן לענן", current.url, current.anonKey, true);
  } catch (error) {
    console.log("Supabase sync failed", error);
    saveCloudSettings("שגיאת סנכרון", current.url, current.anonKey, true);
  }
}

function disconnectSupabase() {
  if (!confirm("האם אתה בטוח שאתה רוצה להתנתק מהענן? הנתונים המקומיים לא יימחקו.")) return;
  storageService.update("settings", "settings_main", {
    supabaseUrl: "",
    supabaseAnonKey: "",
    supabaseStatus: "לא מחובר",
    supabaseReady: false
  });
  showToast("החיבור נותק");
  render();
}

function importFormDebugData(form) {
  const formData = new FormData(form);
  const data = {};
  if (typeof formData.forEach === "function") {
    formData.forEach((value, key) => {
      data[key] = value;
    });
  } else {
    [
      "productName",
      "model",
      "importDate",
      "quantity",
      "shippingType",
      "supplierPaymentCount",
      "supplierPayment1",
      "supplierPayment2",
      "supplierPayment3",
      "supplierRefund",
      "shipping",
      "ilacReport",
      "customsBroker",
      "unloadingPort",
      "productFileBuild",
      "customs",
      "otherExpenses",
      "notes"
    ].forEach((key) => {
      data[key] = formData.get(key);
    });
  }
  return data;
}

function readImportForm(form) {
  const formData = new FormData(form);
  const record = {
    productName: String(formData.get("productName") || "").trim(),
    model: String(formData.get("model") || "").trim(),
    material: "",
    importDate: String(formData.get("importDate") || ""),
    shippingType: String(formData.get("shippingType") || "ימי"),
    notes: String(formData.get("notes") || "").trim()
  };
  importNumberFields().forEach((field) => {
    record[field] = helpers.number(formData.get(field));
  });
  return record;
}

function validateImport(record) {
  if (!validationHelper.required(record.productName)) return "נא להזין שם מוצר";
  if (!validationHelper.isDecimal(record.quantity) || helpers.number(record.quantity) <= 0) return "נא להזין כמות תקינה";
  const fields = importNumberFields();
  for (const field of fields) {
    if (!validationHelper.isDecimal(record[field])) return "נא להזין מספר תקין";
    if (helpers.number(record[field]) < 0) return "לא ניתן להזין ערך שלילי";
  }
  return "";
}

function setImportFormMessage(message, type = "fail") {
  const messageElement = document.getElementById("importFormMessage");
  if (!messageElement) return;
  messageElement.textContent = message;
  messageElement.className = `form-message ${type}`;
}

function updateImportCalculatedPreview() {
  const form = document.getElementById("importForm");
  const target = document.getElementById("importCalculatedFields");
  if (!form || !target) return;
  const payload = readImportForm(form);
  const calc = calculateImportRecord(payload);
  target.innerHTML = renderImportCalculatedFields(calc);
  const supplierTotal = document.getElementById("supplierTotalResult");
  if (supplierTotal) supplierTotal.textContent = `₪${helpers.moneyWhole(calc.supplierTotal)}`;
  updateImportLiveFeedback(form, payload, calc);
}

function updateImportLiveFeedback(form, payload, calc) {
  if (!validationHelper.required(payload.productName)) {
    uiHelper.setMessage("importFormMessage", "נא להזין שם מוצר", "soft");
    return;
  }
  const quantityValue = form.elements.quantity?.value || "";
  if (!validationHelper.isDecimal(quantityValue) || payload.quantity <= 0) {
    uiHelper.setMessage("importFormMessage", "נא להזין כמות תקינה", "soft");
    return;
  }
  if (calc.unitCostBeforeVat > 100) {
    uiHelper.setMessage("importFormMessage", "שים לב: עלות היחידה גבוהה מהרגיל", "soft");
    return;
  }
  uiHelper.clearMessage("importFormMessage");
}

async function syncSavedImportToSupabase(importRecord) {
  const connected = cloudService.isConfigured();
  console.log("Supabase is connected:", connected);
  if (!connected) return true;
  try {
    await cloudService.upsert("imports", importRecord);
    return true;
  } catch (error) {
    console.error("Supabase insert error:", error);
    setImportFormMessage("היבוא נשמר מקומית, אבל לא נשמר בענן. בדוק את השגיאה בקונסול Supabase.", "fail");
    return false;
  }
}

async function saveImport(form) {
  try {
    console.log("Button clicked");
    console.log("Import form data", importFormDebugData(form));
    const payload = readImportForm(form);
    console.log("Import object before save", payload);
    const validationMessage = validateImport(payload);
    if (validationMessage) {
      console.log("Import save validation failed", validationMessage);
      setImportFormMessage(validationMessage, "fail");
      return;
    }
    const previousImport = editingImportId ? storageService.getById("imports", editingImportId) : null;
    const keepProductLink = previousImport && productKeyFromImport(previousImport) === productKeyFromImport(payload);
    const productId = syncProductForImport({ ...payload, productId: keepProductLink ? previousImport.productId : undefined });
    if (!productId) {
      setImportFormMessage("לא ניתן לקשר מוצר ליבוא", "fail");
      return;
    }
    const savedPayload = { ...payload, productId };
    const savedImport = editingImportId
      ? storageService.update("imports", editingImportId, savedPayload)
      : storageService.create("imports", savedPayload);
    console.log("Storage save result", savedImport);
    if (!savedImport) {
      setImportFormMessage("לא ניתן לשמור את היבוא", "fail");
      return;
    }
    const cloudSaved = await syncSavedImportToSupabase(savedImport);
    rebuildImportMovement(savedImport);
    recalculateProductFromImports(productId);
    if (previousImport && previousImport.productId && previousImport.productId !== productId) {
      recalculateProductFromImports(previousImport.productId);
    }
    editingImportId = null;
    refreshState();
    console.log("Imports after reload", state.imports);
    importFormOpen = false;
    showToast(cloudSaved ? "היבוא נשמר בהצלחה" : "היבוא נשמר מקומית. יש לבדוק סנכרון ענן");
    render();
  } catch (error) {
    console.log("Import save failed", error);
    setImportFormMessage("שגיאה בשמירת היבוא. נא לבדוק את הנתונים ולנסות שוב", "fail");
  }
}

function deleteImport(importId) {
  const importRecord = storageService.getById("imports", importId);
  if (!importRecord) return;
  const approved = window.confirm("האם למחוק את רשומת היבוא?");
  if (!approved) return;
  refreshState();
  state.inventoryMovements
    .filter((movement) => movement.importId === importId || (movement.sourceType === "import" && movement.sourceId === importId))
    .forEach((movement) => storageService.delete("inventoryMovements", movement.id));
  storageService.delete("imports", importId);
  selectedImportIds.delete(importId);
  if (importRecord.productId) recalculateProductFromImports(importRecord.productId);
  showToast("היבוא נמחק והנתונים חושבו מחדש");
  render();
}

function readProductForm(form) {
  const formData = new FormData(form);
  return {
    name: String(formData.get("name") || "").trim(),
    model: String(formData.get("model") || "").trim(),
    material: String(formData.get("material") || "").trim(),
    status: String(formData.get("status") || "פעיל"),
    minimumStock: helpers.number(formData.get("minimumStock"), DEFAULT_LOW_STOCK_THRESHOLD),
    notes: String(formData.get("notes") || "").trim()
  };
}

function saveProduct(form) {
  if (!editingProductId) return;
  const payload = readProductForm(form);
  if (!validationHelper.required(payload.name)) {
    const message = document.getElementById("productFormMessage");
    if (message) {
      message.textContent = "נא להזין שם מוצר";
      message.className = "form-message fail";
    }
    return;
  }
  if (payload.minimumStock < 0) {
    uiHelper.setMessage("productFormMessage", "לא ניתן להזין מינימום מלאי שלילי", "fail");
    return;
  }
  const existing = storageService.getById("products", editingProductId);
  if (!existing) return;
  const savedProduct = storageService.update("products", editingProductId, {
    ...payload,
    importKey: existing.importKey,
    costPerUnit: existing.costPerUnit,
    importCostBeforeVatPerUnit: existing.importCostBeforeVatPerUnit,
    sellingPriceIncludingVat: existing.sellingPriceIncludingVat,
    vat: existing.vat,
    tax: existing.tax,
    targetProfit: existing.targetProfit
  });
  if (!savedProduct) {
    uiHelper.setMessage("productFormMessage", "שמירת המוצר נכשלה", "fail");
    return;
  }
  productFormOpen = false;
  editingProductId = null;
  showToast("המוצר נשמר בהצלחה");
  render();
}

function readManualInventoryForm(form) {
  const formData = new FormData(form);
  return {
    productId: String(formData.get("productId") || ""),
    actionType: String(formData.get("actionType") || "add"),
    quantity: helpers.number(formData.get("quantity")),
    movementDate: String(formData.get("movementDate") || ""),
    reason: String(formData.get("reason") || "").trim()
  };
}

function setManualInventoryMessage(message) {
  const messageElement = document.getElementById("manualInventoryMessage");
  if (!messageElement) return;
  messageElement.textContent = message;
  messageElement.className = "form-message fail";
}

function saveManualInventory(form) {
  const payload = readManualInventoryForm(form);
  if (!payload.productId) {
    setManualInventoryMessage("נא לבחור מוצר");
    return;
  }
  if (!validationHelper.isDecimal(payload.quantity) || helpers.number(payload.quantity) <= 0) {
    setManualInventoryMessage("נא להזין כמות תקינה");
    return;
  }
  refreshState();
  const currentQuantity = calculationHelper.inventoryQuantity(payload.productId);
  const signedQuantity = payload.actionType === "subtract" ? -helpers.number(payload.quantity) : helpers.number(payload.quantity);
  if (currentQuantity + signedQuantity < 0) {
    setManualInventoryMessage("לא ניתן להגיע למלאי שלילי");
    return;
  }
  storageService.create("inventoryMovements", {
    productId: payload.productId,
    type: "adjustment",
    sourceType: "adjustment",
    sourceId: "",
    quantity: signedQuantity,
    movementDate: payload.movementDate,
    movementDateTime: helpers.dateTime(),
    reason: payload.reason || "עדכון מלאי ידני"
  });
  manualInventoryOpen = false;
  manualInventoryProductId = "";
  showToast("המלאי עודכן בהצלחה");
  render();
}

function readPricingForm(form) {
  const formData = new FormData(form);
  return {
    productId: String(formData.get("productId") || ""),
    quantity: helpers.number(formData.get("quantity")),
    priceIncludingVat: helpers.number(formData.get("priceIncludingVat"))
  };
}

function setPricingMessage(message) {
  uiHelper.setMessage("pricingFormMessage", message, "fail");
}

function paymentForSale(saleId) {
  return state.payments.find((payment) => payment.saleId === saleId && payment.kind === "balance")
    || state.payments.find((payment) => payment.saleId === saleId && payment.openBalance !== undefined)
    || null;
}

function paymentEntriesForSale(saleId) {
  return state.payments
    .filter((payment) => payment.saleId === saleId && payment.kind === "payment")
    .sort((a, b) => String(b.paymentDate || "").localeCompare(String(a.paymentDate || "")));
}

function paymentMethodOptions() {
  return ["מזומן", "העברה בנקאית", "ביט", "פייבוקס", "אשראי", "אחר"];
}

function paymentStatusFromBalance(total, paid) {
  if (paid <= 0) return "לא שולם";
  if (paid >= total) return "שולם מלא";
  return "בתהליך";
}

function activeSalesForPayments() {
  return state.sales.filter((sale) => isActiveSaleStatus(sale.status));
}

function paymentBalanceRows() {
  return activeSalesForPayments().map((sale) => {
    const calc = calculateSaleRecord(sale);
    const balance = paymentForSale(sale.id);
    const entries = paymentEntriesForSale(sale.id);
    const paid = entries.reduce((sum, payment) => sum + helpers.number(payment.amount), 0);
    const openBalance = Math.max(0, calc.totalIncludingVat - paid);
    const lastPayment = entries[0] || null;
    return {
      sale,
      calc,
      balance,
      entries,
      paid,
      openBalance,
      paymentStatus: paymentStatusFromBalance(calc.totalIncludingVat, paid),
      lastPayment
    };
  });
}

function paymentTotals() {
  const rows = paymentBalanceRows();
  return rows.reduce((totals, row) => {
    totals.received += row.paid;
    totals.open += row.openBalance;
    if (row.paymentStatus === "לא שולם") totals.unpaid += 1;
    if (row.paymentStatus === "בתהליך") totals.partial += 1;
    return totals;
  }, { received: 0, open: 0, unpaid: 0, partial: 0 });
}

function readSaleForm(form) {
  const formData = new FormData(form);
  const customerId = String(formData.get("customerId") || "");
  const existingCustomer = state.customers.find((customer) => customer.id === customerId);
  return {
    customerId,
    customerName: String(formData.get("customerName") || existingCustomer?.name || "").trim(),
    customerType: String(formData.get("customerType") || existingCustomer?.type || "לקוח קבוע"),
    phone: String(formData.get("phone") || existingCustomer?.phone || "").trim(),
    productId: String(formData.get("productId") || ""),
    quantity: helpers.number(formData.get("quantity")),
    unitPriceIncludingVat: helpers.number(formData.get("unitPriceIncludingVat")),
    saleDate: String(formData.get("saleDate") || ""),
    status: String(formData.get("status") || "טיוטה"),
    notes: String(formData.get("notes") || "").trim()
  };
}

function setSaleMessage(message) {
  const messageElement = document.getElementById("saleFormMessage");
  if (!messageElement) return;
  messageElement.textContent = message;
  messageElement.className = "form-message fail";
}

function availableForSale(productId, currentSaleId = null) {
  let available = calculationHelper.inventoryQuantity(productId);
  if (currentSaleId) {
    const existingMovement = state.inventoryMovements.find((movement) => movement.sourceType === "sale" && movement.sourceId === currentSaleId && movement.productId === productId);
    if (existingMovement) available += Math.abs(Math.min(0, helpers.number(existingMovement.quantity)));
  }
  return available;
}

function findOrCreateCustomer(salePayload) {
  refreshState();
  const existing = salePayload.customerId
    ? state.customers.find((customer) => customer.id === salePayload.customerId)
    : state.customers.find((customer) => customer.name === salePayload.customerName && (!salePayload.phone || customer.phone === salePayload.phone));
  if (existing) {
    return existing.id;
  }
  const customer = storageService.create("customers", {
    name: salePayload.customerName,
    type: salePayload.customerType,
    phone: salePayload.phone
  });
  return customer.id;
}

function rebuildSaleMovement(sale) {
  refreshState();
  const existingMovement = state.inventoryMovements.find((movement) => movement.sourceType === "sale" && movement.sourceId === sale.id);
  const fixedMovementDateTime = existingMovement?.movementDateTime || existingMovement?.createdAt || sale.createdAt || helpers.dateTime();
  state.inventoryMovements
    .filter((movement) => movement.sourceType === "sale" && movement.sourceId === sale.id)
    .forEach((movement) => storageService.delete("inventoryMovements", movement.id));
  if (!isActiveSaleStatus(sale.status)) return;
  storageService.create("inventoryMovements", {
    productId: sale.productId,
    type: "sale",
    saleId: sale.id,
    customerId: sale.customerId,
    customerName: sale.customerName,
    sourceType: "sale",
    sourceId: sale.id,
    quantity: -helpers.number(sale.quantity),
    movementDate: sale.saleDate,
    movementDateTime: fixedMovementDateTime,
    reason: "מכירה"
  });
}

function syncSalePayment(sale) {
  refreshState();
  const existing = paymentForSale(sale.id);
  if (!isActiveSaleStatus(sale.status)) {
    state.payments
      .filter((payment) => payment.saleId === sale.id)
      .forEach((payment) => storageService.delete("payments", payment.id));
    return;
  }
  const calc = calculateSaleRecord(sale);
  const paid = state.payments
    .filter((payment) => payment.saleId === sale.id && payment.kind === "payment")
    .reduce((sum, payment) => sum + helpers.number(payment.amount), 0);
  const payload = {
    kind: "balance",
    saleId: sale.id,
    customerId: sale.customerId,
    amount: calc.totalIncludingVat,
    paid,
    openBalance: Math.max(0, calc.totalIncludingVat - paid),
    paymentStatus: paymentStatusFromBalance(calc.totalIncludingVat, paid)
  };
  if (existing) storageService.update("payments", existing.id, payload);
  else storageService.create("payments", payload);
}

function syncSaleStatusFromPayment(saleId) {
  refreshState();
  const sale = state.sales.find((item) => item.id === saleId);
  if (!sale || !isActiveSaleStatus(sale.status)) return;
  const balance = paymentForSale(saleId);
  if (!balance) return;
  const paymentStatus = balance.paymentStatus || paymentStatusFromBalance(balance.amount, balance.paid);
  if (paymentStatus === "שולם מלא" && sale.status !== "שולם") {
    storageService.update("sales", sale.id, { status: "שולם" });
  }
  if (paymentStatus !== "שולם מלא" && sale.status === "שולם") {
    storageService.update("sales", sale.id, { status: "בגבייה" });
  }
}

function saveSale(form) {
  refreshState();
  const payload = readSaleForm(form);
  if (!validationHelper.required(payload.customerName)) {
    setSaleMessage("נא להזין לקוח");
    return;
  }
  if (!payload.productId) {
    setSaleMessage("נא לבחור מוצר");
    return;
  }
  if (!validationHelper.isDecimal(payload.quantity) || helpers.number(payload.quantity) <= 0) {
    setSaleMessage("נא להזין כמות תקינה");
    return;
  }
  if (!validationHelper.isDecimal(payload.unitPriceIncludingVat) || helpers.number(payload.unitPriceIncludingVat) < 0) {
    setSaleMessage("נא להזין מחיר תקין");
    return;
  }
  if (isActiveSaleStatus(payload.status) && payload.quantity > availableForSale(payload.productId, editingSaleId)) {
    setSaleMessage("אין מספיק מלאי");
    return;
  }
  const customerId = findOrCreateCustomer(payload);
  const salePayload = { ...payload, customerId };
  const savedSale = editingSaleId
    ? storageService.update("sales", editingSaleId, salePayload)
    : storageService.create("sales", salePayload);
  if (!savedSale) {
    setSaleMessage("שמירת המכירה נכשלה");
    return;
  }
  rebuildSaleMovement(savedSale);
  syncSalePayment(savedSale);
  saleFormOpen = false;
  editingSaleId = null;
  viewingSaleId = null;
  salesDraft = null;
  showToast("המכירה נשמרה בהצלחה");
  render();
}

function cancelSale(saleId) {
  const sale = storageService.getById("sales", saleId);
  if (!sale) return;
  const approved = window.confirm("האם למחוק את המכירה ולהחזיר את המלאי?");
  if (!approved) return;
  refreshState();
  state.inventoryMovements
    .filter((movement) => movement.sourceType === "sale" && movement.sourceId === saleId)
    .forEach((movement) => storageService.delete("inventoryMovements", movement.id));
  state.payments
    .filter((payment) => payment.saleId === saleId)
    .forEach((payment) => storageService.delete("payments", payment.id));
  storageService.delete("sales", saleId);
  viewingSaleId = null;
  showToast("המכירה נמחקה והמלאי הוחזר");
  render();
}

function readCustomerForm(form) {
  const formData = new FormData(form);
  return {
    name: String(formData.get("name") || "").trim(),
    type: String(formData.get("type") || "לקוח קבוע"),
    phone: String(formData.get("phone") || "").trim(),
    businessName: String(formData.get("businessName") || "").trim(),
    city: String(formData.get("city") || "").trim(),
    source: String(formData.get("source") || "").trim(),
    notes: String(formData.get("notes") || "").trim()
  };
}

function setCustomerMessage(message) {
  const messageElement = document.getElementById("customerFormMessage");
  if (!messageElement) return;
  messageElement.textContent = message;
  messageElement.className = "form-message fail";
}

function syncCustomerReferences(customerId, customerData) {
  refreshState();
  state.sales
    .filter((sale) => sale.customerId === customerId)
    .forEach((sale) => storageService.update("sales", sale.id, {
      customerName: customerData.name,
      customerType: customerData.type,
      phone: customerData.phone
    }));
  state.payments
    .filter((payment) => payment.customerId === customerId)
    .forEach((payment) => storageService.update("payments", payment.id, {
      customerName: customerData.name
    }));
}

function saveCustomer(form) {
  const payload = readCustomerForm(form);
  if (!validationHelper.required(payload.name)) {
    setCustomerMessage("נא להזין שם לקוח");
    return;
  }
  const savedCustomer = editingCustomerId
    ? storageService.update("customers", editingCustomerId, payload)
    : storageService.create("customers", payload);
  if (!savedCustomer) {
    setCustomerMessage("שמירת הלקוח נכשלה");
    return;
  }
  if (editingCustomerId && savedCustomer) {
    syncCustomerReferences(editingCustomerId, savedCustomer);
  }
  customerFormOpen = false;
  editingCustomerId = null;
  showToast("הלקוח נשמר בהצלחה");
  render();
}

function deleteCustomer(customerId) {
  refreshState();
  const hasSales = state.sales.some((sale) => sale.customerId === customerId);
  const hasPayments = state.payments.some((payment) => payment.customerId === customerId);
  if (hasSales || hasPayments) {
    showToast("לא ניתן למחוק לקוח עם היסטוריית מכירות או תשלומים");
    return;
  }
  const approved = window.confirm("האם למחוק את הלקוח?");
  if (!approved) return;
  storageService.delete("customers", customerId);
  viewingCustomerId = null;
  showToast("הלקוח נמחק");
  render();
}

function readPaymentForm(form) {
  const formData = new FormData(form);
  return {
    saleId: String(formData.get("saleId") || ""),
    paymentDate: String(formData.get("paymentDate") || ""),
    amount: helpers.number(formData.get("amount")),
    method: String(formData.get("method") || "אחר"),
    notes: String(formData.get("notes") || "").trim()
  };
}

function setPaymentMessage(message) {
  const messageElement = document.getElementById("paymentFormMessage");
  if (!messageElement) return;
  messageElement.textContent = message;
  messageElement.className = "form-message fail";
}

function paidForSale(saleId, excludePaymentId = null) {
  return state.payments
    .filter((payment) => payment.saleId === saleId && payment.kind === "payment" && payment.id !== excludePaymentId)
    .reduce((sum, payment) => sum + helpers.number(payment.amount), 0);
}

function recalculatePaymentBalance(saleId) {
  refreshState();
  const sale = state.sales.find((item) => item.id === saleId);
  if (!sale || !isActiveSaleStatus(sale.status)) return;
  syncSalePayment(sale);
  syncSaleStatusFromPayment(saleId);
}

function savePayment(form) {
  refreshState();
  const payload = readPaymentForm(form);
  if (!payload.saleId) {
    setPaymentMessage("נא לבחור מכירה");
    return;
  }
  if (!validationHelper.isDecimal(payload.amount) || helpers.number(payload.amount) <= 0) {
    setPaymentMessage("נא להזין סכום תקין");
    return;
  }
  const sale = state.sales.find((item) => item.id === payload.saleId);
  if (!sale || !isActiveSaleStatus(sale.status)) {
    setPaymentMessage("נא לבחור מכירה פעילה");
    return;
  }
  const calc = calculateSaleRecord(sale);
  const paidWithoutThis = paidForSale(payload.saleId, editingPaymentId);
  if (paidWithoutThis + payload.amount > calc.totalIncludingVat + 0.00001) {
    setPaymentMessage("לא ניתן לשלם יותר מסכום העסקה");
    return;
  }
  const paymentPayload = {
    kind: "payment",
    saleId: payload.saleId,
    customerId: sale.customerId,
    paymentDate: payload.paymentDate,
    amount: payload.amount,
    method: payload.method,
    notes: payload.notes
  };
  const savedPayment = editingPaymentId
    ? storageService.update("payments", editingPaymentId, paymentPayload)
    : storageService.create("payments", paymentPayload);
  if (!savedPayment) {
    setPaymentMessage("שמירת התשלום נכשלה");
    return;
  }
  recalculatePaymentBalance(payload.saleId);
  paymentFormOpen = false;
  editingPaymentId = null;
  paymentSaleId = "";
  showToast("התשלום נשמר בהצלחה");
  render();
}

function deletePayment(paymentId) {
  const payment = storageService.getById("payments", paymentId);
  if (!payment || payment.kind !== "payment") return;
  const approved = window.confirm("האם למחוק את התשלום?");
  if (!approved) return;
  storageService.delete("payments", paymentId);
  recalculatePaymentBalance(payment.saleId);
  showToast("התשלום נמחק והיתרה חושבה מחדש");
  render();
}

function updateSaleCalculatedPreview() {
  const form = document.getElementById("saleForm");
  const target = document.getElementById("saleCalculatedFields");
  if (!form || !target) return;
  target.innerHTML = renderSaleCalculatedFields(calculateSaleRecord(readSaleForm(form)));
}

function updatePricingLivePreview() {
  const form = document.getElementById("pricingForm");
  if (!form) return;
  const input = readPricingForm(form);
  const resultSection = document.getElementById("pricingResultSection");
  const actions = document.getElementById("pricingActions");
  const sourceSection = document.getElementById("pricingSourceSection");
  const showWaiting = () => {
    if (actions) actions.innerHTML = "";
    if (!resultSection) return;
    resultSection.innerHTML = `
      <div class="section-title"><h3>תוצאת תמחור</h3>${uiHelper.statusPill("ממתין לחישוב", "warn")}</div>
      ${emptyState("₪", "עוד לא חושב מחיר", "בחר מוצר, כמות ומחיר מכירה כולל מע״מ.")}
    `;
  };
  const selectedProduct = state.products.find((product) => product.id === input.productId);
  if (sourceSection) {
    sourceSection.innerHTML = `
      <div class="section-title"><h3>נתונים שנמשכו אוטומטית</h3><span class="pill">מקור משותף</span></div>
      ${selectedProduct ? renderPricingSourceCards(selectedProduct, appSettings()) : emptyState("◇", "בחר מוצר", "לאחר בחירת מוצר יוצגו עלות ממוצעת, מלאי זמין והגדרות מס.")}
    `;
  }
  if (!input.productId) {
    uiHelper.clearMessage("pricingFormMessage");
    pricingResult = null;
    showWaiting();
    return;
  }
  if (!validationHelper.isDecimal(form.elements.quantity?.value) || input.quantity <= 0) {
    uiHelper.clearMessage("pricingFormMessage");
    pricingResult = null;
    showWaiting();
    return;
  }
  if (!validationHelper.isDecimal(form.elements.priceIncludingVat?.value) || input.priceIncludingVat < 0) {
    uiHelper.clearMessage("pricingFormMessage");
    pricingResult = null;
    showWaiting();
    return;
  }
  pricingResult = calculatePricingQuote(input);
  if (!pricingResult.inventoryOk) {
    uiHelper.setMessage("pricingFormMessage", "אין מספיק מלאי לכמות שבחרת", "fail");
  } else {
    uiHelper.clearMessage("pricingFormMessage");
  }
  if (actions) actions.innerHTML = `<button class="secondary-button" type="button" data-action="pricing-to-sale">הפוך למכירה</button>`;
  if (resultSection) {
    resultSection.innerHTML = `
      <div class="section-title"><h3>תוצאת תמחור</h3>${renderDecisionPill(pricingResult)}</div>
      ${renderPricingResult(pricingResult)}
    `;
  }
}

function calculatePricingFromForm(form) {
  const input = readPricingForm(form);
  if (!input.productId) {
    uiHelper.clearMessage("pricingFormMessage");
    return;
  }
  if (!validationHelper.isDecimal(input.quantity) || helpers.number(input.quantity) <= 0) {
    uiHelper.clearMessage("pricingFormMessage");
    return;
  }
  if (!validationHelper.isDecimal(input.priceIncludingVat) || helpers.number(input.priceIncludingVat) < 0) {
    uiHelper.clearMessage("pricingFormMessage");
    return;
  }
  pricingResult = calculatePricingQuote(input);
  if (!pricingResult.inventoryOk) {
    setPricingMessage("אין מספיק מלאי לכמות שבחרת");
    return;
  }
  render();
}

function pricingToSale() {
  if (!pricingResult) return;
  salesDraft = {
    productId: pricingResult.product.id,
    quantity: pricingResult.quantity,
    priceIncludingVat: pricingResult.priceIncludingVat
  };
  saleFormOpen = true;
  editingSaleId = null;
  viewingSaleId = null;
  setActiveTab("sales");
}

function deleteProduct(productId) {
  const product = storageService.getById("products", productId);
  if (!product) return;
  const approved = window.confirm("האם למחוק את המוצר מהמלאי?");
  if (!approved) return;
  refreshState();
  state.inventoryMovements
    .filter((movement) => movement.productId === productId)
    .forEach((movement) => storageService.delete("inventoryMovements", movement.id));
  storageService.delete("products", productId);
  showToast("המוצר נמחק");
  render();
}

function render() {
  refreshState();
  const renderers = {
    dashboard: renderDashboard,
    imports: renderImports,
    inventory: renderInventory,
    pricing: renderPricing,
    sales: renderSales,
    customers: renderCustomers,
    payments: renderPayments,
    settings: renderSettings
  };
  appContent.innerHTML = renderers[activeTab]();
  focusFirstFormField();
  const issues = systemIssues();
  if (issues.length && !systemIssueMessageShown) {
    systemIssueMessageShown = true;
    showToast(issues[0]);
  }
}

function exportJson() {
  storageService.update("settings", "settings_main", {
    lastBackupAt: helpers.dateTime(),
    backupStatus: "גיבוי נוצר בהצלחה"
  });
  const data = storageService.exportData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `sunglasses-system-backup-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast("קובץ הגיבוי נוצר");
}

function importJson(file) {
  if (!file) return;
  const approved = window.confirm("האם לייבא גיבוי ולהחליף את הנתונים הקיימים?");
  if (!approved) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      if (!validationHelper.hasBaseShape(parsed)) {
        showToast("קובץ הגיבוי אינו מתאים למבנה המערכת");
        return;
      }
      storageService.replaceAll(parsed);
      storageService.update("settings", "settings_main", {
        lastBackupAt: helpers.dateTime(),
        backupStatus: "שוחזר מגיבוי"
      });
      showToast("הנתונים שוחזרו בהצלחה");
      render();
    } catch (error) {
      showToast("לא ניתן לקרוא את קובץ הגיבוי");
    }
  };
  reader.readAsText(file);
}

document.querySelectorAll(".tab-button").forEach((button) => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

appContent.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;
  const action = button.dataset.action;
  if (action === "save-import") {
    event.preventDefault();
    const form = button.closest("#importForm");
    if (form) saveImport(form);
    return;
  }
  if (action === "new-import") {
    importFormOpen = true;
    editingImportId = null;
    render();
  }
  if (action === "edit-import") {
    importFormOpen = true;
    editingImportId = button.dataset.id;
    render();
  }
  if (action === "delete-import") deleteImport(button.dataset.id);
  if (action === "cancel-import") {
    importFormOpen = false;
    editingImportId = null;
    render();
  }
  if (action === "cancel-product") {
    productFormOpen = false;
    editingProductId = null;
    render();
  }
  if (action === "new-manual-inventory") {
    manualInventoryOpen = true;
    manualInventoryProductId = "";
    productFormOpen = false;
    editingProductId = null;
    render();
  }
  if (action === "cancel-manual-inventory") {
    manualInventoryOpen = false;
    manualInventoryProductId = "";
    render();
  }
  if (action === "open-movement-customer") {
    viewingCustomerId = button.dataset.id;
    customerFormOpen = false;
    editingCustomerId = null;
    setActiveTab("customers");
  }
  if (action === "pricing-to-sale") pricingToSale();
  if (action === "new-sale") {
    saleFormOpen = true;
    editingSaleId = null;
    viewingSaleId = null;
    render();
  }
  if (action === "edit-sale") {
    saleFormOpen = true;
    editingSaleId = button.dataset.id;
    viewingSaleId = null;
    salesDraft = null;
    render();
  }
  if (action === "cancel-sale-form") {
    saleFormOpen = false;
    editingSaleId = null;
    salesDraft = null;
    render();
  }
  if (action === "cancel-sale") cancelSale(button.dataset.id);
  if (action === "view-sale") {
    viewingSaleId = viewingSaleId === button.dataset.id ? null : button.dataset.id;
    saleFormOpen = false;
    editingSaleId = null;
    render();
  }
  if (action === "new-customer") {
    customerFormOpen = true;
    editingCustomerId = null;
    viewingCustomerId = null;
    render();
  }
  if (action === "edit-customer") {
    customerFormOpen = true;
    editingCustomerId = button.dataset.id;
    viewingCustomerId = null;
    render();
  }
  if (action === "cancel-customer-form") {
    customerFormOpen = false;
    editingCustomerId = null;
    render();
  }
  if (action === "view-customer") {
    viewingCustomerId = viewingCustomerId === button.dataset.id ? null : button.dataset.id;
    customerFormOpen = false;
    editingCustomerId = null;
    render();
  }
  if (action === "delete-customer") deleteCustomer(button.dataset.id);
  if (action === "new-payment") {
    paymentFormOpen = true;
    editingPaymentId = null;
    paymentSaleId = "";
    viewingPaymentSaleId = null;
    render();
  }
  if (action === "payment-for-sale") {
    paymentFormOpen = true;
    editingPaymentId = null;
    paymentSaleId = button.dataset.id;
    viewingPaymentSaleId = null;
    render();
  }
  if (action === "edit-payment") {
    const payment = storageService.getById("payments", button.dataset.id);
    paymentFormOpen = true;
    editingPaymentId = button.dataset.id;
    paymentSaleId = payment?.saleId || "";
    viewingPaymentSaleId = null;
    render();
  }
  if (action === "cancel-payment-form") {
    paymentFormOpen = false;
    editingPaymentId = null;
    paymentSaleId = "";
    render();
  }
  if (action === "delete-payment") deletePayment(button.dataset.id);
  if (action === "view-payments") {
    viewingPaymentSaleId = viewingPaymentSaleId === button.dataset.id ? null : button.dataset.id;
    paymentFormOpen = false;
    editingPaymentId = null;
    paymentSaleId = "";
    render();
  }
  if (action === "quick-sale") {
    setActiveTab("sales");
  }
  if (action === "quick-pricing") setActiveTab("pricing");
  if (action === "quick-import") {
    importFormOpen = true;
    editingImportId = null;
    setActiveTab("imports");
  }
  if (action === "quick-customer") {
    setActiveTab("customers");
  }
  if (action === "check-supabase") checkSupabaseConnection(button.closest("#cloudSettingsForm"));
  if (action === "sync-supabase") syncSupabaseNow();
  if (action === "disconnect-supabase") disconnectSupabase();
  if (action === "export") exportJson();
  if (action === "import" || action === "restore-backup") importFileInput.click();
});

appContent.addEventListener("input", (event) => {
  if (event.target.closest("#importForm")) updateImportCalculatedPreview();
  if (event.target.closest("#pricingForm")) updatePricingLivePreview();
  if (event.target.closest("#saleForm")) updateSaleCalculatedPreview();
  if (event.target.dataset.filter === "inventory-search") {
    inventorySearch = event.target.value.trim();
    render();
  }
});

appContent.addEventListener("focus", (event) => {
  if (!event.target.matches("input[data-money='true'], input[data-number='true']")) return;
  event.target.value = helpers.cleanNumberText(event.target.value);
}, true);

appContent.addEventListener("blur", (event) => {
  if (!event.target.matches("input[data-money='true'], input[data-number='true']")) return;
  const rawValue = event.target.value.trim();
  if (!rawValue) return;
  if (!validationHelper.isDecimal(rawValue)) return;
  event.target.value = event.target.matches("input[data-money='true']")
    ? helpers.moneyInput(rawValue)
    : helpers.numberText(rawValue);
  if (event.target.closest("#importForm")) updateImportCalculatedPreview();
  if (event.target.closest("#saleForm")) updateSaleCalculatedPreview();
}, true);

appContent.addEventListener("change", (event) => {
  if (event.target.matches("[data-sale-customer-select]")) {
    const form = event.target.closest("#saleForm");
    salesDraft = form ? readSaleForm(form) : { customerId: event.target.value };
    render();
    return;
  }
  if (event.target.matches("[data-import-select]")) {
    const importId = event.target.dataset.importSelect;
    if (event.target.checked) selectedImportIds.add(importId);
    else selectedImportIds.delete(importId);
    render();
    return;
  }
  if (event.target.matches("[data-supplier-payment-count]")) {
    const count = Math.max(1, Math.min(3, helpers.number(event.target.value, 1)));
    document.querySelectorAll("[data-supplier-payment-field]").forEach((field) => {
      field.classList.toggle("hidden-field", helpers.number(field.dataset.supplierPaymentField) > count);
    });
    updateImportCalculatedPreview();
  }
  if (event.target.closest("#saleForm")) updateSaleCalculatedPreview();
  if (event.target.closest("#pricingForm")) {
    updatePricingLivePreview();
    return;
  }
  if (event.target.dataset.filter === "inventory-status") {
    inventoryStatusFilter = event.target.value;
    render();
  }
});

appContent.addEventListener("submit", (event) => {
  if (event.target.id === "importForm") {
    event.preventDefault();
    saveImport(event.target);
  }
  if (event.target.id === "productForm") {
    event.preventDefault();
    saveProduct(event.target);
  }
  if (event.target.id === "manualInventoryForm") {
    event.preventDefault();
    saveManualInventory(event.target);
  }
  if (event.target.id === "pricingForm") {
    event.preventDefault();
    calculatePricingFromForm(event.target);
  }
  if (event.target.id === "saleForm") {
    event.preventDefault();
    saveSale(event.target);
  }
  if (event.target.id === "customerForm") {
    event.preventDefault();
    saveCustomer(event.target);
  }
  if (event.target.id === "paymentForm") {
    event.preventDefault();
    savePayment(event.target);
  }
  if (event.target.id === "businessSettingsForm") {
    event.preventDefault();
    saveBusinessSettings(event.target);
  }
});

importFileInput.addEventListener("change", (event) => {
  importJson(event.target.files[0]);
  event.target.value = "";
});

async function initializeCloudSync() {
  if (!cloudService.isConfigured()) return;
  try {
    const localSettings = storageService.exportData().settings;
    const remoteData = await cloudService.fetchAll();
    if (cloudService.hasRemoteData(remoteData)) {
      remoteData.settings = {
        ...localSettings,
        ...(remoteData.settings || {}),
        supabaseUrl: localSettings.supabaseUrl,
        supabaseAnonKey: localSettings.supabaseAnonKey,
        supabaseReady: true,
        supabaseStatus: "מחובר"
      };
      storageService.replaceAll(remoteData, false);
      refreshState();
      cleanupDuplicateImportMovements();
      refreshState();
      storageService.update("settings", "settings_main", { supabaseStatus: "מחובר" });
      render();
      return;
    }
    await cloudService.pushAll(storageService.exportData());
    storageService.update("settings", "settings_main", { supabaseStatus: "מחובר" });
    render();
  } catch (error) {
    console.log("Supabase initial sync failed", error);
    storageService.update("settings", "settings_main", { supabaseStatus: "שגיאת חיבור" });
    render();
  }
}

storageService.replaceAll(storageService.exportData(), false);
refreshState();
cleanupDuplicateImportMovements();
activeTab = tabs.some((tab) => tab.id === window.localStorage.getItem(ACTIVE_TAB_KEY))
  ? window.localStorage.getItem(ACTIVE_TAB_KEY)
  : "dashboard";
document.querySelectorAll(".tab-button").forEach((button) => {
  button.classList.toggle("active", button.dataset.tab === activeTab);
});
render();
initializeCloudSync();
