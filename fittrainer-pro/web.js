const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8080;

// Serve renderer build
app.use(express.static(path.join(__dirname, 'renderer/dist')));

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'renderer/dist/index.html'));
});

app.listen(PORT, () => {
  console.log(`FitTrainer Pro web preview running on port ${PORT}`);
});
