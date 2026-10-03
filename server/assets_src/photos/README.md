# Claim photos (source files)

These are the original, user-provided photos behind every claim photo in the app. They are never served directly:
`scripts/build_stock_photos.py` turns them into blurred-plate WebP files in `client/public/assets/stock/<category>/`.

| What | Where |
|---|---|
| Source photos (this folder) | `server/assets_src/photos/<photo_id>.jpg` |
| Catalogue: category, vehicle, colour, damage boxes, plate boxes, crop | `server/scripts/stock_curation.py` (`PHOTOS` list) |
| Generated manifest (do not edit by hand) | `server/data/stock_photo_manifest.json` |
| Built images + `CREDITS.json` | `client/public/assets/stock/` |
| Review sheets (git-ignored) | `server/.cache/stock/review/` |

The photo id is the file name without its extension, and it is how the seed and the five demo scenarios refer to a photo
(`SCENARIO_PHOTOS` in `scripts/seed.py`), so **keep the same file name** when you replace a photo.

## Replacing a photo

All commands run from `server/` in a terminal where the virtual environment is active (`.venv\Scripts\activate`).
`car_rear_01` is used as the example.

1. **Swap the file.** Save the new photo over `server/assets_src/photos/car_rear_01.jpg` (same name). Use a real photo,
   ideally at least 1600 px on the long side; JPEG, PNG, WebP and AVIF all work, even under a `.jpg` name. A web page saved
   as `.jpg` does not: the catalogue step reports it as "Not an image".

2. **Draw a coordinate grid on it** to read box positions:

   ```bat
   python scripts/render_annotations.py grid car_rear_01
   ```

   Open `server/.cache/stock/review/grid_car_rear_01.jpg`. The numbers along the top are x and the numbers down the left
   are y, both 0–1000, whatever the image size.

3. **Update its catalogue entry** in `scripts/stock_curation.py` (search for `"car_rear_01"`):
   - Damage boxes: `("PART", "damage word", [ymin, xmin, ymax, xmax], D)`. Use `P` instead of `D` for pre-existing damage
     (drawn red). `PART` must be a part of that vehicle type (`scripts/reference_data.py`); the catalogue step refuses an
     unknown part. Damage words such as `broken`, `deformed`, `shattered` mean "replace"; `dent` and `scratch` mean "repair".
   - Plate boxes: `[[ymin, xmin, ymax, xmax], ...]` around every **readable** number plate (these are blurred). Leave out
     plates that cannot be read.
   - Check `colour`, `body`, `view` and `incidents` still describe the new photo. Remove the `crop` if the new photo has no
     border or footer to cut off. A crop uses the same 0–1000 coordinates, and boxes are still placed on the uncropped photo.
   - Clean vehicles (category `"clean"`) take no damage boxes; an optional `model_key` (e.g. `"ROY-CLA"`) makes them the
     thumbnail for that model.

4. **Rebuild the manifest and the images**, then check the boxes by eye:

   ```bat
   python scripts/stock_curation.py
   python scripts/build_stock_photos.py --prune-legacy
   python scripts/render_annotations.py manifest --ids car_rear_01
   ```

   Open `server/.cache/stock/review/manifest_01.jpg`: green = fresh damage, red = pre-existing, dashed grey = plates
   (already blurred in the built image). Repeat steps 3–4 until every box sits on the damage.

5. **Re-run the seed** so claims pick up the new boxes, colours and image sizes. It takes about 9 minutes and preserves
   `server/data/users.json`; let it finish (it renders every claim document):

   ```bat
   python scripts/seed.py
   ```

6. **Restart uvicorn.** The JSON store caches data in memory, so a running server keeps showing the old claims. Stop it
   (Ctrl+C) and start it again:

   ```bat
   uvicorn app.main:app --reload --port 8000
   ```

7. **Verify:** `pytest -v` passes, and `python scripts/render_annotations.py scenarios` writes
   `server/.cache/stock/review/scenarios_01.jpg` with the boxes the demo scenarios actually carry. Then hard-refresh the
   browser (Ctrl+F5).

## Adding a new photo

Do the same as above with a new file name. Add a new `photo(...)` entry to `PHOTOS` in step 3 (the catalogue step prints
"Not catalogued: …" for any file without one). To make a demo scenario use it, change `SCENARIO_PHOTOS` in `scripts/seed.py`.

## Photos to replace before the client demo

The list, with each photo's issue (watermark, site mark, low resolution), is kept in `docs/PROGRESS.md` under Stage 1 →
"Known follow-ups".
