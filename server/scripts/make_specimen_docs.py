from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(__file__).resolve().parents[2]; OUT=ROOT/"client"/"public"/"assets"/"specimens"
def make(name,title):
 OUT.mkdir(parents=True,exist_ok=True); im=Image.new("RGB",(1200,800),(255,255,255)); d=ImageDraw.Draw(im); d.rectangle((40,40,1160,760),outline=(58,58,58),width=3); d.text((80,80),title,fill=(17,24,39)); d.text((80,150),"ABC General Insurance",fill=(75,85,99)); d.text((250,400),"SAMPLE – NOT VALID",fill=(220,38,38),stroke_width=1); im.save(OUT/f"{name}.png")
def main():
 for name,title in [("rc","Registration Certificate"),("dl","Driving Licence"),("policy","Policy Schedule"),("fir","First Information Report"),("estimate","Repair Estimate"),("invoice","Repair Invoice")]: make(name,title)
 print(f"Generated specimen documents in {OUT}")
if __name__=="__main__": main()
