import { createApp } from './app.js';
import { startReleaseWatch } from './releases.js';

const port = Number(process.env.PORT || 4000);
createApp().server.listen(port, () => console.log(`Krewzo backend on http://localhost:${port}`));
startReleaseWatch();
