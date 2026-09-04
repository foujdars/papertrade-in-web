# PaperTrade branding — September 2026

The active master is `papertrade-brand-master.png`: the user-supplied document
and green/red candle design, recoloured with the built-in image-editing tool.
It is raster artwork; the compatibility SVG files embed the PNG rather than
claiming to be native vectors. The older foreground SVG is historical artwork.

Image-edit brief: preserve the supplied white folded document, black outlines
and horizontal rules, tall green candle on the left and shorter red candle on
the right. Match the app's violet/indigo palette (#7532CF to #5348DC, with
#9676D9 highlights). Extend the background edge-to-edge, without outer white
borders or a baked rounded mask. Add no text, objects or mockup framing.

Run `npm run android:icons` to generate website, favicon, Apple/PWA, Android
adaptive/legacy and splash assets from this master. The launcher surround uses
the app accent #6840D9. Android foregrounds account for its central 72dp viewport
and 66dp safe circle; PWA maskable images include additional safe padding.

The generated PNGs, active native XML and new APK must ship together. Increment
asset URLs and the APK version for a future branding replacement so installed
clients can distinguish it from cached artwork.
