import { createApp } from './app.js';

const port = Number(process.env.PORT || 4000);
createApp().server.listen(port, () => console.log(`Krewzo backend on http://localhost:${port}`));
