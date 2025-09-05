const express = require('express');
const router = express.Router();

// Annotations feature removed intentionally
router.all('*', (_req, res) => {
  res.status(410).json({ error: 'Annotations feature removed' });
});

module.exports = router;