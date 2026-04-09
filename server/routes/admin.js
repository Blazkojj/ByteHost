const express = require("express");

const { requireAdmin } = require("../lib/auth");
const { getDb, mapBotRow } = require("../lib/db");
const { deleteBotById } = require("../lib/bots");
const {
  createUserAccount,
  deleteUserAccount,
  getUserById,
  listUsers,
  updateUserAccount
} = require("../lib/users");

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
