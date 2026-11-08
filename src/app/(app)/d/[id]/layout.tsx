import { Suspense } from "react";
import DatasetTabs from "@/components/DatasetTabs";

export default function DatasetLayout({ children }: LayoutProps<"/d/[id]">) {
  return (
    <>
      <Suspense fallback={<div className="h-10 border-b border-line bg-panel" />}>
        <DatasetTabs />
      </Suspense>
      {children}
    </>
  );
}
