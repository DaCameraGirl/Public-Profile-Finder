# Missing Person Support Kit

A static GitHub Pages app for building a public case page, printable flyer, and QR code using only public information you are authorized to share.

This project is intentionally constrained:

- No face recognition
- No reverse-image matching
- No private-account access
- No device tracking
- No hidden tip inbox
- No secure evidence storage

What it does:

- build a shareable flyer page from public case details
- generate a QR code for the flyer
- support printing and install-to-home-screen
- keep a local response checklist in the browser
- route people to official case links and agency contacts

## Run

```bash
npm start
```

Then open `http://localhost:4173`.

## GitHub Pages

This app is designed to work as a static GitHub Pages site.

- the root page redirects into `web/`
- the flyer share link stores the public case data in the URL hash
- QR sharing works without a backend
- the checklist stays local to the current browser

Because the share link contains the case data, do not enter private notes, non-public evidence, or sensitive contact information into the form.

## Official-resource intent

This repo is for public support materials only. It should be used to:

- link to official public case pages
- show the public investigating-agency contact
- direct tips to official phone numbers, emails, or tip forms

For emergencies, contact local law enforcement or 911. For missing-child cases in the United States, use NCMEC guidance at `https://us.missingkids.org/MissingChild`. For broader missing-person resources, see NamUs at `https://namus.nij.ojp.gov/what-namus`.
