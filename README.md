# ScreenshotNumbererWeb

Static browser app for numbering screenshots in the same style as your desktop tool.

## What is inside

- `index.html` - UI shell
- `styles.css` - mobile-friendly layout
- `app.js` - batch image processing with Canvas and ZIP export
- `assets/DelaGothicOne-Regular.ttf` - local font file for GitHub Pages

## How to use locally

1. Open `index.html` in a browser.
2. Pick screenshots.
3. Adjust settings if needed.
4. Tap `Generate preview`.
5. Tap `Download ZIP`.

## GitHub Pages deploy

This folder is fully standalone. You can move it to another repository and publish it as static files.

Simplest option:

1. Put the contents of this folder into a GitHub repository.
2. In GitHub, open `Settings -> Pages`.
3. Set source to `Deploy from a branch`.
4. Choose the branch and root folder.
5. Save and wait for the site URL.

## Notes

- Everything runs fully in the browser.
- Images are not uploaded to a server.
- ZIP export is built directly in JavaScript, so no backend is required.
