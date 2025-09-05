const express = require('express');
const router = express.Router();

// Comments feature removed intentionally
router.all('*', (_req, res) => {
  res.status(410).json({ error: 'Comments feature removed' });
});

module.exports = router;