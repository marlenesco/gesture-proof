import { createWriteStream } from 'node:fs';
import { mkdir, rename, stat, unlink } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { finished } from 'node:stream/promises';

const modelUrl =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const destination = resolve('public/models/hand_landmarker.task');
const temporaryDestination = `${destination}.download`;

await mkdir(dirname(destination), { recursive: true });

const response = await fetch(modelUrl);
if (!response.ok || !response.body) {
  throw new Error(
    `Model download failed: ${response.status} ${response.statusText}`,
  );
}

try {
  await finished(
    Readable.fromWeb(response.body).pipe(
      createWriteStream(temporaryDestination),
    ),
  );
  await rename(temporaryDestination, destination);
} catch (error) {
  await unlink(temporaryDestination).catch(() => undefined);
  throw error;
}

const modelStats = await stat(destination);
console.log(`Downloaded ${destination} (${modelStats.size} bytes).`);
