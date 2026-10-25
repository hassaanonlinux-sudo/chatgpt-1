const express = require('express');
const { register, login, refresh, logout } = require('../controller/auth.controller');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', logout);

module.exports = router;
