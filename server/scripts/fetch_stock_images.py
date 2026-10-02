"""Fetch stock media when credentials/network are available; always create safe fallbacks."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFilter
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/"client"/"public"/"assets"/"stock"
SETS=["car-front","car-rear","car-side","scratched-door","broken-headlamp","cracked-windshield","two-wheeler","flooded-car","commercial-vehicle","clean-vehicle"]
def make_one(name):
 d=OUT/name; d.mkdir(parents=True,exist_ok=True); im=Image.new("RGB",(800,450),(245,246,248)); draw=ImageDraw.Draw(im); draw.rounded_rectangle((120,170,680,340),radius=28,outline=(107,114,128),width=8); draw.ellipse((190,300,270,380),outline=(79,155,255),width=8); draw.ellipse((530,300,610,380),outline=(79,155,255),width=8); draw.line((220,220,580,220),fill=(249,115,22),width=8); im.save(d/"fallback.webp",format="WEBP",quality=84); im.resize((320,180)).save(d/"fallback-thumb.webp",format="WEBP",quality=80); im.resize((12,7)).filter(ImageFilter.GaussianBlur(3)).save(d/"fallback-blur.webp",format="WEBP",quality=60); (d/"fallback.svg").write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 450"><rect width="800" height="450" fill="#f5f6f8"/><rect x="120" y="170" width="560" height="170" rx="28" fill="none" stroke="#6b7280" stroke-width="8"/><path d="M220 220h360" stroke="#f97316" stroke-width="8"/></svg>',encoding="utf-8")
def main():
 for name in SETS: make_one(name)
 (OUT/"CREDITS.json").write_text(json.dumps({"generated_fallbacks":SETS,"sources":[],"todo":"Add Pexels/Unsplash URLs and photographer credits when network credentials are configured."},indent=2),encoding="utf-8")
 print(f"Prepared {len(SETS)} neutral stock fallbacks in {OUT}")
if __name__=="__main__": main()
