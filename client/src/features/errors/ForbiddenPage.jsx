import { House, ShieldOff } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";

export function ForbiddenPage() {
  return (
    <Card className="mx-auto mt-12 max-w-xl">
      <EmptyState
        illustration={
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-bg text-muted">
            <ShieldOff size={24} aria-hidden="true" />
          </span>
        }
        title="You don't have access to this page"
        description="Ask an administrator if you think you should."
        action={
          <Button to="/" icon={House}>
            Back to Home
          </Button>
        }
      />
    </Card>
  );
}
