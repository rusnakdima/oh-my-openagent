import type {
  ComponentContext,
  OmoSenpiComponent,
  SenpiExtensionAPI,
} from "../../extension/types";
import { createNativeBadgeStatus } from "./footer-badge";

export function createNativeBadgeComponent(): OmoSenpiComponent {
  return {
    name: "native-badge",
    register(pi: SenpiExtensionAPI, _ctx: ComponentContext): void {
      const badge = createNativeBadgeStatus();
      const publish = (_payload: unknown, eventCtx: unknown): undefined => {
        badge.publish(eventCtx);
        return undefined;
      };
      pi.on("session_start", publish);
      pi.on("agent_settled", publish);
    },
  };
}

export {
  createNativeBadgeStatus,
  NATIVE_BADGE_STATUS_KEY,
  NATIVE_BADGE_TEXT,
} from "./footer-badge";
