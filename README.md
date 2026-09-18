# Dithermaxxing

A small offline browser tool for turning images into chunky green phosphor-style ordered dithers.

The app runs entirely in the browser with Canvas 2D. There is no backend, build step, package install, or network dependency.

## Files

- `index.html` - app markup
- `styles.css` - interface styling
- `app.js` - image loading, canvas processing, presets, and export

## Use

Open `index.html` in a browser, then drop or select an image.

The processing pipeline is:

```text
source RGB
-> luminance
-> levels and tonal controls
-> gamma
-> Bayer threshold offset
-> posterize
-> green gradient palette
-> output RGB
```

## Controls

- `Fit mode` controls how the source image is placed into the output frame.
- `Format` selects Square (1:1), Horizontal (16:9), Vertical (9:16), or Custom for an unrestricted ratio.
- `Size` offers three resolutions per format: Square has 512 x 512, 1024 x 1024, and 2048 x 2048; Horizontal has 1280 x 720, 1920 x 1080, and 2560 x 1440; Vertical has 720 x 1280, 1080 x 1920, and 1440 x 2560. The default is Horizontal at 1920 x 1080.
- Choosing Custom size reveals `Output width` and `Output height`. Editing either updates the other according to the selected format; Custom format keeps them independent. Dimensions are rounded to whole pixels and limited to 8-4096 px.
- `Pixel size` controls both the image mosaic size and the enlarged dither grid. It steps through `1x`, `2x`, `4x`, `8x`, `16x`, and `32x`.
- `Bayer size` changes the ordered dither matrix structure.
- `Dither strength` controls how strongly the Bayer threshold shifts luminance.
- `Posterize levels` controls the number of luminance bands before palette mapping.
- `Black point`, `White point`, `Gamma`, `Contrast`, and `Brightness` tune the luminance before dithering.
- The palette is fixed: shadow `#0d0d0d`, mid `#00ff48`, and highlight `#8cf2c3`. Color overrides and inversion from older JSON presets are ignored.

## Export

- `Download PNG` saves the processed canvas as a PNG.
- `Copy PNG` copies the processed canvas to the clipboard when supported by the browser.
- `Save JSON` exports the current settings as a preset.
- `Load JSON` restores a saved preset. Presets store settings only, not the source image.

## Notes

For a classic block-aligned ordered dither, use `Posterize levels` set to `2` and increase `Pixel size` until the dither grid has the desired scale.
