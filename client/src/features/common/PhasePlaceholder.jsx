import { Palette } from "lucide-react";
import { PageHeader } from "../../components/layout/PageHeader";
import { Card } from "../../components/ui/Card";
import { EmptyState } from "../../components/ui/EmptyState";
import { Button } from "../../components/ui/Button";

/** Placeholder for pages delivered in later build phases (spec §19). */
export function PhasePlaceholder({ title, description, phase, children }) {
  return (
    <>
      <PageHeader title={title} description={description} />
      <Card>
        <EmptyState
          title={`${title} arrives in Phase ${phase}`}
          description="The app shell, navigation and design system are in place. This screen is built in a later phase of the plan."
          action={
            <Button to="/styleguide" variant="secondary" icon={Palette}>
              Browse the style guide
            </Button>
          }
        />
        {children}
      </Card>
    </>
  );
}
