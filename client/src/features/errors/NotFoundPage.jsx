import { House } from "lucide-react";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";

export default function NotFoundPage() {
  return (
    <Card className="mx-auto mt-12 max-w-xl">
      <EmptyState
        title="We couldn't find that page"
        description="The link may be out of date, or the page may have moved."
        action={
          <Button to="/" icon={House}>
            Back to Home
          </Button>
        }
      />
    </Card>
  );
}
