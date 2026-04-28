# Public Profile Finder

An app to set your mind at ease using public signals only.

A lawful MVP for finding likely public-profile matches using public signals only.

This project is intentionally constrained:

- No face recognition
- No private-account access
- No logged-in scraping
- No live or inferred device location
- No covert monitoring

The app now has two source modes:

- demo mode using bundled mock profiles
- live mode using SerpApi or Brave Search over public web results on supported profile domains

It also has a browser-only fallback mode for GitHub Pages:

- free static hosting with no backend required
- QR/share/install flow for phone use
- local scoring for pasted known public profile URLs
- prepared manual search links when no paid API-backed live search is available

It scores public candidates with these signals:

- display name similarity
- known handle similarity
- known public profile URLs on supported platforms
- public bio keyword overlap
- public location text overlap
- reused public photo URLs or filenames
- reverse image exact matches from direct public image URLs when SerpApi is enabled

## Run

```bash
npm start
```

Then open `http://localhost:4173`.

## GitHub Pages Mode

If you publish the repo through GitHub Pages, open the site root and it will redirect into `web/`.

What works there:

- QR sharing
- install prompt when the browser supports it
- manual search-link generation
- local scoring of pasted supported public profile URLs
- bundled demo dataset

What does not magically become free:

- SerpApi credits
- other paid search APIs
- server-side live search without a backend

## Live Source Setup

Create a local `.env` file from `.env.example` and add your preferred live search key:

```powershell
Copy-Item .env.example .env
```

Then set:

```text
SERPAPI_API_KEY=your_api_key_here
```

`SERPAPI_API_KEY` is preferred when both are present. With no key present, the app stays in demo mode.

## Input Tips

- Put supported profile page links in `Known public profile URLs`.
- Put only direct public image files in `Known public image URLs`.
- Direct image search currently expects a public URL ending in `.jpg`, `.jpeg`, `.png`, `.webp`, or `.gif`.
- Profile pages like LinkedIn or Instagram should not be pasted into the image field.

## Why This Shape

Step one is a runnable repo with a clear policy boundary and a scoring engine you can extend later with official APIs or compliant public-web connectors.

## Next Steps

1. Add result enrichment for public profile pages after discovery.
2. Add source-specific rate limits and retry handling.
3. Add saved searches and audit logs.
4. Add manual review tooling before any result is treated as a match.
