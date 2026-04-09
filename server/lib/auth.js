const jwt = require("jsonwebtoken");

const { JWT_EXPIRES_IN, JWT_SECRET } = require("../config");
const { createHttpError } = require("./utils");
const {
  canUserLogin,
  getPublicUserById,
  getUserByEmail,
  isAdminUser,
  mapUserForClient,
  verifyPassword
} = require("./users");

function issueAuthToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function readBearerToken(request) {
  const header = request.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim();
}

function attachOptionalAuth(request, _response, next) {
  const token = readBearerToken(request);
  if (!token) {
    request.user = null;
    next();
    return;
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = getPublicUserById(payload.sub);
    request.user = user || null;
    next();
  } catch (_error) {
    request.user = null;
    next();
  }
}

function requireAuth(request, _response, next) {
  if (!request.user) {
    next(createHttpError(401, "Zaloguj sie, aby kontynuowac."));
    return;
  }

  next();
}

function requireAdmin(request, _response, next) {
  if (!request.user) {
    next(createHttpError(401, "Zaloguj sie, aby kontynuowac."));
    return;
  }

  if (!isAdminUser(request.user)) {
    next(createHttpError(403, "Brak dostepu do panelu administratora."));
    return;
  }

  next();
}

async function loginWithPassword(email, password) {
  const user = getUserByEmail(email);
  if (!user) {
    throw createHttpError(401, "Nieprawidlowy email lub haslo.");
  }

  const passwordMatches = await verifyPassword(password, user.password_hash);
  if (!passwordMatches) {
    throw createHttpError(401, "Nieprawidlowy email lub haslo.");
  }

  if (!canUserLogin(user)) {
    throw createHttpError(403, "To konto jest nieaktywne.");
  }

  return {
    token: issueAuthToken(user),
    user: mapUserForClient(user)
  };
}

module.exports = {
  attachOptionalAuth,
  requireAuth,
  requireAdmin,
  loginWithPassword,
  issueAuthToken
};
