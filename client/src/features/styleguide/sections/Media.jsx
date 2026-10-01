import { useEffect, useState } from "react";
import { Images } from "lucide-react";
import { Section, Demo } from "../Section";
import { FileTile } from "../../../components/ui/FileTile";
import { Lightbox } from "../../../components/ui/Lightbox";
import { AudioPlayer } from "../../../components/ui/AudioPlayer";
import { Button } from "../../../components/ui/Button";
import { LIGHTBOX_ITEMS, makeDemoAudioUrl } from "../demoData";

const now = Date.now();

export function Media() {
  const [lightbox, setLightbox] = useState({ open: false, index: 0 });
  const [progress, setProgress] = useState(35);
  const [audioUrl, setAudioUrl] = useState(null);

  useEffect(() => {
    const url = makeDemoAudioUrl(8);
    setAudioUrl(url);
    return () => URL.revokeObjectURL(url);
  }, []);

  useEffect(() => {
    const id = setInterval(() => setProgress((p) => (p >= 100 ? 10 : p + 5)), 400);
    return () => clearInterval(id);
  }, []);

  const open = (index) => setLightbox({ open: true, index });

  return (
    <Section id="media" title="Media" description="Images always sit in fixed aspect-ratio boxes with placeholders. The Lightbox supports zoom 1–5× (wheel, pinch, buttons, +/−), pan, ←/→, thumbnails, AI annotations (A), before/after compare, download and EXIF (I).">
      <Demo label="FileTile — click an image tile to open the Lightbox">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 2xl:grid-cols-6">
          <FileTile kind="image" name="left-side.svg" size={248_320} uploadedAt={now - 5 * 60_000} thumb={LIGHTBOX_ITEMS[0].src} flag={{ level: "pass", label: "Fresh damage" }} onOpen={() => open(0)} />
          <FileTile kind="image" name="front-34.svg" size={301_004} uploadedAt={now - 6 * 60_000} thumb={LIGHTBOX_ITEMS[1].src} flag={{ level: "fail", label: "Pre-existing" }} onOpen={() => open(1)} />
          <FileTile kind="image" name="rear.svg" size={198_112} uploadedAt={now - 7 * 60_000} thumb={LIGHTBOX_ITEMS[2].src} flag={{ level: "warn", label: "Low light" }} onOpen={() => open(2)} />
          <FileTile kind="pdf" name="RC-MH12AB1234.pdf" size={1_204_000} uploadedAt={now - 3600_000} flag={{ level: "pass", label: "Verified" }} onOpen={() => {}} />
          <FileTile kind="image" name="uploading.jpg" size={2_400_000} progress={progress} onRemove={() => {}} />
          <FileTile kind="image" name="missing.webp" size={0} thumb="/assets/claims/none/missing.webp" flag={{ level: "pending", label: "Pending" }} />
        </div>
        <Button className="mt-4" variant="secondary" icon={Images} onClick={() => open(0)}>
          Open gallery
        </Button>
      </Demo>
      <Demo label="AudioPlayer — synthesised demo tone (real voice notes arrive in Phase 6)">
        {audioUrl && (
          <AudioPlayer
            src={audioUrl}
            title="Voice note · 8 s"
            language="Marathi"
            transcript="मी पुणे-मुंबई द्रुतगती मार्गावरून जात असताना मागून एका ट्रकने धडक दिली."
            translation="I was driving on the Pune–Mumbai expressway when a truck hit me from behind."
          />
        )}
      </Demo>
      <Lightbox open={lightbox.open} index={lightbox.index} items={LIGHTBOX_ITEMS} onClose={() => setLightbox((l) => ({ ...l, open: false }))} />
    </Section>
  );
}
