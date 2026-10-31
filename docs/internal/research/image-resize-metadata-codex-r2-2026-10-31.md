completed
### Key Insights

- Adopt the conservative Standard XMP copy for `keep` only. The local-name substring test is sound for excluding the named standardized properties: XML element/attribute names are literal, prefixes do not change local names, and JPEG Standard XMP must be UTF-8. False positives only cause a conservative drop. — Source: [Adobe XMP Part 3](https://github.com/adobe/XMP-Toolkit-SDK/blob/main/docs/XMPSpecificationPart3.pdf); analysis
- This is not semantic XMP reconciliation. Unknown/custom pixel-dependent properties, develop recipes, provenance identifiers, timestamps, native-metadata digests, and color-profile descriptions may still become stale. Therefore expose it as `xmpOutcome: "verbatim"`, never “normalized.” — Source: [Adobe XMP specifications](https://developer.adobe.com/xmp/docs/xmp-specifications/); analysis
- UTF-16/32 XMP should be dropped: JPEG-embedded Standard XMP is specified as UTF-8. Require a fatal UTF-8 decode before eligibility; BOM and padding are harmless, while invalid UTF-8 fails closed. — Source: [Adobe XMP Part 3](https://github.com/adobe/XMP-Toolkit-SDK/blob/main/docs/XMPSpecificationPart3.pdf)
- No substantive metadata-design decision remains open after adopting this explicitly limited XMP contract. — Source: analysis

### Considerations

- Require exactly one bounded Standard XMP APP1 with the official signature. Any Extended XMP APP1, multiple Standard packets, or ASCII local name `HasExtendedXMP` causes all XMP to be dropped. Searching only for the literal prefix `xmpNote:` would be insufficient because prefixes are replaceable. — Source: [Adobe XMP Part 3](https://github.com/adobe/XMP-Toolkit-SDK/blob/main/docs/XMPSpecificationPart3.pdf); analysis
- Expand the proposed denylist beyond dimensions: `Orientation`, `PixelXDimension`, `PixelYDimension`, `ImageWidth`, `ImageLength`, `XResolution`, `YResolution`, `ResolutionUnit`, `ColorSpace`, `ICCProfile`, `PhotometricInterpretation`, `BitsPerSample`, `SamplesPerPixel`, `YCbCrSubSampling`, `CompressedBitsPerPixel`, `NativeDigest`, and `LegacyIPTCDigest`. Any byte occurrence conservatively drops XMP. — Source: [CIPA Exif](https://www.cipa.jp/e/std/std-sec.html); analysis
- Also drop packets containing common derivative/provenance fields `DocumentID`, `InstanceID`, `OriginalDocumentID`, `DerivedFrom`, `History`, `MetadataDate`, or `ModifyDate`, or the literal Camera Raw namespace/prefix markers `camera-raw-settings` or `crs:`. This avoids copying obviously false version identity and develop-state claims; arbitrary custom schemas remain outside the guarantee. — Source: analysis
- Lightroom/Camera Raw crop and region coordinates may be normalized and geometrically valid after uniform scaling, but copying a develop recipe can invite another editor to apply it again. Conservative drop is preferable to reasoning about individual `crs:*` fields. — Source: analysis
- Copying XMP verbatim involves no XML/DOM operation and therefore no Trusted Types sink. The packet remains inert bytes; downstream servers must still treat metadata as untrusted input. — Source: [MDN DOMParser](https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString); analysis
- Only `keep` may use this XMP bonus. `keep-no-gps` must drop XMP because capture/location fields such as City, Sublocation, or LocationCreated need not contain the substring `GPS`; `copyright` and `none` also drop it. — Source: [IPTC Photo Metadata Standard](https://iptc.org/std/photometadata/specification/IPTC-PhotoMetadata-2025.1.html)

### Recommendations

- Final JPEG transform order: SOI → one validated/patched EXIF APP1 → eligible verbatim Standard XMP APP1 → rebuilt Photoshop APP13 containing only IPTC `8BIM` resource `0x0404` → untouched encoder marker/scan stream.
- Patch EXIF in place with original `II`/`MM` byte order: Orientation → 1; existing PixelX/Y and other supported structural fields → output values; missing tags remain missing. Preserve layout and offsets so MakerNote remains viable.
- Disconnect IFD1, zero validated thumbnail data without truncating the APP1, and treat cycles, overlaps, duplicates, invalid types, or out-of-bounds offsets as an invalid EXIF family. Malformed optional metadata is stripped and reported rather than making a decodable image fail.
- `keep` preserves validated EXIF including GPS, eligible XMP verbatim, and validated IPTC. Place a prominent GPS warning beside the option.
- `keep-no-gps` zeroes standard EXIF GPS structures and drops XMP; rebuilt IPTC removes all standardized location fields. Document that opaque MakerNote/free-text content prevents a forensic “no coordinates anywhere” guarantee.
- `copyright` rebuilds only EXIF Artist/Copyright and IPTC By-line/Copyright Notice. `none` retains only rendering/structural data such as the new encoder’s ICC, JFIF, and APP14.
- Never copy the original ICC APP2 or Adobe APP14 after re-encoding; retain encoder-generated versions. Special JPEGs—MPF/MPO, gain maps, C2PA/JUMBF, or trailing images—remain exact-passthrough-only and are rejected when transformation is required.
- For already-compliant ordinary JPEG/PNG under selective modes, use lossless marker/chunk rewriting and preserve pixel/entropy data. Unsupported passthrough formats under privacy modes reject with `metadata-policy-unsupported`, never upload with a warning.
- Count the final assembled metadata in every `maxBytes` decision. Valid requested metadata that prevents compliance produces `metadata-too-large`; it is not silently discarded.
- Adapter information should report per-family outcomes, including `exifOutcome`, `xmpOutcome: "exact"|"verbatim"|"dropped"|"absent"`, `iptcOutcome`, `gpsPresent: true|false|"unknown"`, and `contentCredentials`. Complete the v0.90 global FIFO, abort/retry behavior, server-limit synchronization, and agreed fixtures; no further owner metadata decision is required.

### Sources

| # | URL | Description |
|---|-----|-------------|
| 1 | https://github.com/adobe/XMP-Toolkit-SDK/blob/main/docs/XMPSpecificationPart3.pdf | JPEG Standard/Extended XMP encoding and storage |
| 2 | https://developer.adobe.com/xmp/docs/xmp-specifications/ | XMP data model, serialization, schemas, and reconciliation |
| 3 | https://www.cipa.jp/e/std/std-sec.html | Current CIPA Exif standards |
| 4 | https://www.cipa.jp/std/documents/e/DC-008-2012_E_C.pdf | EXIF/TIFF tags and JPEG APP1 structure |
| 5 | https://iptc.org/std/photometadata/specification/IPTC-PhotoMetadata-2025.1.html | IPTC rights and location properties |
| 6 | https://www.adobe.com/devnet-apps/photoshop/fileformatashtml/ | Photoshop APP13/8BIM resource format |
| 7 | https://developer.mozilla.org/en-US/docs/Web/API/DOMParser/parseFromString | DOMParser Trusted Types behavior |
| 8 | https://html.spec.whatwg.org/multipage/canvas.html | Canvas JPEG serialization and color profiles |

### Open Questions

- None. The accepted XMP behavior is deliberately “eligible opaque Standard XMP preservation,” not XML rewriting or semantic reconciliation.

### Confidence Level

- high

### Suggested Status (advisory)

- CONSENSUS
