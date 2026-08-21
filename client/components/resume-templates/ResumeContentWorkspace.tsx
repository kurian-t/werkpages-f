import { useState, type ReactNode } from "react";
import type { ResumeData } from "./types";
import ResumeContentPanel, {
  type ResumeContentSection,
} from "./ResumeContentPanel";

interface Props {
  data: ResumeData;
  onChange: (next: ResumeData) => void;
  initialSection?: ResumeContentSection;
  section?: ResumeContentSection;
  onSectionChange?: (section: ResumeContentSection) => void;
  intro?: ReactNode;
}

export default function ResumeContentWorkspace({
  data,
  onChange,
  initialSection = "profile",
  section,
  onSectionChange,
  intro,
}: Props) {
  const [internalSection, setInternalSection] =
    useState<ResumeContentSection>(initialSection);

  const activeSection = section ?? internalSection;
  const handleSectionChange = onSectionChange ?? setInternalSection;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4 sm:p-5 lg:p-6">
      {intro}
      <ResumeContentPanel
        data={data}
        onChange={onChange}
        section={activeSection}
        onSectionChange={handleSectionChange}
        variant="workspace"
      />
    </div>
  );
}
