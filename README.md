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
- `Output width` and `Output height` set the final PNG dimensions.
- `Pixel size` controls both the image mosaic size and the enlarged dither grid. It steps through `1x`, `2x`, `4x`, `8x`, `16x`, and `32x`.
- `Bayer size` changes the ordered dither matrix structure.
- `Dither strength` controls how strongly the Bayer threshold shifts luminance.
- `Posterize levels` controls the number of luminance bands before palette mapping.
- `Black point`, `White point`, `Gamma`, `Contrast`, and `Brightness` tune the luminance before dithering.
- `Shadow`, `Mid`, and `Highlight` colors define the final green gradient palette.
- `Invert palette` flips the palette mapping.

## Export

- `Download PNG` saves the processed canvas as a PNG.
- `Copy PNG` copies the processed canvas to the clipboard when supported by the browser.
- `Save JSON` exports the current settings as a preset.
- `Load JSON` restores a saved preset. Presets store settings only, not the source image.

## Notes

For a classic block-aligned ordered dither, use `Posterize levels` set to `2` and increase `Pixel size` until the dither grid has the desired scale.
