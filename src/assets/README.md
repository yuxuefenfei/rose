# Rose petal surface

- Final runtime asset: `rose-petal-albedo.webp` (1024 × 1024, 217,980 bytes).
- Generation mode: built-in `image_gen.imagegen`, not the CLI/API fallback.
- Source: AI-generated for this project on 2026-10-19; this is not a photograph or a biological scan.
- Processing: resized and encoded as WebP for local application delivery. The original generated PNG remains in Codex generated images and the ignored `.verification/` directory.
- Usage: sRGB albedo on each 3D petal, blended with the base pigment to keep the generated microtexture subtle. Normal relief and roughness are calculated separately in `src/materials.js`.

## Final generation prompt

Use case: photorealistic-natural. Asset type: square 1024x1024 PBR BASE COLOR texture map for a realistic interactive 3D red rose petal. Create a highly realistic botanical macro texture of the surface of ONE fresh deep crimson rose petal. The ENTIRE square is filled edge-to-edge with uninterrupted rose petal tissue, a flat cropped section of its surface; no petal silhouette, no flower, no other objects, no borders. Rich natural crimson / burgundy pigment, subtle soft irregular pigment clouds, very fine branching capillary striations running mostly vertically, microscopic dense velvety epidermal papillae. Delicate moist living plant tissue, soft, not metallic and not fabric. Uniform cross-polarized diffuse illumination, all lighting removed as in an albedo scan: NO cast shadows, NO specular highlights, NO light-to-dark directional gradient, NO obvious folds. The microtexture should be photographically natural and subtle at true petal scale, not enlarged coarse leather bumps. Relatively even crimson coloration, variation within 15%, no bright white areas. This image will be UV-mapped onto each curved 3D petal with physically based lighting and a separate normal/bump map. No text, no labels, no watermark. Opaque texture, no transparency.
