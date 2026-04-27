# Public Profile Finder

An app to set your mind at ease using public signals only.

A lawful MVP for finding likely public-profile matches using public signals only.

This project is intentionally constrained:

- No face recognition
- No private-account access
- No logged-in scraping
- No live or inferred device location
- No covert monitoring

The current MVP scores mock public profiles with these signals:

- display name similarity
- known handle similarity
- public bio keyword overlap
- public location text overlap
- reused public photo URLs or filenames

## Run

```bash
npm start
```

Then open `http://localhost:4173`.

## Why This Shape

Step one is a runnable repo with a clear policy boundary and a scoring engine you can extend later with official APIs or compliant public-web connectors.

## Next Steps

1. Replace mock profiles with API-backed public sources.
2. Add source-specific adapters with rate limits and terms checks.
3. Add saved searches and audit logs.
4. Add manual review tooling before any result is treated as a match.
