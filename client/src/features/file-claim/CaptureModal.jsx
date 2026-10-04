import { useEffect, useRef, useState } from "react";
import { Camera, RefreshCcw, SwitchCamera } from "lucide-react";
import { Modal } from "../../components/ui/Modal";
import { Button } from "../../components/ui/Button";
import { Silhouette } from "./Silhouette";

/** Webcam capture with the slot's silhouette over the live video and a "hold steady" hint (§10.6 step 5). */
export function CaptureModal({ slot, twoWheeler, onClose, onCapture }) {
  const video = useRef(null);
  const stream = useRef(null);
  const [state, setState] = useState("starting"); // starting | live | denied | error
  const [devices, setDevices] = useState([]);
  const [deviceIdx, setDeviceIdx] = useState(0);
  const [shot, setShot] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const constraints = devices[deviceIdx] ? { deviceId: { exact: devices[deviceIdx].deviceId } } : { facingMode: "environment" };
        const s = await navigator.mediaDevices.getUserMedia({ video: { ...constraints, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        stream.current = s;
        if (video.current) { video.current.srcObject = s; await video.current.play().catch(() => {}); }
        setState("live");
        if (!devices.length) {
          const all = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
          if (!cancelled) setDevices(all);
        }
      } catch (e) {
        if (!cancelled) setState(e?.name === "NotAllowedError" ? "denied" : "error");
      }
    })();
    return () => { cancelled = true; stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; };
  }, [deviceIdx]); // eslint-disable-line react-hooks/exhaustive-deps

  const capture = () => {
    const v = video.current;
    if (!v?.videoWidth) return;
    const c = document.createElement("canvas");
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext("2d").drawImage(v, 0, 0);
    c.toBlob((b) => b && setShot({ file: new File([b], `${slot.slot}-${Date.now()}.jpg`, { type: "image/jpeg" }), url: URL.createObjectURL(b) }), "image/jpeg", 0.92);
  };
  useEffect(() => {
    // After "Retake" the <video> element is mounted again: give it the running stream.
    if (!shot && video.current && stream.current && video.current.srcObject !== stream.current) {
      video.current.srcObject = stream.current;
      video.current.play().catch(() => {});
    }
    return () => { if (shot) URL.revokeObjectURL(shot.url); };
  }, [shot]);

  return (
    <Modal open onClose={onClose} size="lg" title={`Capture: ${slot.label}`} description={slot.hint}
      footer={shot ? (
        <>
          <Button variant="secondary" icon={RefreshCcw} onClick={() => setShot(null)}>Retake</Button>
          <Button icon={Camera} onClick={() => onCapture(shot.file)}>Use this photo</Button>
        </>
      ) : (
        <>
          {devices.length > 1 && <Button variant="ghost" icon={SwitchCamera} onClick={() => setDeviceIdx((i) => (i + 1) % devices.length)}>Switch camera</Button>}
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button icon={Camera} onClick={capture} disabled={state !== "live"} disabledReason={state !== "live" ? "Waiting for the camera" : undefined}>Capture</Button>
        </>
      )}>
      <div className="wz-camera">
        {shot ? <img src={shot.url} alt={`Captured ${slot.label}`} className="absolute inset-0 h-full w-full object-cover" /> : <video ref={video} playsInline muted />}
        {!shot && state === "live" && (
          <>
            <Silhouette shape={slot.shape} twoWheeler={twoWheeler} className="wz-overlay" />
            <p className="absolute right-0 bottom-3 left-0 text-center text-sm font-medium text-on-dark">Line the vehicle up with the outline · hold steady</p>
          </>
        )}
        {state === "starting" && <p className="absolute inset-0 flex items-center justify-center text-sm text-on-dark-muted">Starting camera…</p>}
        {(state === "denied" || state === "error") && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-6 text-center text-on-dark">
            <p className="text-sm font-medium">{state === "denied" ? "Camera access was blocked" : "No camera is available"}</p>
            <p className="text-caption text-on-dark-muted">{state === "denied" ? "Allow the camera in the browser's address bar, or close this and upload a photo instead." : "Close this and upload a photo instead."}</p>
          </div>
        )}
      </div>
    </Modal>
  );
}
