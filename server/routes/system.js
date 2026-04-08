const express = require("express");

const { collectSystemStats, updateSystemLimits } = require("../lib/system");
const { coerceNullableNumber } = require("../lib/utils");

const router = express.Router();

router.get("/stats", async (_request, response, next) => {
  try {
    response.json(await collectSystemStats());
  } catch (error) {
    next(error);
  }
});

router.patch("/limits", async (request, response, next) => {
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
