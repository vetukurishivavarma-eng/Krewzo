import { restoreSnapshot, startSnapshots } from './snapshot.js';

// Restore the durable copy (Neon) before anything opens the SQLite file.
await restoreSnapshot();
const { createApp } = await import('./app.js');
const { startReleaseWatch } = await import('./releases.js');

const port = Number(process.env.PORT || 4000);
createApp().server.listen(port, () => console.log(`Krewzo backend on http://localhost:${port}`));
startReleaseWatch();
startSnapshots();
