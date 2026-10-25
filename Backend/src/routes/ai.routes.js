const express = require('express'); 
const router = express.Router();

const { generateContentController } = require('../controller/ai.controller');
const requireAuth = require('../middleware/require-auth');


router.post('/generate', requireAuth, generateContentController);

module.exports = router;