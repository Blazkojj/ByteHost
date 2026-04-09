const express = require("express");

const { loginWithPassword, requireAuth } = require("../lib/auth");
const { getPublicUserById, registerPendingUser } = require("../lib/users");
const { createHttpError, coerceNullableString } = require("../lib/utils");

const router = express.Router();

router.post("/login", async (request, response, next) => {
  try {
    const email = coerceNullableString(request.body.email, null);
    const password = coerceNullableString(request.body.password, null);

    if (!email || !password) {
      throw createHttpError(400, "Podaj email i haslo.");
    }

    response.json(await loginWithPassword(email, password));
  } catch (error) {
    next(error);
  }
});

router.post("/register", async (request, response, next) => {
  try {
    const email = coerceNullableString(request.body.email, null);
    const password = coerceNullableString(request.body.password, null);

    if (!email || !password) {
      throw createHttpError(400, "Podaj email i haslo.");
    }

    const user = await registerPendingUser({ email, password });
    response.status(201).json({
      ok: true,
      message: "Konto zostalo utworzone i czeka na aktywacje przez ownera.",
      user
    });
  } catch (error) {
    next(error);
  }
});

router.get("/me", requireAuth, (request, response, next) => {
  try {
    response.json(getPublicUserById(request.user.id));
  } catch (error) {
    next(error);
  }
});

module.exports = router;
