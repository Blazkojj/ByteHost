const express = require("express");

const { requireAdmin } = require("../lib/auth");
const { getDb, mapBotRow } = require("../lib/db");
const { createBot, deleteBotById } = require("../lib/bots");
const { resolveProvisionPlan } = require("../lib/bytehostPlans");
const {
  createUserAccount,
  deleteUserAccount,
  getUserByEmail,
  getUserById,
  listUsers,
  updateUserAccount
} = require("../lib/users");
const { createHttpError, coerceNullableString } = require("../lib/utils");

const router = express.Router();

router.use(requireAdmin);

router.get("/users", (_request, response, next) => {
  try {
    response.json(listUsers());
  } catch (error) {
    next(error);
  }
});

router.post("/users", async (request, response, next) => {
  try {
    response.status(201).json(await createUserAccount(request.body));
  } catch (error) {
    next(error);
  }
});

router.patch("/users/:id", async (request, response, next) => {
  try {
    response.json(await updateUserAccount(request.params.id, request.body));
  } catch (error) {
    next(error);
  }
});

function numberOrZero(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function mergeAllowedServiceTypes(currentValue, serviceType) {
  const current = Array.isArray(currentValue) ? currentValue : [];
  return [...new Set([...current, serviceType])];
}

function sanitizeProvisionDays(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 3650) {
    throw createHttpError(400, "Podaj czas trwania planu w dniach od 1 do 3650.");
  }

  return parsed;
}

function addDaysToAccount(user, days) {
  const currentExpiry = user.expires_at ? new Date(user.expires_at) : null;
  const startTime =
    currentExpiry && !Number.isNaN(currentExpiry.getTime()) && currentExpiry.getTime() > Date.now()
      ? currentExpiry.getTime()
      : Date.now();

  return new Date(startTime + days * 24 * 60 * 60 * 1000).toISOString();
}

function buildProvisionedUserPatch(user, plan, days) {
  return {
    max_bots: numberOrZero(user.max_bots) + plan.serviceSlots,
    max_ram_mb: numberOrZero(user.max_ram_mb) + plan.ramMb,
    max_cpu_percent: numberOrZero(user.max_cpu_percent) + plan.cpuPercent,
    max_storage_mb: numberOrZero(user.max_storage_mb) + plan.storageMb,
    allowed_service_types: mergeAllowedServiceTypes(
      user.allowed_service_types,
      plan.serviceType
    ),
    expires_at: addDaysToAccount(user, days),
    is_active: true,
    pending_approval: false
  };
}

function buildProvisionedServicePayload(body, plan) {
  const defaultName = `${plan.serviceLabel} ${plan.planLabel}`;

  return {
    service_type: plan.serviceType,
    name: coerceNullableString(body.name, defaultName),
    description: coerceNullableString(
      body.description,
      `Usluga utworzona przez bota Discord: ${plan.serviceLabel} ${plan.planLabel}.`
    ),
    ram_limit_mb: plan.ramMb,
    cpu_limit_percent: plan.cpuPercent,
    install_on_create: false,
    auto_restart: true,
    game_engine: body.game_engine,
    public_host: body.public_host,
    minecraft_version: body.minecraft_version,
    minecraft_server_type: body.minecraft_server_type || "vanilla",
    minecraft_max_players: body.minecraft_max_players || 20,
    fivem_max_clients: body.fivem_max_clients || 48,
    fivem_project_name: body.fivem_project_name,
    fivem_license_key: body.fivem_license_key,
    fivem_tags: body.fivem_tags,
    fivem_locale: body.fivem_locale,
    fivem_onesync_enabled: body.fivem_onesync_enabled
  };
}

router.post("/provision-service", async (request, response, next) => {
  try {
    const email = coerceNullableString(request.body.email, "").toLowerCase();
    const plan = resolveProvisionPlan(
      request.body.service_type || request.body.typ_servera || request.body.type,
      request.body.plan
    );
    const days = sanitizeProvisionDays(request.body.days || request.body.dni);

    if (!email) {
      throw createHttpError(400, "Podaj email uzytkownika.");
    }

    if (!plan) {
      throw createHttpError(400, "Nieznany typ hostingu albo plan.");
    }

    const user = getUserByEmail(email);
    if (!user) {
      throw createHttpError(404, `Nie znaleziono uzytkownika ${email}.`);
    }

    const updatedUser = await updateUserAccount(user.id, buildProvisionedUserPatch(user, plan, days));
    const updatedOwner = getUserById(user.id);
    const service = await createBot(
      request.user,
      buildProvisionedServicePayload(request.body, plan),
      null,
      {
        owner: updatedOwner,
        skipOwnerProvisionCheck: true,
        skipManagedDownload: true
      }
    );

    response.status(201).json({
      ok: true,
      user: updatedUser,
      service,
      plan,
      days,
      expires_at: updatedUser.expires_at
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/users/:id", async (request, response, next) => {
  try {
    const user = getUserById(request.params.id);
    if (!user) {
      response.json({ ok: true });
      return;
    }

    const ownedBots = getDb()
      .prepare("SELECT * FROM bots WHERE owner_user_id = ?")
      .all(user.id)
      .map(mapBotRow);

    for (const bot of ownedBots) {
      await deleteBotById(bot.id, null, { skipAccessCheck: true });
    }

    response.json(deleteUserAccount(user.id));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
