const express = require("express");

const { requireAdmin, requireAuth } = require("../lib/auth");
const { listMinecraftVersions } = require("../lib/minecraft");
const { collectSystemStats, updateSystemLimits } = require("../lib/system");
const { coerceNullableNumber } = require("../lib/utils");

const router = express.Router();

router.use(requireAuth);

router.get("/stats", async (request, response, next) => {
  try {
    response.json(await collectSystemStats(request.user));
  } catch (error) {
    next(error);
  }
});

router.get("/minecraft-versions", async (_request, response, next) => {
  try {
    response.json(await listMinecraftVersions());
  } catch (error) {
    next(error);
  }
});

router.patch("/limits", requireAdmin, async (request, response, next) => {
  try {
    response.json(
      updateSystemLimits({
        ram_limit_mb: coerceNullableNumber(request.body.ram_limit_mb, 0),
        cpu_limit_percent: coerceNullableNumber(request.body.cpu_limit_percent, 0),
        storage_limit_mb: coerceNullableNumber(request.body.storage_limit_mb, 0),
        max_bots: coerceNullableNumber(request.body.max_bots, 0)
      })
    );
  } catch (error) {
    next(error);
  }
});

module.exports = router;
