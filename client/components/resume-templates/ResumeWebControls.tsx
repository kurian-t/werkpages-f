import { ArrowUp, FileDown, Search, UserRound } from "lucide-react";
import type { ResumeDesign } from "./types";
import {
  getResumeWebSettings,
  withResumeWebSettings,
  type ResumeWebDetailsMode,
  type ResumeWebFeaturedLink,
  type ResumeWebHeroLayout,
  type ResumeWebSettings,
  type ResumeWebTheme,
} from "./resumeWeb";

export type ResumeWebControlSection =
  | "featured-links"
  | "navigation"
  | "visitor-tools"
  | "appearance";

function id(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-foreground">{label}</div>
        <div className="mt-0.5 text-[9.5px] leading-relaxed text-muted-foreground">{detail}</div>
      </div>
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 flex-none accent-[#2e0562]"
      />
    </label>
  );
}

function CompactToggleRow({
  icon: Icon,
  label,
  detail,
  checked,
  onChange,
}: {
  icon: typeof Search;
  label: string;
  detail: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="group flex cursor-pointer items-center gap-2.5 px-3 py-2.5 transition-colors hover:bg-muted/25">
      <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#2e0562]/[0.065] text-[#2e0562]">
        <Icon size={13} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10.5px] font-semibold text-foreground">{label}</span>
        <span className="mt-0.5 block text-[9px] leading-snug text-muted-foreground">{detail}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-[18px] w-8 flex-none rounded-full transition-colors ${
          checked ? "bg-[#2e0562]" : "bg-muted-foreground/25"
        }`}
      >
        <span
          className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-white shadow-sm transition-transform ${
            checked ? "translate-x-4" : "translate-x-[2px]"
          }`}
        />
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={event => onChange(event.target.checked)}
        className="sr-only"
      />
    </label>
  );
}

function DetailsModeRow({
  value,
  onChange,
}: {
  value: ResumeWebDetailsMode;
  onChange: (value: ResumeWebDetailsMode) => void;
}) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <span className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-lg bg-[#2e0562]/[0.065] text-[#2e0562]">
        <span className="text-[10px] font-bold">Aa</span>
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold text-foreground">Experience details</div>
        <div className="mt-0.5 text-[9px] leading-snug text-muted-foreground">Choose how much job detail visitors see initially.</div>
      </div>
      <select
        value={value}
        onChange={event => onChange(event.target.value as ResumeWebDetailsMode)}
        aria-label="Experience details default"
        className="h-7 flex-none rounded-lg border border-border bg-background px-2 text-[9.5px] font-semibold text-foreground outline-none transition-colors hover:border-[#2e0562]/30 focus:border-[#2e0562]/50"
      >
        <option value="all">Open</option>
        <option value="first-two">First 2</option>
        <option value="collapsed">Collapsed</option>
      </select>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        role="group"
        aria-label={label}
        className={`grid gap-1 rounded-lg border border-border bg-muted/25 p-1 ${
          options.length === 4
            ? "grid-cols-4"
            : options.length === 2
              ? "grid-cols-2"
              : "grid-cols-3"
        }`}
      >
        {options.map(option => (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={value === option.value}
            className={`rounded-md px-2 py-1.5 text-[10px] font-semibold transition-colors ${
              value === option.value
                ? "bg-background text-[#2e0562] shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ControlIntro({
  title,
  detail,
}: {
  title: string;
  detail: string;
}) {
  return (
    <div className="pb-1">
      <div className="text-xs font-semibold text-foreground">{title}</div>
      <p className="mt-1 text-[9.5px] leading-relaxed text-muted-foreground">{detail}</p>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-2.5 py-2 text-[11px] text-foreground outline-none focus:border-[#2e0562]/50";

export default function ResumeWebControls({
  design,
  onChange,
  section,
}: {
  design: ResumeDesign;
  onChange: (design: ResumeDesign) => void;
  section?: ResumeWebControlSection;
}) {
  const settings = getResumeWebSettings(design);

  const patch = <K extends keyof ResumeWebSettings>(key: K, value: ResumeWebSettings[K]) => {
    onChange(
      withResumeWebSettings(
        design,
        { [key]: value } as Partial<ResumeWebSettings>,
      ),
    );
  };

  const updateFeaturedLink = (
    linkId: string,
    updates: Partial<ResumeWebFeaturedLink>,
  ) => {
    patch(
      "featuredLinks",
      settings.featuredLinks.map(link =>
        link.id === linkId ? { ...link, ...updates } : link,
      ),
    );
  };

  const featuredLinks = (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-2">
        <ControlIntro
          title="Featured links"
          detail="Portfolio pieces, articles, talks, demos or anything worth highlighting on the Web resume."
        />
        <button
          type="button"
          onClick={() =>
            patch("featuredLinks", [
              ...settings.featuredLinks,
              { id: id("web-link"), label: "", url: "", description: "" },
            ])
          }
          className="inline-flex flex-none items-center whitespace-nowrap rounded-md border border-[#2e0562]/25 px-2 py-1 text-[10px] font-semibold text-[#2e0562] hover:bg-[#2e0562]/5"
        >
          + Link
        </button>
      </div>

      {settings.featuredLinks.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/15 px-3 py-5 text-center text-[9.5px] text-muted-foreground">
          No featured links yet.
        </div>
      ) : (
        <div className="space-y-2.5">
          {settings.featuredLinks.map((link, index) => (
            <div key={link.id} className="rounded-xl border border-border bg-card p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="text-[10px] font-semibold text-foreground">
                  Link {index + 1}
                </div>
                <button
                  type="button"
                  onClick={() =>
                    patch(
                      "featuredLinks",
                      settings.featuredLinks.filter(item => item.id !== link.id),
                    )
                  }
                  className="text-[9.5px] font-semibold text-red-500 hover:text-red-600"
                >
                  Remove
                </button>
              </div>
              <div className="space-y-2">
                <input
                  className={inputCls}
                  value={link.label}
                  onChange={event =>
                    updateFeaturedLink(link.id, { label: event.target.value })
                  }
                  placeholder="Label — e.g. Portfolio"
                />
                <input
                  className={inputCls}
                  value={link.url}
                  onChange={event =>
                    updateFeaturedLink(link.id, { url: event.target.value })
                  }
                  placeholder="https://..."
                />
                <input
                  className={inputCls}
                  value={link.description}
                  onChange={event =>
                    updateFeaturedLink(link.id, { description: event.target.value })
                  }
                  placeholder="Short description"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const navigation = (
    <div className="space-y-3">
      <ControlIntro
        title="Navigation"
        detail="Control whether visitors can jump between resume sections while browsing your site."
      />
      <Toggle
        label="Section navigation"
        detail="Show the section navigation across the top of the Web resume."
        checked={settings.showNav}
        onChange={value => patch("showNav", value)}
      />
    </div>
  );

  const enabledVisitorTools = [
    settings.showSearch,
    settings.showPrint,
    settings.showPhoto,
    settings.showBackToTop,
  ].filter(Boolean).length;

  const visitorTools = (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <ControlIntro
          title="Visitor tools"
          detail="Choose the conveniences visitors get while reading your responsive resume."
        />
        <span className="mt-0.5 flex-none whitespace-nowrap rounded-full bg-muted/45 px-2 py-1 text-[8.5px] font-semibold text-muted-foreground">
          {enabledVisitorTools}/4 on
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-background">
        <DetailsModeRow
          value={settings.detailsMode}
          onChange={value => patch("detailsMode", value)}
        />

        <div className="border-t border-border">
          <CompactToggleRow
            icon={Search}
            label="Resume search"
            detail="Let visitors quickly filter your resume content."
            checked={settings.showSearch}
            onChange={value => patch("showSearch", value)}
          />
        </div>

        <div className="border-t border-border">
          <CompactToggleRow
            icon={FileDown}
            label="Print / save PDF"
            detail="Give visitors a clean print or PDF action."
            checked={settings.showPrint}
            onChange={value => patch("showPrint", value)}
          />
        </div>

        <div className="border-t border-border">
          <CompactToggleRow
            icon={UserRound}
            label="Profile photo"
            detail="Show your existing resume profile photo in the hero."
            checked={settings.showPhoto}
            onChange={value => patch("showPhoto", value)}
          />
        </div>

        <div className="border-t border-border">
          <CompactToggleRow
            icon={ArrowUp}
            label="Back to top"
            detail="Show a shortcut after visitors scroll down the page."
            checked={settings.showBackToTop}
            onChange={value => patch("showBackToTop", value)}
          />
        </div>
      </div>

      <p className="px-1 text-[8.5px] leading-relaxed text-muted-foreground">
        These controls affect only the responsive Web experience and update the preview immediately.
      </p>
    </div>
  );

  const appearance = (
    <div className="space-y-4">
      <ControlIntro
        title="Appearance"
        detail="Set the published theme and hero structure. Fine-grained styling can still be edited directly on the preview."
      />
      <Segmented<ResumeWebTheme>
        label="Published theme"
        value={settings.theme}
        options={[
          { value: "auto", label: "Auto" },
          { value: "light", label: "Light" },
          { value: "dark", label: "Dark" },
        ]}
        onChange={value => patch("theme", value)}
      />
      <Segmented<ResumeWebHeroLayout>
        label="Hero layout"
        value={settings.heroLayout}
        options={[
          { value: "split", label: "Split" },
          { value: "centered", label: "Centered" },
        ]}
        onChange={value => patch("heroLayout", value)}
      />
    </div>
  );

  if (section === "featured-links") return featuredLinks;
  if (section === "navigation") return navigation;
  if (section === "visitor-tools") return visitorTools;
  if (section === "appearance") return appearance;

  // Backward-compatible fallback for any older caller that still renders the
  // complete controls panel.
  return (
    <div className="space-y-5">
      {featuredLinks}
      <div className="border-t border-border pt-4">{navigation}</div>
      <div className="border-t border-border pt-4">{visitorTools}</div>
      <div className="border-t border-border pt-4">{appearance}</div>
    </div>
  );
}
