import type { ResumeData } from "./types";
import {
  getOrderedInteractiveScenes,
  type InteractiveScene,
  type InteractiveSceneObject,
} from "./resumeInteractive";
import {
  resolveInteractiveBinding,
  type ResolvedInteractiveBinding,
} from "./resumeInteractiveBindings";
import {
  buildAmbientParticles,
  type InteractiveAmbientParticle,
} from "./resumeInteractiveMotion";
import { getResumeWebExperienceState } from "./resumeWebExperience";

export interface InteractiveVisitorObject {
  object: InteractiveSceneObject;
  resolved?: ResolvedInteractiveBinding | null;
}

export interface InteractiveVisitorScene {
  scene: InteractiveScene;
  objects: InteractiveVisitorObject[];
  ambient: {
    twinkle: InteractiveAmbientParticle[];
    particles: InteractiveAmbientParticle[];
    floatingShapes: InteractiveAmbientParticle[];
  };
}

export interface InteractiveVisitorProjection {
  title: string;
  description: string;
  scenes: InteractiveVisitorScene[];
}

function asText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return String(value);
  } catch {
    return "";
  }
}

export function buildInteractiveVisitorProjection(
  data: ResumeData,
): InteractiveVisitorProjection {
  const experience = getResumeWebExperienceState(data.design).interactive;

  if (!experience) {
    throw new Error(
      "No Interactive Experience exists for this resume.",
    );
  }

  const scenes = getOrderedInteractiveScenes(experience).map(scene => ({
    scene,
    objects: scene.objectOrder
      .map(objectId => scene.objects[objectId])
      .filter(
        (object): object is InteractiveSceneObject =>
          !!object && object.geometry.hidden !== true,
      )
      .map(object => ({
        object,
        resolved:
          object.type === "resume-content"
            ? resolveInteractiveBinding(data, object.binding)
            : undefined,
      })),
    ambient: {
      twinkle: buildAmbientParticles(
        scene.id,
        "twinkle",
        scene.ambient.twinkle,
      ),
      particles: buildAmbientParticles(
        scene.id,
        "particles",
        scene.ambient.particles,
      ),
      floatingShapes: buildAmbientParticles(
        scene.id,
        "floatingShapes",
        scene.ambient.floatingShapes,
      ),
    },
  }));

  const fullName = [
    asText(data.firstName).trim(),
    asText(data.lastName).trim(),
  ]
    .filter(Boolean)
    .join(" ");

  return {
    title: fullName ? `${fullName} — Interactive Resume` : "Interactive Resume",
    description:
      asText(data.summary).trim() ||
      "Interactive resume experience",
    scenes,
  };
}
