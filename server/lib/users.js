const bcrypt = require("bcryptjs");

const { DEFAULT_USER_PLAN, OWNER_EMAIL, OWNER_PASSWORD } = require("../config");
const { getDb, mapUserRow } = require("./db");
const {
  createHttpError,
  coerceBoolean,
  coerceNullableNumber,
  coerceNullableString,
  nowIso,
  randomId
} = require("./utils");

const MIN_PASSWORD_LENGTH = 8;

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

  if (!user.is_active) {
    return "INACTIVE";
  }

  if (isUserExpired(user)) {
    return "EXPIRED";
  }

  return "ACTIVE";
}

function canUserLogin(user) {
  return Boolean(user && user.is_active);
}

function canUserManageServices(user) {
  return Boolean(user && user.is_active && !isUserExpired(user));
}

function mapUserForClient(user) {
  const mapped = mapUserRow(user);
  if (!mapped) {
    return null;
  }

  const { password_hash, ...safeUser } = mapped;
  return {
    ...safeUser,
    is_admin: isAdminUser(mapped),
    account_status: getUserAccountStatus(mapped),
    limits: {
      max_bots: safeUser.max_bots,
      max_ram_mb: safeUser.max_ram_mb,
      max_cpu_percent: safeUser.max_cpu_percent,
      max_storage_mb: safeUser.max_storage_mb
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
    .prepare("SELECT * FROM users ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END, created_at ASC")
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
  const createdAt = nowIso();

  const userRecord = {
    id: randomId(),
    email,
    password_hash: await hashPassword(password),
    role,
    max_bots: role === "owner"
      ? null
      : normalizePlanValue(payload.max_bots, DEFAULT_USER_PLAN.max_bots),
    max_ram_mb: role === "owner"
      ? null
      : normalizePlanValue(payload.max_ram_mb, DEFAULT_USER_PLAN.max_ram_mb),
    max_cpu_percent: role === "owner"
      ? null
      : normalizePlanValue(payload.max_cpu_percent, DEFAULT_USER_PLAN.max_cpu_percent),
    max_storage_mb: role === "owner"
      ? null
      : normalizePlanValue(payload.max_storage_mb, DEFAULT_USER_PLAN.max_storage_mb),
    expires_at: role === "owner" ? null : normalizeExpiresAt(payload.expires_at),
    is_active: role === "owner" ? 1 : (coerceBoolean(payload.is_active, true) ? 1 : 0),
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
          expires_at,
          is_active,
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
          @expires_at,
          @is_active,
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
    updates.expires_at = null;
    updates.is_active = 1;
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
    updates.expires_at =
      payload.expires_at !== undefined
        ? normalizeExpiresAt(payload.expires_at, null)
        : existingUser.expires_at;
    updates.is_active =
      payload.is_active !== undefined
        ? (coerceBoolean(payload.is_active, existingUser.is_active) ? 1 : 0)
        : (existingUser.is_active ? 1 : 0);
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
            expires_at = @expires_at,
            is_active = @is_active,
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

module.exports = {
  normalizeEmail,
  isAdminUser,
  isUserExpired,
  getUserAccountStatus,
  canUserLogin,
  canUserManageServices,
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
  ensureDefaultOwner
};
