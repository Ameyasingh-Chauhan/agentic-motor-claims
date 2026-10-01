import { useState } from "react";
import { FilePlus2 } from "lucide-react";
import { Section, Demo } from "../Section";
import { Progress } from "../../../components/ui/Progress";
import { Stepper } from "../../../components/ui/Stepper";
import { Skeleton, SkeletonText } from "../../../components/ui/Skeleton";
import { EmptyState, ErrorState } from "../../../components/ui/EmptyState";
import { Button } from "../../../components/ui/Button";

const STEPS = [
  { key: "policy", label: "Policy", description: "Find your policy" },
  { key: "incident", label: "Incident", description: "What happened" },
  { key: "photos", label: "Photos", description: "Guided capture" },
  { key: "docs", label: "Documents", description: "RC, DL, FIR" },
  { key: "review", label: "Review", description: "Submit" },
];

export function Feedback() {
  const [step, setStep] = useState(2);
  const [retrying, setRetrying] = useState(false);
  return (
    <Section id="feedback" title="Progress, steppers & data states" description="Every data-driven component has four states: loading (skeleton matching final size), empty, error (with retry) and success. No raw spinners for page content.">
      <div className="grid gap-6 xl:grid-cols-2">
        <Demo label="Progress (transform-only fill)">
          <div className="flex flex-col gap-4">
            <Progress value={0} label="Not started" showValue />
            <Progress value={42} label="Uploading photos" showValue />
            <Progress value={100} tone="success" label="Complete" showValue />
            <Progress value={78} tone="warning" label="Approaching limit" showValue size="sm" />
            <Progress label="Indeterminate — waiting for Vahan" />
          </div>
        </Demo>
        <Demo label="Stepper">
          <div className="flex flex-col gap-6">
            <Stepper steps={STEPS} current={step} onStepClick={setStep} />
            <Stepper steps={STEPS} current={3} errorAt={2} />
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                Back
              </Button>
              <Button size="sm" onClick={() => setStep((s) => Math.min(STEPS.length, s + 1))}>
                Next
              </Button>
            </div>
          </div>
        </Demo>
      </div>
      <div className="grid gap-6 xl:grid-cols-3">
        <Demo label="Loading — skeleton">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10" rounded="full" />
            <div className="flex-1">
              <Skeleton className="mb-2 h-4 w-1/2" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
          <SkeletonText lines={4} className="mt-4" />
          <Skeleton className="mt-4 h-32" rounded="lg" />
        </Demo>
        <Demo label="Empty">
          <EmptyState
            compact
            title="No claims match these filters"
            description="Try widening the date range or clearing a filter."
            action={
              <Button size="sm" icon={FilePlus2}>
                File a new claim
              </Button>
            }
          />
        </Demo>
        <Demo label="Error (with retry)">
          <ErrorState
            compact
            error={{ message: "The server didn't respond in time.", error_id: "err_7Q2K9" }}
            retrying={retrying}
            onRetry={() => {
              setRetrying(true);
              setTimeout(() => setRetrying(false), 1200);
            }}
          />
        </Demo>
      </div>
    </Section>
  );
}
