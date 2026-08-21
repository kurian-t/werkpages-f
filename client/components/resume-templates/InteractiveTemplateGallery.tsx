import { useMemo, useState } from "react";
import {
  Check,
  LayoutTemplate,
  Rocket,
  Route,
  Search,
  Terminal,
} from "lucide-react";
import {
  INTERACTIVE_TEMPLATES,
  type InteractiveTemplateCategory,
  type InteractiveTemplateDefinition,
  type InteractiveTemplateId,
} from "./resumeInteractiveTemplates";

const CATEGORIES: Array<"All" | InteractiveTemplateCategory> = [
  "All",
  "Professional",
  "Story",
  "Tech",
  "Creative",
  "Immersive",
  "Presentation",
];

function Bars({
  light = false,
  accent = false,
}: {
  light?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="space-y-2">
      <div
        className={`h-2.5 w-[72%] rounded-full ${
          accent
            ? "bg-current opacity-70"
            : light
              ? "bg-white/70"
              : "bg-black/20"
        }`}
      />
      <div
        className={`h-2 w-[90%] rounded-full ${
          light ? "bg-white/30" : "bg-black/10"
        }`}
      />
      <div
        className={`h-2 w-[62%] rounded-full ${
          light ? "bg-white/20" : "bg-black/10"
        }`}
      />
    </div>
  );
}

function TemplateThumbnail({
  template,
}: {
  template: InteractiveTemplateDefinition;
}) {
  const frame =
    "relative h-[145px] overflow-hidden rounded-xl border border-black/5";

  switch (template.preview) {
    case "terminal":
      return (
        <div className={`${frame} border-emerald-900 bg-[#030805] p-3 font-mono`}>
          <div className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-red-400" />
            <span className="h-2 w-2 rounded-full bg-yellow-300" />
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
          </div>
          <div className="mt-4 text-[11px] font-bold text-emerald-300">
            $ whoami
          </div>
          <div className="mt-2 text-emerald-300">
            <Bars light />
          </div>
        </div>
      );
    case "space":
      return (
        <div className={`${frame} bg-gradient-to-br from-[#07051b] to-[#32106d]`}>
          {[12, 28, 43, 61, 76, 88].map((left, index) => (
            <span
              key={left}
              className="absolute h-1.5 w-1.5 rounded-full bg-white/80"
              style={{ left: `${left}%`, top: `${14 + (index * 17) % 68}%` }}
            />
          ))}
          <div className="absolute right-8 top-6 h-16 w-16 rounded-full border border-violet-300/60 bg-violet-500/25" />
          <div className="absolute bottom-5 left-5 w-[62%] rounded-lg border border-white/20 bg-white/10 p-3 text-white backdrop-blur">
            <Bars light />
          </div>
        </div>
      );
    case "journey":
      return (
        <div className={`${frame} bg-gradient-to-br from-[#fffafe] to-[#ede9fe]`}>
          <div className="absolute bottom-5 left-8 top-5 w-px bg-violet-300" />
          {[22, 48, 73].map(top => (
            <span
              key={top}
              className="absolute left-[25px] h-3 w-3 rounded-full border-2 border-white bg-violet-600"
              style={{ top: `${top}%` }}
            />
          ))}
          <div className="absolute left-14 top-5 w-[66%] rounded-lg border border-violet-200 bg-white/85 p-3 text-violet-900">
            <Bars />
          </div>
          <div className="absolute bottom-5 left-14 w-[54%] rounded-lg border border-violet-200 bg-white/70 p-2.5">
            <Bars />
          </div>
        </div>
      );
    case "underwater":
      return (
        <div className={`${frame} bg-gradient-to-b from-[#0d6880] to-[#03253d]`}>
          {[16, 30, 74, 86].map((left, index) => (
            <span
              key={left}
              className="absolute rounded-full border border-cyan-100/60 bg-cyan-100/10"
              style={{
                left: `${left}%`,
                top: `${15 + index * 16}%`,
                width: `${12 + index * 4}px`,
                height: `${12 + index * 4}px`,
              }}
            />
          ))}
          <div className="absolute bottom-0 h-8 w-full bg-teal-900/55" />
          <div className="absolute left-5 top-7 w-[62%] rounded-xl border border-cyan-100/25 bg-cyan-950/30 p-3 text-white backdrop-blur">
            <Bars light />
          </div>
        </div>
      );
    case "balloon":
      return (
        <div className={`${frame} bg-gradient-to-b from-[#bfe7fb] to-[#f8fcff]`}>
          <div className="absolute left-4 top-8 h-7 w-20 rounded-full bg-white/80" />
          <div className="absolute right-4 top-12 h-8 w-24 rounded-full bg-white/75" />
          <div className="absolute right-11 top-4 h-16 w-12 rounded-[50%] bg-[#ef8354]" />
          <div className="absolute right-[53px] top-[72px] h-5 w-7 bg-[#8b5a3c]" />
          <div className="absolute bottom-5 left-5 w-[57%] rounded-xl border border-sky-200 bg-white/85 p-3 text-slate-700">
            <Bars />
          </div>
        </div>
      );
    case "desktop":
      return (
        <div className={`${frame} bg-[#cbd8e8] p-3`}>
          <div className="h-full rounded-lg border border-slate-400 bg-[#eef4fb] shadow-sm">
            <div className="flex h-7 items-center gap-1.5 border-b border-slate-300 bg-slate-200 px-2">
              <span className="h-2 w-2 rounded-full bg-red-400" />
              <span className="h-2 w-2 rounded-full bg-yellow-400" />
              <span className="h-2 w-2 rounded-full bg-green-400" />
            </div>
            <div className="relative h-[102px]">
              <div className="absolute left-3 top-3 w-[60%] rounded-md border border-slate-300 bg-white p-2">
                <Bars />
              </div>
              <div className="absolute bottom-3 right-3 h-12 w-16 rounded-md border border-indigo-200 bg-indigo-50" />
            </div>
          </div>
        </div>
      );
    case "office":
      return (
        <div className={`${frame} bg-[#f1e3d1]`}>
          <div className="absolute right-5 top-5 h-14 w-20 border-4 border-white bg-sky-100" />
          <div className="absolute bottom-0 h-9 w-full bg-[#a97755]" />
          <div className="absolute left-6 top-6 w-[54%] rotate-[-2deg] rounded bg-[#fffaf0] p-3 shadow">
            <Bars />
          </div>
          <div className="absolute bottom-5 right-9 h-12 w-16 rotate-3 bg-yellow-200 shadow-sm" />
        </div>
      );
    case "executive":
      return (
        <div className={`${frame} bg-gradient-to-br from-[#0f1b2d] to-[#1c2d48] p-5 text-[#d8b26e]`}>
          <div className="absolute bottom-5 left-5 top-5 w-1 bg-[#d8b26e]" />
          <div className="ml-5 mt-2 text-xs font-semibold tracking-[0.22em]">
            LEADERSHIP
          </div>
          <div className="ml-5 mt-5 rounded-sm border border-[#d8b26e]/30 bg-white/5 p-3 text-white">
            <Bars light />
          </div>
        </div>
      );
    case "editorial":
      return (
        <div className={`${frame} bg-[#faf5eb] p-4 text-[#201b17]`}>
          <div className="text-[10px] font-bold tracking-[0.25em] text-[#a63b32]">
            PROFILE / ISSUE
          </div>
          <div className="mt-2 text-2xl font-serif font-bold">The Story</div>
          <div className="mt-3 grid grid-cols-3 gap-3 border-t border-black/20 pt-3">
            <Bars />
            <Bars />
            <Bars />
          </div>
        </div>
      );
    case "split":
      return (
        <div className={`${frame} bg-[#201333]`}>
          <div className="absolute right-0 h-full w-1/2 bg-[#f4edfb]" />
          <div className="absolute left-5 top-7 w-[38%] text-white">
            <Bars light />
          </div>
          <div className="absolute right-5 top-12 w-[38%] rounded-lg bg-white p-3 text-violet-950 shadow">
            <Bars />
          </div>
          <div className="absolute left-1/2 top-0 h-full w-1 bg-violet-500" />
        </div>
      );
    case "swiss":
      return (
        <div className={`${frame} bg-[#f5f5f0] p-4`}>
          <div className="absolute left-[30%] top-0 h-full w-px bg-black/10" />
          <div className="absolute left-[60%] top-0 h-full w-px bg-black/10" />
          <div className="absolute left-0 top-[45%] h-px w-full bg-black/10" />
          <div className="h-10 w-2 bg-[#e23b31]" />
          <div className="mt-3 text-xl font-black tracking-tight">01 / WORK</div>
          <div className="mt-3 w-[70%]">
            <Bars />
          </div>
        </div>
      );
    case "timeline":
      return (
        <div className={`${frame} bg-[#fff8ef]`}>
          <div className="absolute left-5 right-5 top-[65%] h-1 bg-amber-300" />
          {[16, 39, 62, 84].map((left, index) => (
            <div
              key={left}
              className={`absolute top-[59%] h-5 w-5 rounded-full border-4 border-amber-500 ${
                index % 2 ? "bg-white" : "bg-amber-500"
              }`}
              style={{ left: `${left}%` }}
            />
          ))}
          <div className="absolute left-6 top-5 w-[60%] rounded-lg border border-amber-200 bg-white p-3">
            <Bars />
          </div>
        </div>
      );
    case "case-study":
      return (
        <div className={`${frame} bg-[#edf2f4] p-4`}>
          <div className="absolute right-5 top-1 text-[58px] font-black text-teal-700/10">
            02
          </div>
          <div className="text-[10px] font-bold tracking-[0.18em] text-teal-700">
            CASE STUDY
          </div>
          <div className="mt-3 w-[68%] rounded-lg bg-white p-3 shadow-sm">
            <Bars />
          </div>
          <div className="absolute bottom-4 right-5 h-11 w-20 rounded border border-teal-200 bg-teal-50" />
        </div>
      );
    case "command":
      return (
        <div className={`${frame} bg-[#07131e] p-4 text-cyan-300`}>
          <div className="absolute right-5 top-5 h-20 w-20 rounded-full border border-cyan-400/50">
            <div className="absolute inset-3 rounded-full border border-cyan-400/35" />
            <div className="absolute inset-7 rounded-full border border-cyan-400/25" />
          </div>
          <div className="text-[10px] font-mono font-bold tracking-[0.18em]">
            SYSTEM ONLINE
          </div>
          <div className="mt-4 w-[62%] rounded border border-cyan-800 bg-cyan-950/30 p-3">
            <Bars light />
          </div>
        </div>
      );
    case "blueprint":
      return (
        <div
          className={`${frame} p-4 text-cyan-50`}
          style={{
            backgroundColor: "#0d4d78",
            backgroundImage:
              "linear-gradient(rgba(142,229,255,.14) 1px,transparent 1px),linear-gradient(90deg,rgba(142,229,255,.14) 1px,transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          <div className="border border-cyan-200/60 p-3">
            <div className="text-[10px] font-mono font-bold tracking-widest">
              DRAWING NO. 01
            </div>
            <div className="mt-3 font-mono">
              <Bars light />
            </div>
          </div>
        </div>
      );
    case "magazine":
      return (
        <div className={`${frame} bg-[#fff3f1]`}>
          <div className="h-8 bg-[#211f20] px-4 py-2 text-[10px] font-black tracking-[0.2em] text-white">
            WERK / ISSUE
          </div>
          <div className="absolute left-5 top-12 text-2xl font-serif font-bold">
            The Career Edit
          </div>
          <div className="absolute bottom-5 right-5 w-[55%] rotate-1 rounded bg-white p-3 shadow">
            <Bars />
          </div>
          <div className="absolute bottom-5 left-5 h-12 w-12 rotate-6 border-2 border-pink-400 bg-pink-100" />
        </div>
      );
    case "bold":
      return (
        <div className={`${frame} bg-[#f4ff3f]`}>
          <div className="absolute left-3 top-0 text-[58px] font-black leading-none tracking-[-4px] text-black/15">
            WORK.
          </div>
          <div className="absolute bottom-5 right-5 w-[56%] bg-black p-3 text-white">
            <Bars light />
          </div>
          <div className="absolute bottom-4 left-6 rotate-[-6deg] bg-[#ff6b2c] px-4 py-2 text-xs font-black">
            HELLO
          </div>
        </div>
      );
    case "aurora":
      return (
        <div className={`${frame} bg-gradient-to-br from-[#071925] to-[#111d35]`}>
          <div className="absolute -left-8 top-6 h-10 w-[120%] rotate-[-7deg] bg-emerald-300/20 blur-sm" />
          <div className="absolute -left-6 top-16 h-10 w-[120%] rotate-[5deg] bg-blue-400/15 blur-sm" />
          <div className="absolute -left-4 top-28 h-8 w-[120%] rotate-[-4deg] bg-violet-400/15 blur-sm" />
          <div className="absolute bottom-5 left-5 w-[62%] rounded-xl border border-emerald-200/20 bg-white/10 p-3 text-white backdrop-blur">
            <Bars light />
          </div>
        </div>
      );
    case "deck":
      return (
        <div className={`${frame} bg-[#eceae5] p-3`}>
          <div className="relative h-full border border-slate-200 bg-white p-4 shadow-sm">
            <div className="absolute bottom-3 right-3 text-[10px] font-semibold text-slate-400">
              01
            </div>
            <div className="h-full border-l-4 border-[#2e0562] pl-4">
              <div className="text-xl font-bold text-slate-900">Why me</div>
              <div className="mt-5 w-[72%]">
                <Bars />
              </div>
            </div>
          </div>
        </div>
      );
    case "city":
      return (
        <div className={`${frame} bg-gradient-to-b from-[#081225] to-[#111e33]`}>
          {[6, 18, 31, 45, 61, 74, 87].map((left, index) => (
            <div
              key={left}
              className="absolute bottom-0 bg-[#10223c]"
              style={{
                left: `${left}%`,
                width: `${8 + (index % 3) * 2}%`,
                height: `${34 + (index % 4) * 11}%`,
              }}
            >
              <span className="absolute left-2 top-3 h-2 w-2 bg-amber-300/80" />
              <span className="absolute right-2 top-8 h-2 w-2 bg-sky-300/35" />
            </div>
          ))}
          <div className="absolute left-5 top-5 w-[52%] rounded-lg border border-slate-500/30 bg-slate-950/35 p-3 text-white backdrop-blur">
            <Bars light />
          </div>
        </div>
      );
    case "scrapbook":
      return (
        <div className={`${frame} bg-[#e9dfc8]`}>
          <div className="absolute left-5 top-5 w-[58%] rotate-[-3deg] bg-[#fffdf7] p-3 shadow">
            <div className="absolute -top-2 left-10 h-4 w-16 rotate-6 bg-yellow-200/75" />
            <Bars />
          </div>
          <div className="absolute bottom-5 right-5 h-16 w-20 rotate-3 border-8 border-white bg-rose-100 shadow" />
          <div className="absolute bottom-6 left-7 rotate-[-7deg] bg-[#db6f55] px-3 py-2 text-[10px] font-bold text-white">
            NOTE
          </div>
        </div>
      );
    case "arcade":
      return (
        <div className={`${frame} bg-[#120522] p-3`}>
          <div className="h-full border-2 border-violet-500 p-3 shadow-[inset_0_0_0_1px_rgba(255,79,216,.8)]">
            <div className="text-center font-mono text-[11px] font-black tracking-[0.2em] text-pink-400">
              PLAYER ONE
            </div>
            <div className="mt-4 rounded border border-cyan-400/40 bg-black/30 p-3 text-white">
              <Bars light />
            </div>
            <div className="mt-3 flex gap-2">
              <span className="h-3 w-8 bg-pink-500" />
              <span className="h-3 w-8 bg-cyan-400" />
              <span className="h-3 w-8 bg-violet-400" />
            </div>
          </div>
        </div>
      );

    case "greenhouse":
      return (
        <div className={`${frame} bg-gradient-to-br from-[#e9f1df] to-[#c9ddbd]`}>
          {[18, 46, 74].map(left => (
            <div key={left} className="absolute top-0 h-full w-px bg-emerald-900/15" style={{ left: `${left}%` }} />
          ))}
          <div className="absolute bottom-0 left-8 h-16 w-10 -rotate-12 rounded-[70%_20%] bg-emerald-700/25" />
          <div className="absolute bottom-2 right-10 h-20 w-12 rotate-12 rounded-[70%_20%] bg-emerald-800/25" />
          <div className="absolute left-5 top-6 w-[58%] rounded-xl border border-emerald-800/15 bg-white/70 p-3 text-emerald-950 backdrop-blur"><Bars /></div>
        </div>
      );
    case "library":
      return (
        <div className={`${frame} bg-[#3b2b25] p-3`}>
          <div className="grid h-full grid-cols-5 gap-1 border-y-4 border-[#6d4c3b] py-2">
            {[0,1,2,3,4].map(index => <div key={index} className={`${index % 2 ? "bg-[#8b4d3c]" : "bg-[#54705b]"} rounded-sm opacity-80`} />)}
          </div>
          <div className="absolute bottom-4 left-5 right-5 rounded bg-[#f7efe1] p-2 shadow"><Bars /></div>
        </div>
      );
    case "museum":
      return (
        <div className={`${frame} bg-[#f4f1eb]`}>
          <div className="absolute left-5 top-5 h-20 w-24 border-[5px] border-[#a68a67] bg-white" />
          <div className="absolute left-[40%] top-8 h-24 w-32 border-[3px] border-black/30 bg-[#e9dfd0]" />
          <div className="absolute right-7 top-5 h-20 w-24 border-[5px] border-[#8a6742] bg-white" />
          <div className="absolute bottom-3 left-[42%] h-10 w-16 bg-[#d5cec2]" />
        </div>
      );
    case "mountain":
      return (
        <div className={`${frame} bg-gradient-to-b from-[#c9d8df] to-[#f0c78d]`}>
          <div className="absolute -bottom-12 -left-12 h-28 w-72 rotate-[14deg] bg-[#899da6]" />
          <div className="absolute -bottom-10 left-[28%] h-36 w-80 -rotate-6 bg-[#6f858e]" />
          <div className="absolute -bottom-12 right-[-20px] h-44 w-72 rotate-12 bg-[#526b74]" />
          <div className="absolute left-5 top-5 w-[52%] rounded-lg bg-white/75 p-3"><Bars /></div>
        </div>
      );
    case "desert":
      return (
        <div className={`${frame} bg-gradient-to-b from-[#f5c98f] to-[#d77b52]`}>
          <div className="absolute right-8 top-5 h-16 w-16 rounded-full bg-amber-300" />
          <div className="absolute -bottom-14 left-[-10%] h-28 w-[120%] -rotate-3 rounded-[50%] bg-[#c87552]" />
          <div className="absolute bottom-3 left-[18%] h-1 w-[70%] -rotate-6 bg-[#4d3c36]" />
          <div className="absolute left-5 top-7 w-[55%] rounded-xl bg-[#fff5e0]/90 p-3"><Bars /></div>
        </div>
      );
    case "train":
      return (
        <div className={`${frame} bg-[#183a36] p-3`}>
          <div className="grid h-[78%] grid-cols-4 gap-2 rounded border-4 border-[#c5ad84] p-2">
            {[0,1,2,3].map(index => <div key={index} className="rounded-sm border-2 border-[#c5ad84] bg-[#e8dfca]/20" />)}
          </div>
          <div className="mt-2 h-1.5 bg-[#d5c199]" />
        </div>
      );
    case "airport":
      return (
        <div className={`${frame} bg-[#e8eef4] p-3`}>
          <div className="h-8 bg-[#172331] px-3 py-2 font-mono text-[9px] font-bold tracking-widest text-white">DEPARTURES · ON TIME</div>
          {[0,1,2].map(index => <div key={index} className="mt-2 flex items-center gap-3 border-b border-slate-300 pb-2 font-mono text-[9px]"><span className="font-bold text-blue-700">0{index + 8}:2{index}</span><div className="flex-1"><Bars /></div></div>)}
        </div>
      );
    case "studio":
      return (
        <div className={`${frame} bg-[#111318] p-4`}>
          <div className="flex h-[70%] items-end gap-2">
            {[40,72,52,90,64,82,44,76,58,96].map((height,index) => <div key={index} className={`${index % 3 === 0 ? "bg-amber-400" : index % 3 === 1 ? "bg-cyan-400" : "bg-violet-500"} w-full rounded-t opacity-75`} style={{ height: `${height}%` }} />)}
          </div>
          <div className="mt-3 h-1 bg-white/15" />
        </div>
      );
    case "cinema":
      return (
        <div className={`${frame} bg-[#090909] text-[#f4ead8]`}>
          <div className="flex h-5 gap-2 bg-black px-3 py-1">{[0,1,2,3,4,5,6,7].map(i => <span key={i} className="h-3 flex-1 bg-[#efe3cd]/70" />)}</div>
          <div className="mt-7 text-center font-serif text-xl font-bold tracking-[0.18em]">A CAREER PICTURE</div>
          <div className="mx-auto mt-4 w-[58%] text-[#f4ead8]"><Bars light /></div>
          <div className="absolute bottom-0 flex h-5 w-full gap-2 bg-black px-3 py-1">{[0,1,2,3,4,5,6,7].map(i => <span key={i} className="h-3 flex-1 bg-[#efe3cd]/70" />)}</div>
        </div>
      );
    case "comic":
      return (
        <div className={`${frame} bg-[#f6e44d] p-2`}>
          <div className="grid h-full grid-cols-2 gap-2">
            <div className="border-4 border-black bg-white p-2"><Bars /></div>
            <div className="border-4 border-black bg-[#49a7e8]" />
            <div className="col-span-2 flex items-center justify-between border-4 border-black bg-white px-3"><Bars /><span className="rotate-[-6deg] text-xl font-black text-red-500">POW!</span></div>
          </div>
        </div>
      );
    case "lab":
      return (
        <div className={`${frame} bg-[#edf7f6] p-4`}>
          <div className="absolute right-5 top-5 space-y-2">{[12,18,24].map(size => <span key={size} className="block rounded-full border-2 border-teal-500/45 bg-teal-300/10" style={{ width: size, height: size }} />)}</div>
          <div className="w-[65%] rounded-lg border border-teal-200 bg-white/90 p-3"><div className="text-[9px] font-bold tracking-widest text-teal-700">LAB NOTEBOOK</div><div className="mt-3"><Bars /></div></div>
          <div className="absolute bottom-5 left-4 right-4 h-px bg-teal-700/15" />
        </div>
      );
    case "detective":
      return (
        <div className={`${frame} bg-[#8a603f]`}>
          <div className="absolute left-4 top-5 h-20 w-24 -rotate-3 bg-[#f4e9d2] p-2 shadow"><Bars /></div>
          <div className="absolute left-[42%] top-4 h-24 w-28 rotate-2 bg-[#f4e9d2] shadow" />
          <div className="absolute right-5 top-8 h-20 w-24 -rotate-2 bg-[#f4e9d2] shadow" />
          <div className="absolute left-[25%] top-[56%] h-1 w-[50%] rotate-6 bg-red-800/80" />
          <div className="absolute left-[49%] top-[28%] h-1 w-[40%] rotate-[24deg] bg-red-800/80" />
        </div>
      );
    case "atlas":
      return (
        <div className={`${frame} bg-[#e8ddc3] p-4`}>
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "linear-gradient(#4d604b 1px,transparent 1px),linear-gradient(90deg,#4d604b 1px,transparent 1px)", backgroundSize: "38px 38px" }} />
          <div className="absolute right-5 top-5 h-20 w-20 rounded-full border-2 border-teal-800/60"><div className="absolute left-1/2 top-1 h-[90%] w-px bg-teal-800/40" /><div className="absolute left-1 top-1/2 h-px w-[90%] bg-teal-800/40" /></div>
          <div className="relative w-[58%] rounded bg-[#faf7eb]/90 p-3"><Bars /></div>
        </div>
      );
    case "airmail":
      return (
        <div className={`${frame} bg-[#f7f0df] p-4`}>
          <div className="absolute left-0 top-0 h-3 w-full bg-[repeating-linear-gradient(135deg,#c83e45_0_18px,#f7f0df_18px_28px,#3f7fa5_28px_46px,#f7f0df_46px_56px)]" />
          <div className="absolute bottom-0 left-0 h-3 w-full bg-[repeating-linear-gradient(135deg,#3f7fa5_0_18px,#f7f0df_18px_28px,#c83e45_28px_46px,#f7f0df_46px_56px)]" />
          <div className="mt-3 w-[62%] -rotate-1 rounded border border-blue-300 bg-white/80 p-3"><Bars /></div>
          <div className="absolute right-7 top-7 h-14 w-16 rotate-6 border-2 border-red-500 text-center text-[9px] font-bold leading-[52px] text-red-600">AIR</div>
        </div>
      );
    case "construction":
      return (
        <div className={`${frame} bg-[#272a2f] p-3`}>
          <div className="absolute inset-x-0 top-0 h-5 bg-[repeating-linear-gradient(135deg,#f2b705_0_18px,#24272c_18px_36px)]" />
          <div className="mt-6 grid h-[85%] grid-cols-3 gap-3 border border-white/20 p-3"><div className="border border-white/20" /><div className="border border-white/20 bg-[#f3f0e8] p-2"><Bars /></div><div className="border border-white/20" /></div>
        </div>
      );
    case "coffee":
      return (
        <div className={`${frame} bg-[#d8b899]`}>
          <div className="absolute right-5 top-5 h-20 w-28 rounded border-[5px] border-[#7a4b35] bg-[#30271f] px-2 py-3 text-center text-[9px] font-bold tracking-widest text-[#f4ead7]">HOUSE SPECIAL</div>
          <div className="absolute bottom-0 h-9 w-full bg-[#855e45]" />
          <div className="absolute left-5 top-6 w-[55%] rounded-xl bg-[#fff8ec] p-3 shadow"><Bars /></div>
          <div className="absolute bottom-3 right-12 h-8 w-10 rounded-b-xl border-2 border-[#7a4b35] bg-[#f2e6d4]" />
        </div>
      );
    case "zen":
      return (
        <div className={`${frame} bg-[#efeee8]`}>
          {[0,1,2,3].map(index => <div key={index} className="absolute rounded-[50%] border border-[#6d7d68]/20" style={{ right: 12 - index * 3, top: 18 + index * 8, width: 120 + index * 28, height: 42 + index * 10 }} />)}
          <div className="absolute bottom-6 right-14 h-10 w-16 rounded-[50%] bg-[#a9aea4]" />
          <div className="absolute left-8 top-10 w-[48%] text-slate-700"><Bars /></div>
        </div>
      );
    case "chess":
      return (
        <div className={`${frame} bg-[#eee8da] p-3`}>
          <div className="absolute right-4 top-4 grid grid-cols-4 border border-[#8f8778]">{Array.from({ length: 16 }, (_, index) => <span key={index} className={`${(Math.floor(index / 4) + index) % 2 ? "bg-[#2b2823]" : "bg-[#d8c9a9]"} h-7 w-7`} />)}</div>
          <div className="mt-3 w-[56%] font-serif"><div className="text-[10px] font-bold tracking-widest text-[#a47a3b]">POSITION / 01</div><div className="mt-3"><Bars /></div></div>
          <div className="absolute bottom-2 right-10 text-4xl text-[#a47a3b]">♞</div>
        </div>
      );
    case "subway":
      return (
        <div className={`${frame} bg-[#071521]`}>
          <div className="absolute left-4 right-4 top-[68%] h-1.5 bg-cyan-400" />
          {[12,34,56,78].map((left,index) => <span key={left} className={`${index === 2 ? "bg-pink-500" : "bg-[#071521]"} absolute top-[62%] h-5 w-5 rounded-full border-4 border-cyan-400`} style={{ left: `${left}%` }} />)}
          <div className="absolute right-5 top-5 rounded border border-pink-500 bg-[#101f30] px-4 py-2 text-[10px] font-bold text-white">LINE 08</div>
          <div className="absolute left-5 top-6 w-[52%] text-white"><Bars light /></div>
        </div>
      );
    case "weather":
      return (
        <div className={`${frame} bg-gradient-to-b from-[#d8effb] to-[#f6fbff]`}>
          <div className="absolute right-8 top-5 h-14 w-14 rounded-full bg-amber-400" />
          <div className="absolute right-20 top-14 h-7 w-20 rounded-full bg-white/85" />
          <div className="absolute bottom-4 left-4 right-4 grid grid-cols-4 gap-2">{["MON","TUE","WED","THU"].map((day,index) => <div key={day} className="rounded-lg border border-sky-200 bg-white/80 p-2 text-center text-[8px] font-bold text-slate-600"><div>{day}</div><div className="mt-2 text-sm text-amber-500">{index % 2 ? "☁" : "☀"}</div></div>)}</div>
        </div>
      );
    case "newspaper":
      return (
        <div className={`${frame} bg-[#f5efe2] p-4 text-[#17130f]`}>
          <div className="text-center font-serif text-[18px] font-black">
            THE CAREER DAILY
          </div>
          <div className="my-2 border-y-2 border-black py-1 text-center text-[9px] uppercase tracking-widest">
            Special edition
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Bars />
            <Bars />
            <Bars />
          </div>
        </div>
      );
    default:
      return (
        <div className={`${frame} bg-gradient-to-br from-[#fbfaff] to-[#eee8fa] p-5`}>
          <div className="h-4 w-[48%] rounded bg-violet-700/70" />
          <div className="mt-4 h-5 w-[65%] rounded bg-violet-950/80" />
          <div className="mt-5 w-[72%] rounded-lg bg-white p-3 shadow-sm">
            <Bars />
          </div>
        </div>
      );
  }
}

function TemplateIcon({
  templateId,
}: {
  templateId: InteractiveTemplateId;
}) {
  if (templateId === "terminal") return <Terminal size={16} />;
  if (templateId === "space-journey") return <Rocket size={16} />;
  if (templateId === "career-journey") return <Route size={16} />;
  return <LayoutTemplate size={16} />;
}

export default function InteractiveTemplateGallery({
  activeTemplateId,
  mode = "editor",
  onApply,
}: {
  activeTemplateId?: string;
  mode?: "initial" | "editor";
  onApply: (templateId: InteractiveTemplateId) => void;
}) {
  const [category, setCategory] =
    useState<"All" | InteractiveTemplateCategory>("All");
  const [query, setQuery] = useState("");

  const filteredTemplates = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return INTERACTIVE_TEMPLATES.filter(template => {
      if (category !== "All" && template.category !== category) return false;
      if (!normalized) return true;
      return [
        template.name,
        template.description,
        template.mood,
        template.bestFor,
        template.category,
        ...template.tags,
      ]
        .join(" ")
        .toLowerCase()
        .includes(normalized);
    });
  }, [category, query]);

  return (
    <div>
      <div className="sticky top-0 z-10 -mx-1 mb-4 border-b border-border bg-background/95 px-1 pb-3 backdrop-blur">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {CATEGORIES.map(item => {
              const active = category === item;
              return (
                <button
                  key={item}
                  type="button"
                  onClick={() => setCategory(item)}
                  className={`min-h-9 rounded-full border px-3 text-[12px] font-semibold transition-colors ${
                    active
                      ? "border-[#2e0562] bg-[#2e0562] text-white"
                      : "border-border bg-background text-muted-foreground hover:border-[#2e0562]/25 hover:text-foreground"
                  }`}
                >
                  {item}
                </button>
              );
            })}
          </div>

          <label className="relative block w-full xl:w-[300px]">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={`Search ${INTERACTIVE_TEMPLATES.length} templates`}
              className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-[13px] text-foreground outline-none transition focus:border-[#2e0562]/45 focus:ring-2 focus:ring-[#2e0562]/10"
            />
          </label>
        </div>

        <div className="mt-2 text-[12px] text-muted-foreground">
          Showing {filteredTemplates.length} of {INTERACTIVE_TEMPLATES.length} Interactive templates
        </div>
      </div>

      {filteredTemplates.length ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filteredTemplates.map(template => {
            const active = activeTemplateId === template.id;
            return (
              <article
                key={template.id}
                aria-current={active ? "true" : undefined}
                className={`flex min-h-0 flex-col rounded-2xl border p-3 transition-colors ${
                  active
                    ? "border-[#2e0562]/40 bg-[#2e0562]/[0.035]"
                    : "border-border bg-card hover:border-[#2e0562]/20"
                }`}
              >
                <TemplateThumbnail template={template} />

                <div className="mt-3 flex items-start gap-2.5">
                  <span className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-[#2e0562]/8 text-[#2e0562]">
                    <TemplateIcon templateId={template.id} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3 className="text-[14px] font-bold text-foreground">
                        {template.name}
                      </h3>
                      {active && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#2e0562]/8 px-2 py-1 text-[11px] font-bold text-[#2e0562]">
                          <Check size={11} />
                          Current
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[12px] font-semibold text-[#2e0562]">
                      {template.category} · {template.motionLevel} motion
                    </div>
                  </div>
                </div>

                <p className="mt-2.5 text-[12px] leading-relaxed text-muted-foreground">
                  {template.description}
                </p>

                <div className="mt-2 text-[12px] text-muted-foreground">
                  <span className="font-semibold text-foreground/75">Best for:</span>{" "}
                  {template.bestFor}
                </div>

                <div className="mt-auto pt-3">
                  <button
                    type="button"
                    onClick={() => onApply(template.id)}
                    className={`flex h-10 w-full items-center justify-center rounded-lg px-3 text-[13px] font-semibold transition-colors ${
                      active && mode === "editor"
                        ? "border border-[#2e0562]/20 bg-background text-[#2e0562] hover:bg-[#2e0562]/5"
                        : "bg-[#2e0562] text-white hover:bg-[#2e0562]/90"
                    }`}
                  >
                    {mode === "initial"
                      ? "Use this template"
                      : active
                        ? "Reapply base"
                        : "Apply template"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-border px-5 py-12 text-center">
          <div className="text-[14px] font-semibold text-foreground">
            No templates match that search.
          </div>
          <p className="mt-1 text-[12px] text-muted-foreground">
            Try another category or search term.
          </p>
        </div>
      )}
    </div>
  );
}
