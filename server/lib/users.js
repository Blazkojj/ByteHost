const bcrypt = require("bcryptjs");

const { DEFAULT_USER_PLAN, OWNER_EMAIL, OWNER_PASSWORD } = require("../config");
const { getDb, mapUserRow } = require("./db");
const { GAME_SERVICE_TYPES } = require("./gamePresets");
const {
  createHttpError,
  coerceBoolean,
  coerceNullableNumber,
  coerceNullableString,
  nowIso,
  randomId
} = require("./utils");

const MIN_PASSWORD_LENGTH = 8;
const PENDING_ACCOUNT_PLAN = {
  max_bots: 0,
  max_ram_mb: 0,
  max_cpu_percent: 0,
  max_storage_mb: 0,
  allowed_service_types: []
};
const HOSTING_SERVICE_TYPES = new Set([
  "discord_bot",
  "minecraft_server",
  "fivem_server",
  ...GAME_SERVICE_TYPES
]);

function normalizeEmail(value) {
  const normalized = coerceNullableString(value, null);
  if (!normalized) {
    return null;
  }

  return normalized.toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").trim());
}

function isAdminUser(user) {
  return user?.role === "owner";
}

function normalizeAllowedServiceTypes(value, fallback = []) {
  const rawValue = value === undefined ? fallback : value;
  let entries = rawValue;

  if (typeof rawValue === "string") {
    try {
      entries = JSON.parse(rawValue);
    } catch (_error) {
      entries = rawValue
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean);
    }
  }

  if (!Array.isArray(entries)) {
    entries = [];
  }

  return [...new Set(entries)]
    .map((entry) => String(entry || "").trim())
    .filter((entry) => HOSTING_SERVICE_TYPES.has(entry));
}

function canUserCreateServiceType(user, serviceType) {
  if (isAdminUser(user)) {
    return true;
  }

  return normalizeAllowedServiceTypes(user?.allowed_service_types).includes(serviceType);
}

function isUserExpired(user) {
  if (!user?.expires_at) {
    return false;
  }

  const expiresAt = new Date(user.expires_at);
  return !Number.isNaN(expiresAt.getTime()) && expiresAt.getTime() <= Date.now();
}

function getUserAccountStatus(user) {
  if (!user) {
    return "UNKNOWN";
  }

  if (user.pending_approval) {
    return "PENDING_APPROVAL";
  }

  if (!user.is_active) {
    return "INACTIVE";
  }

  if (isUserExpired(user)) {
    return "EXPIRED";
  }

  return "ACTIVE";
}

function canUserLogin(user) {
  return Boolean(user && !isUserExpired(user) && (user.is_active || user.pending_approval));
}

function canUserManageServices(user) {
  return Boolean(user && user.is_active && !user.pending_approval && hasProvisionedPlan(user) && !isUserExpired(user));
}

function hasProvisionedPlan(user) {
  if (!user || isAdminUser(user)) {
    return true;
  }

  if (normalizeAllowedServiceTypes(user.allowed_service_types).length === 0) {
    return false;
  }

  const planFields = [
    user.max_bots,
    user.max_ram_mb,
    user.max_cpu_percent,
    user.max_storage_mb
  ];

  return planFields.every((value) => value === null || value === undefined || Number(value) > 0);
}

function mapUserForClient(user) {
  const mapped = mapUserRow(user);
  if (!mapped) {
    return null;
  }

  const { password_hash, ...safeUser } = mapped;
  const allowedServiceTypes = normalizeAllowedServiceTypes(mapped.allowed_service_types);
  return {
    ...safeUser,
    allowed_service_types: allowedServiceTypes,
    is_admin: isAdminUser(mapped),
    account_status: getUserAccountStatus(mapped),
    has_active_plan: hasProvisionedPlan(mapped),
    limits: {
      max_bots: safeUser.max_bots,
      max_ram_mb: safeUser.max_ram_mb,
      max_cpu_percent: safeUser.max_cpu_percent,
      max_storage_mb: safeUser.max_storage_mb,
      allowed_service_types: allowedServiceTypes
    }
  };
}

function getUserById(userId) {
  return mapUserRow(getDb().prepare("SELECT * FROM users WHERE id = ?").get(userId));
}

function getPublicUserById(userId) {
  return mapUserForClient(getUserById(userId));
}

function getUserByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return null;
  }

  return mapUserRow(getDb().prepare("SELECT * FROM users WHERE email = ?").get(normalizedEmail));
}

function listUsers() {
  return getDb()
    .prepare(
      `
        SELECT *
        FROM users
        ORDER BY
          CASE
            WHEN role = 'owner' THEN 0
            WHEN pending_approval = 1 THEN 1
            ELSE 2
          END,
          created_at ASC
      `
    )
    .all()
    .map((row) => mapUserForClient(row));
}

async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

function normalizeExpiresAt(value, fallback = null) {
  const normalized = coerceNullableString(value, fallback);
  if (!normalized) {
    return null;
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    throw createHttpError(400, "Nieprawidlowa data wygasniecia konta.");
  }

  return parsed.toISOString();
}

function normalizePassword(value, { required = false } = {}) {
  const normalized = coerceNullableString(value, null);
  if (!normalized) {
    if (required) {
      throw createHttpError(400, "Haslo jest wymagane.");
    }
    return null;
  }

  if (normalized.length < MIN_PASSWORD_LENGTH) {
    throw createHttpError(
      400,
      `Haslo musi miec co najmniej ${MIN_PASSWORD_LENGTH} znakow.`
    );
  }

  return normalized;
}

function normalizePlanValue(value, fallback) {
  const normalized = coerceNullableNumber(value, fallback);
  if (normalized === null || normalized === undefined) {
    return null;
  }

  if (Number(normalized) < 0) {
    throw createHttpError(400, "Limity konta nie moga byc ujemne.");
  }

  return Number(normalized);
}

function ensureEmailAvailable(email, currentUserId = null) {
  const existing = getUserByEmail(email);
  if (existing && existing.id !== currentUserId) {
    throw createHttpError(409, "Uzytkownik z tym adresem email juz istnieje.");
  }
}

async function createUserAccount(payload, options = {}) {
  const email = normalizeEmail(payload.email);
  if (!email || !isValidEmail(email)) {
    throw createHttpError(400, "Podaj poprawny adres email.");
  }

  ensureEmailAvailable(email);

  const password = normalizePassword(payload.password, { required: true });
  const role = options.role || "user";
  const pendingApproval = role === "owner" ? false : Boolean(options.pendingApproval);
  const defaultPlan = options.defaultPlan || DEFAULT_USER_PLAN;
  const forceActive = Boolean(options.forceActive);
  const createdAt = nowIso();

  const userRecord = {
    id: randomId(),
    email,
    password_hash: await hashPassword(password),
    role,
    max_bots: role === "owner"
      ? null
      : normalizePlanValue(payload.max_bots, defaultPlan.max_bots),
    max_ram_mb: role === "owner"
      ? null
      : normalizePlanValue(payload.max_ram_mb, defaultPlan.max_ram_mb),
    max_cpu_percent: role === "owner"
      ? null
      : normalizePlanValue(payload.max_cpu_percent, defaultPlan.max_cpu_percent),
    max_storage_mb: role === "owner"
      ? null
      : normalizePlanValue(payload.max_storage_mb, defaultPlan.max_storage_mb),
    allowed_service_types: role === "owner"
      ? null
      : JSON.stringify(
          normalizeAllowedServiceTypes(
            payload.allowed_service_types,
            defaultPlan.allowed_service_types || []
          )
        ),
    expires_at: role === "owner" ? null : normalizeExpiresAt(payload.expires_at),
    is_active:
      role === "owner"
        ? 1
        : (forceActive ? 1 : (pendingApproval ? 0 : (coerceBoolean(payload.is_active, true) ? 1 : 0))),
    pending_approval: role === "owner" ? 0 : (pendingApproval ? 1 : 0),
    created_at: createdAt,
    updated_at: createdAt
  };

  getDb()
    .prepare(
      `
        INSERT INTO users (
          id,
          email,
          password_hash,
          role,
          max_bots,
          max_ram_mb,
          max_cpu_percent,
          max_storage_mb,
          allowed_service_types,
          expires_at,
          is_active,
          pending_approval,
          created_at,
          updated_at
        )
        VALUES (
          @id,
          @email,
          @password_hash,
          @role,
          @max_bots,
          @max_ram_mb,
          @max_cpu_percent,
          @max_storage_mb,
          @allowed_service_types,
          @expires_at,
          @is_active,
          @pending_approval,
          @created_at,
          @updated_at
        )
      `
    )
    .run(userRecord);

  return getPublicUserById(userRecord.id);
}

async function updateUserAccount(userId, payload) {
  const existingUser = getUserById(userId);
  if (!existingUser) {
    throw createHttpError(404, "Uzytkownik nie zostal znaleziony.");
  }

  const nextEmail =
    payload.email !== undefined ? normalizeEmail(payload.email) : existingUser.email;
  if (!nextEmail || !isValidEmail(nextEmail)) {
    throw createHttpError(400, "Podaj poprawny adres email.");
  }

  ensureEmailAvailable(nextEmail, userId);

  const nextPassword =
    payload.password !== undefined ? normalizePassword(payload.password, { required: false }) : null;

  if (existingUser.role === "owner") {
    if (payload.is_active !== undefined && !coerceBoolean(payload.is_active, true)) {
      throw createHttpError(400, "Konto owner nie moze zostac dezaktywowane.");
    }

    if (payload.role && payload.role !== "owner") {
      throw createHttpError(400, "Rola owner nie moze zostac zmieniona.");
    }
  }

  const updates = {
    email: nextEmail,
    updated_at: nowIso()
  };

  if (nextPassword) {
    updates.password_hash = await hashPassword(nextPassword);
  }

  if (existingUser.role === "owner") {
    updates.max_bots = null;
    updates.max_ram_mb = null;
    updates.max_cpu_percent = null;
    updates.max_storage_mb = null;
    updates.allowed_service_types = null;
    updates.expires_at = null;
    updates.is_active = 1;
    updates.pending_approval = 0;
  } else {
    updates.max_bots =
      payload.max_bots !== undefined
        ? normalizePlanValue(payload.max_bots, existingUser.max_bots)
        : existingUser.max_bots;
    updates.max_ram_mb =
      payload.max_ram_mb !== undefined
        ? normalizePlanValue(payload.max_ram_mb, existingUser.max_ram_mb)
        : existingUser.max_ram_mb;
    updates.max_cpu_percent =
      payload.max_cpu_percent !== undefined
        ? normalizePlanValue(payload.max_cpu_percent, existingUser.max_cpu_percent)
        : existingUser.max_cpu_percent;
    updates.max_storage_mb =
      payload.max_storage_mb !== undefined
        ? normalizePlanValue(payload.max_storage_mb, existingUser.max_storage_mb)
        : existingUser.max_storage_mb;
    updates.allowed_service_types = JSON.stringify(
      normalizeAllowedServiceTypes(
        payload.allowed_service_types,
        existingUser.allowed_service_types || []
      )
    );
    updates.expires_at =
      payload.expires_at !== undefined
        ? normalizeExpiresAt(payload.expires_at, null)
        : existingUser.expires_at;
    updates.is_active =
      payload.is_active !== undefined
        ? (coerceBoolean(payload.is_active, existingUser.is_active) ? 1 : 0)
        : (existingUser.is_active ? 1 : 0);

    updates.pending_approval =
      payload.pending_approval !== undefined
        ? (coerceBoolean(payload.pending_approval, existingUser.pending_approval) ? 1 : 0)
        : (existingUser.pending_approval ? 1 : 0);

    if (updates.pending_approval) {
      updates.is_active = 0;
    } else if (existingUser.pending_approval && updates.is_active) {
      updates.pending_approval = 0;
    }
  }

  getDb()
    .prepare(
      `
        UPDATE users
        SET email = @email,
            password_hash = COALESCE(@password_hash, password_hash),
            max_bots = @max_bots,
            max_ram_mb = @max_ram_mb,
            max_cpu_percent = @max_cpu_percent,
            max_storage_mb = @max_storage_mb,
            allowed_service_types = @allowed_service_types,
            expires_at = @expires_at,
            is_active = @is_active,
            pending_approval = @pending_approval,
            updated_at = @updated_at
        WHERE id = @id
      `
    )
    .run({
      ...updates,
      id: userId,
      password_hash: updates.password_hash || null
    });

  return getPublicUserById(userId);
}

function deleteUserAccount(userId) {
  const existingUser = getUserById(userId);
  if (!existingUser) {
    throw createHttpError(404, "Uzytkownik nie zostal znaleziony.");
  }

  if (existingUser.role === "owner") {
    throw createHttpError(400, "Konto owner nie moze zostac usuniete.");
  }

  getDb().prepare("DELETE FROM users WHERE id = ?").run(userId);
  return { ok: true };
}

async function ensureDefaultOwner() {
  const existingOwner = getDb().prepare("SELECT * FROM users WHERE role = 'owner' LIMIT 1").get();
  if (existingOwner) {
    getDb()
      .prepare("UPDATE bots SET owner_user_id = ? WHERE owner_user_id IS NULL")
      .run(existingOwner.id);
    return mapUserForClient(existingOwner);
  }

  if (
    OWNER_EMAIL === "admin@bytehost.local" ||
    OWNER_PASSWORD === "change-me-now" ||
    OWNER_PASSWORD.length < MIN_PASSWORD_LENGTH
  ) {
    console.warn(
      "ByteHost owner zostal utworzony z domyslnymi danymi. Ustaw OWNER_EMAIL, OWNER_PASSWORD i JWT_SECRET w .env."
    );
  }

  const owner = await createUserAccount(
    {
      email: OWNER_EMAIL,
      password: OWNER_PASSWORD
    },
    { role: "owner" }
  );

  getDb()
    .prepare("UPDATE bots SET owner_user_id = ? WHERE owner_user_id IS NULL")
    .run(owner.id);

  return owner;
}

async function registerPendingUser(payload) {
  return createUserAccount(payload, {
    pendingApproval: true,
    forceActive: true,
    defaultPlan: PENDING_ACCOUNT_PLAN
  });
}

module.exports = {
  normalizeEmail,
  isAdminUser,
  isUserExpired,
  getUserAccountStatus,
  canUserLogin,
  canUserManageServices,
  canUserCreateServiceType,
  hasProvisionedPlan,
  mapUserForClient,
  getUserById,
  getPublicUserById,
  getUserByEmail,
  listUsers,
  hashPassword,
  verifyPassword,
  createUserAccount,
  updateUserAccount,
  deleteUserAccount,
  ensureDefaultOwner,
  registerPendingUser
};
