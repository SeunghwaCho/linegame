import type { App } from "./app.ts";
import type { LevelPack } from "../level/types.ts";
import type { Persistence } from "../storage/persistence.ts";
import type { Sound } from "../audio/sound.ts";

export interface SceneContext {
  app: App;
  pack: LevelPack;
  persistence: Persistence;
  sound: Sound;
}
