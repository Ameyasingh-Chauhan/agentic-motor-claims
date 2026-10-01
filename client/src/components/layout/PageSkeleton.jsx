import { Skeleton } from "../ui/Skeleton";
import { LoadingRegion } from "../ui/Skeleton";

/** Generic page skeleton used while a lazy route chunk loads. */
export function PageSkeleton() {
  return (
    <LoadingRegion label="Loading page">
      <Skeleton className="mb-2 h-8 w-64" />
      <Skeleton className="mb-6 h-4 w-96" />
      <div className="grid grid-cols-4 gap-6">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-44" rounded="lg" />
        ))}
      </div>
      <Skeleton className="mt-6 h-96" rounded="lg" />
    </LoadingRegion>
  );
}
