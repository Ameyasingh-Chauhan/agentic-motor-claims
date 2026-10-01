# Vertex AI service-account key

Place the Google Cloud service-account JSON key for Vertex AI in this folder, e.g.
`server/credentials/vertex-key.json`, and set its filename in `server/.env`:

```ini
GOOGLE_APPLICATION_CREDENTIALS=credentials/vertex-key.json
```

- This folder's `*.json` files are git-ignored. Never commit, print or share the key.
- Only the Python server reads it; the browser never sees it.
- Without a key the app runs in **Demo mode** (pre-recorded AI responses).
